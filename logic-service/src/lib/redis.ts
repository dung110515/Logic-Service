import Redis from 'ioredis';
import { config } from '../config/env';

let redisClient: Redis | null = null;

export const getRedisClient = (): Redis => {

  if (redisClient) {
    return redisClient;
  }

  const redisUrl = new URL(config.redisUrl);
  const host = redisUrl.hostname || 'localhost';
  const port = parseInt(redisUrl.port || '6379', 10);
  const password = redisUrl.password || undefined;
  const dbNum = parseInt(redisUrl.pathname.slice(1) || '0', 10);

  redisClient = new Redis({
    host,
    port,
    password,
    db: dbNum,

    retryStrategy: (times: number) => {

      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  redisClient.on('connect', () => {
    console.log('✅ Redis connected');
  });

  redisClient.on('reconnecting', () => {
    console.log('🔄 Redis reconnecting...');
  });

  redisClient.on('error', (err: Error) => {
    console.error('❌ Redis error:', err.message);
  });

  redisClient.on('close', () => {
    console.warn('⚠️ Redis connection closed');
  });

  return redisClient;
};

export const closeRedisConnection = async (): Promise<void> => {
  if (redisClient) {
    try {

      await redisClient.quit();
      console.log('✅ Redis connection closed gracefully');
      redisClient = null;
    } catch (err) {

      console.error('❌ Error closing Redis:', err);
      redisClient?.disconnect();
      redisClient = null;
    }
  }
};

export const isRedisConnected = (): boolean => {
  return redisClient?.status === 'ready';
};

export default getRedisClient();
