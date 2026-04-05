/**
 * Health Check Routes - Orchestration Health Probes
 * ==================================================
 * 
 * Mục đích:
 * - Cung cấp health check endpoints cho container orchestration
 * - Used by Kubernetes, Docker Compose, load balancers
 * - Giúp auto-recovery nếu service unhealthy
 * 
 * Endpoints:
 * 1. GET /health - Overall health status (0-2s response time)
 * 2. GET /health/ready - Readiness probe (can accept traffic?)
 * 3. GET /health/live - Liveness probe (is process alive?)
 * 
 * Health Check Diagram:
 * Container Start
 *   ├─ /health/live → 200 (process started)
 *   ├─ (wait) → connect databases
 *   ├─ /health/ready → 200 (ready for traffic)
 *   └─ Kubernetes routes traffic
 *
 * If service crashes:
 * /health/live → 503/timeout
 * → Kubernetes restarts container
 * → Repeat
 * 
 * Dependencies Checked:
 * - PostgreSQL (critical)
 * - Redis (optional but preferred)
 * - Kafka (assumed connected)
 * 
 * Dùng bởi: Kubernetes, Docker Compose, ECS, etc
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { isRedisConnected, getRedisClient } from '../lib/redis';
import { HealthCheckResponse } from '../types';

const router = Router();

/**
 * GET /health
 * ===========
 * Tổng quát health status (Database + Redis + Kafka)
 * 
 * Response:
 * Success (200 - All services OK):
 * {
 *   "status": "ok",
 *   "timestamp": "2024-01-15T10:00:00Z",
 *   "uptime": 12345,
 *   "services": {
 *     "database": "connected",
 *     "redis": "connected",
 *     "kafka": "connected"
 *   }
 * }
 * 
 * Error (503 - Some services down):
 * {
 *   "status": "error",
 *   "timestamp": "2024-01-15T10:00:00Z",
 *   "uptime": 12345,
 *   "services": {
 *     "database": "disconnected",
 *     "redis": "connected",
 *     "kafka": "connected"
 *   }
 * }
 * 
 * HTTP Status:
 * - 200: All critical services OK
 * - 503: Any critical service down
 * - 500: Unexpected error
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();

    // ===== Check PostgreSQL Database =====
    // Critical: if DB down, service can't work
    let dbStatus: 'connected' | 'disconnected' = 'disconnected';
    try {
      await prisma.$queryRaw`SELECT 1`; // Simple ping query
      dbStatus = 'connected';
    } catch (error) {
      console.warn('⚠️ Database health check failed:', error);
    }

    // ===== Check Redis Cache =====
    // Optional: service can work without Redis (just slower)
    let redisStatus: 'connected' | 'disconnected' = 'disconnected';
    if (isRedisConnected()) {
      try {
        const redis = getRedisClient();
        await redis.ping(); // Ping Redis
        redisStatus = 'connected';
      } catch (error) {
        console.warn('⚠️ Redis health check failed:', error);
      }
    }

    // ===== Check Kafka =====
    // TODO: Implement proper Kafka health check
    // For now, assume always connected (will be checked in consumer.ts)
    const kafkaStatus: 'connected' | 'disconnected' = 'connected';

    const uptime = Date.now() - startTime;

    // ===== Return Response =====
    const response: HealthCheckResponse = {
      status: dbStatus === 'connected' && redisStatus === 'connected' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptime,
      services: {
        database: dbStatus,
        redis: redisStatus,
        kafka: kafkaStatus,
      },
    };

    res.status(response.status === 'ok' ? 200 : 503).json(response);
  } catch (error) {
    console.error('❌ Health check error:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      uptime: 0,
      services: {
        database: 'disconnected',
        redis: 'disconnected',
        kafka: 'disconnected',
      },
    });
  }
});

/**
 * GET /health/ready
 * =================
 * Readiness Probe - Can service accept traffic?
 * 
 * Used by: Kubernetes readinessProbe
 * 
 * Response:
 * Ready (200):
 * {"ready": true, "timestamp": "2024-01-15T10:00:00Z"}
 * 
 * Not Ready (503):
 * {"ready": false, "timestamp": "2024-01-15T10:00:00Z"}
 * 
 * Checks:
 * - Database must be connected (if disconnected, can't serve)
 * - Redis should be connected (optional but preferred)
 * 
 * Kubernetes Behavior:
 * - 200 → Add pod to load balancer
 * - 503+ → Remove from load balancer, retry in 10s
 */
router.get('/ready', async (_req: Request, res: Response): Promise<void> => {
  try {
    // ===== Check Critical Dependencies =====
    let isReady = true;

    // ===== 1. Database Must Be Connected =====
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      isReady = false;
      console.warn('❌ Database not ready');
    }

    // ===== 2. Redis Should Be Connected =====
    // (Optional but affects performance)
    if (isRedisConnected()) {
      try {
        const redis = getRedisClient();
        await redis.ping();
      } catch {
        isReady = false;
        console.warn('❌ Redis not ready');
      }
    }

    // ===== Return Response =====
    if (isReady) {
      res.status(200).json({ ready: true, timestamp: new Date().toISOString() });
    } else {
      res.status(503).json({ ready: false, timestamp: new Date().toISOString() });
    }
  } catch (error) {
    console.error('❌ Readiness check error:', error);
    res.status(503).json({ ready: false, timestamp: new Date().toISOString() });
  }
});

/**
 * GET /health/live
 * ================
 * Liveness Probe - Is process alive?
 * 
 * Used by: Kubernetes livenessProbe
 * 
 * Response (Always 200 if process is running):
 * {"alive": true, "timestamp": "2024-01-15T10:00:00Z"}
 * 
 * Kubernetes Behavior:
 * - 200 → Process is alive
 * - No response (timeout) → Process likely dead
 * - Kubernetes restarts if fail
 * 
 * This probe is very simple - just checks if process is responding
 * If you need to restart service on dependency failure, use /health/ready
 */
router.get('/live', (_req: Request, res: Response): void => {
  res.status(200).json({ alive: true, timestamp: new Date().toISOString() });
});

export default router;
