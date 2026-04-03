/**
 * Redis Client Singleton
 * Cấu hình kết nối Redis với connection pooling, retry strategy
 * Sử dụng ioredis để tương tác với Redis cache
 */

import Redis from 'ioredis';
import { config } from '../config/env';

/**
 * Redis client singleton instance
 * Được khởi tạo một lần duy nhất trong toàn ứng dụng
 */
let redisClient: Redis | null = null;

/**
 * Khởi tạo hoặc trả về Redis client singleton
 * @returns Redis client instance
 */
export const getRedisClient = (): Redis => {
  if (redisClient) {
    return redisClient;
  }

  // ============================================
  // Phân tích redisUrl
  // Format: redis://[:password@]host:port/db
  // ============================================
  const redisUrl = new URL(config.redisUrl);
  const host = redisUrl.hostname || 'localhost';
  const port = parseInt(redisUrl.port || '6379', 10);
  const password = redisUrl.password || undefined;
  const dbNum = parseInt(redisUrl.pathname.slice(1) || '0', 10);

  // ============================================
  // Cấu hình ioredis
  // ============================================
  redisClient = new Redis({
    host,
    port,
    password,
    db: dbNum,
    
    // ===== Connection Settings =====
    /**
     * Retry strategy: exponential backoff
     */
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000); // max 2s
      return delay;
    },
  });

  // ============================================
  // Redis Event Handlers
  // ============================================

  /**
   * Khi kết nối thành công
   */
  redisClient.on('connect', () => {
    console.log('✅ Redis connected');
  });

  /**
   * Khi kết nối lại sau lỗi
   */
  redisClient.on('reconnecting', () => {
    console.log('🔄 Redis reconnecting...');
  });

  /**
   * Khi có lỗi
   */
  redisClient.on('error', (err: Error) => {
    console.error('❌ Redis error:', err.message);
  });

  /**
   * Khi bị ngắt mà không reconnect được
   */
  redisClient.on('close', () => {
    console.warn('⚠️ Redis connection closed');
  });

  return redisClient;
};

/**
 * Đóng kết nối Redis gracefully
 * Gọi khi shutdown ứng dụng
 */
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

/**
 * Helper: Kiểm tra Redis có connected không
 */
export const isRedisConnected = (): boolean => {
  return redisClient?.status === 'ready';
};

/**
 * Export default instance (lazy initialization)
 */
export default getRedisClient();
