/**
 * Health Check Routes
 * Cung cấp health check endpoint cho orchestration services (Kubernetes, Docker, v.v.)
 * 
 * Endpoints:
 * - GET /health - Tổng quát health status
 * - GET /health/ready - Readiness probe (sẵn sàng xử lý traffic)
 * - GET /health/live - Liveness probe (process còn sống)
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { isRedisConnected, getRedisClient } from '../lib/redis';
import { HealthCheckResponse } from '../types';

const router = Router();

/**
 * GET /health
 * Tổng quát health check
 * Kiểm tra: database, redis, kafka
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();

    // ===== Check Database =====
    let dbStatus: 'connected' | 'disconnected' = 'disconnected';
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch (error) {
      console.warn('⚠️ Database health check failed:', error);
    }

    // ===== Check Redis =====
    let redisStatus: 'connected' | 'disconnected' = 'disconnected';
    if (isRedisConnected()) {
      try {
        const redis = getRedisClient();
        await redis.ping();
        redisStatus = 'connected';
      } catch (error) {
        console.warn('⚠️ Redis health check failed:', error);
      }
    }

    // ===== Check Kafka =====
    // TODO: Implement Kafka health check
    // For now, always assumed connected (will be implemented in consumer.ts)
    const kafkaStatus: 'connected' | 'disconnected' = 'connected';

    const uptime = Date.now() - startTime;

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
 * Readiness Probe - Kubernetes/Docker sẽ dùng để kiểm tra xem pod có sẵn sàng nhận traffic không
 * Trả về 200 nếu tất cả dependencies sẵn sàng, 503 nếu chưa
 */
router.get('/ready', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Check critical dependencies
    let isReady = true;

    // 1. Database must be connected
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      isReady = false;
    }

    // 2. Redis must be connected (optional but preferred)
    if (isRedisConnected()) {
      try {
        const redis = getRedisClient();
        await redis.ping();
      } catch {
        isReady = false;
      }
    }

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
 * Liveness Probe - Kubernetes/Docker sẽ dùng để kiểm tra xem process còn sống không
 * Luôn trả về 200 nếu process còn chạy
 */
router.get('/live', (_req: Request, res: Response): void => {
  res.status(200).json({ alive: true, timestamp: new Date().toISOString() });
});

export default router;
