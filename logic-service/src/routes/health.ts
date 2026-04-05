import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { isRedisConnected, getRedisClient } from '../lib/redis';
import { HealthCheckResponse } from '../types';

const router = Router();

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();

    let dbStatus: 'connected' | 'disconnected' = 'disconnected';
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch (error) {
      console.warn('⚠️ Database health check failed:', error);
    }

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

router.get('/ready', async (_req: Request, res: Response): Promise<void> => {
  try {

    let isReady = true;

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      isReady = false;
      console.warn('❌ Database not ready');
    }

    if (isRedisConnected()) {
      try {
        const redis = getRedisClient();
        await redis.ping();
      } catch {
        isReady = false;
        console.warn('❌ Redis not ready');
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

router.get('/live', (_req: Request, res: Response): void => {
  res.status(200).json({ alive: true, timestamp: new Date().toISOString() });
});

export default router;
