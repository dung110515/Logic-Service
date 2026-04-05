/**
 * Redis Client Initialization & Management
 * =======================================
 * 
 * Mục đích:
 * - Connect to Redis cache server
 * - Singleton pattern: one client per process
 * - Handle reconnection automatically
 * - Provide helper functions for cache operations
 * 
 * Redis Use Cases in This Service:
 * 1. Course context caching (24-hour TTL)
 *    - Student course list + student enrollments
 *    - Expensive to compute (multiple DB queries)
 *    - Cached to avoid redundant calculations
 * 
 * 2. Grade statistics caching (24-hour TTL)
 *    - Average score per course
 *    - Grade distribution
 *    - Submission rates
 * 
 * 3. Session data (if needed)
 *    - Could store temporary data across requests
 *    - TTL-based expiration
 * 
 * Redis vs Database:
 * - Redis: very fast (in-memory), short-lived data, TTL-based
 * - PostgreSQL: persistent, complex queries, permanent storage
 * 
 * Example Cache Usage in contextService:
 * ```typescript
 * // Check cache first
 * const cached = await redis.get(`context:${courseId}`);
 * if (cached) return JSON.parse(cached);  // Hit!
 * 
 * // Cache miss: compute from DB
 * const context = await fetchFromDatabase();
 * 
 * // Store in cache (24 hours)
 * await redis.setex(`context:${courseId}`, 86400, JSON.stringify(context));
 * 
 * return context;
 * ```
 * 
 * Performance Example:
 * - First request: 100ms (DB query)
 * - Cached request: 2ms (Redis lookup)
 * - 50x faster!
 */

import Redis from 'ioredis';
import { config } from '../config/env';

/**
 * Global Redis Client Instance
 * ============================
 * 
 * Singleton: only one client per Node.js process
 * Null until first connection
 * Set to null again after closeRedisConnection()
 * 
 * Why singleton?
 * - Redis connections are pooled
 * - Multiple clients = multiple pools = unnecessary overhead
 * - One client reuses connection pool
 */
let redisClient: Redis | null = null;

/**
 * Get or Create Redis Client
 * =========================
 * 
 * First call: connects to Redis, returns client
 * Subsequent calls: returns cached instance
 * 
 * Connection Details:
 * - Read from config.redisUrl (from .env)
 * - Format: redis://[:password@]host:port/db
 * - Examples:
 *   - redis://localhost:6379/0 (local, no auth, db 0)
 *   - redis://:password@redis.io:6379/1 (with auth, db 1)
 *   - redis://redis-prod.cloud:6380/0 (cloud provider)
 * 
 * Configuration:
 * - retryStrategy: exponential backoff on failure
 *   - 1st retry: 50ms
 *   - 2nd retry: 100ms
 *   - ...
 *   - Cap at 2000ms max
 * 
 * Events:
 * - connect: successful connection
 * - reconnecting: attempting to reconnect after disconnect
 * - error: connection error occurred
 * - close: connection closed and won't retry
 * 
 * @returns Redis client instance (connected)
 * @throws Error if connection fails and can't retry
 * @exported Used throughout codebase for cache operations
 */
export const getRedisClient = (): Redis => {
  // If already connected, return cached instance
  if (redisClient) {
    return redisClient;
  }

  // ===== Parse Redis URL =====
  // Format: redis://[:password@]host:port/db
  // Examples:
  // - redis://localhost:6379/0
  // - redis://:mypass@redis.io:6379/1
  const redisUrl = new URL(config.redisUrl);
  const host = redisUrl.hostname || 'localhost';
  const port = parseInt(redisUrl.port || '6379', 10);
  const password = redisUrl.password || undefined;
  const dbNum = parseInt(redisUrl.pathname.slice(1) || '0', 10);

  // ===== Create Redis Client =====
  redisClient = new Redis({
    host,
    port,
    password,
    db: dbNum,  // DB 0 by default, can be 0-15
    
    // ===== Connection Settings =====
    // Exponential backoff retry strategy
    // If connection fails: retry with increasing delays
    retryStrategy: (times: number) => {
      // Calculate delay: (times * 50) max 2000ms
      // 1st: 50ms, 2nd: 100ms, 3rd: 150ms, ... capped at 2000ms
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  // ===== Event Handlers =====

  /**
   * Connect: Successfully connected to Redis
   */
  redisClient.on('connect', () => {
    console.log('✅ Redis connected');
  });

  /**
   * Reconnecting: Connection lost, attempting to reconnect
   */
  redisClient.on('reconnecting', () => {
    console.log('🔄 Redis reconnecting...');
  });

  /**
   * Error: Connection error occurred
   * Not fatal: ioredis will attempt to reconnect
   */
  redisClient.on('error', (err: Error) => {
    console.error('❌ Redis error:', err.message);
  });

  /**
   * Close: Connection permanently closed
   * Won't retry anymore
   */
  redisClient.on('close', () => {
    console.warn('⚠️ Redis connection closed');
  });

  return redisClient;
};

/**
 * Close Redis Connection (Graceful Shutdown)
 * ==========================================
 * 
 * Called during application shutdown (index.ts):
 * - Leave connection open state cleanly
 * - Flush pending commands
 * - Close pooled connections
 * - Clean up resources
 * 
 * Graceful shutdown sequence:
 * 1. redis.quit() - finish pending commands
 * 2. Set redisClient = null
 * 3. Next request will reconnect via getRedisClient()
 * 
 * Important for:
 * - Kubernetes: pod termination
 * - Docker: container stop
 * - Development: Hot reloads
 * - Not leaving "hung" connections
 * 
 * If quit() fails: fallback to disconnect()
 * (quit waits for pending, disconnect is immediate)
 * 
 * @exported Used in index.ts shutdown()
 */
export const closeRedisConnection = async (): Promise<void> => {
  if (redisClient) {
    try {
      // Graceful close: finish pending commands
      await redisClient.quit();
      console.log('✅ Redis connection closed gracefully');
      redisClient = null;
    } catch (err) {
      // If quit fails: force disconnect
      console.error('❌ Error closing Redis:', err);
      redisClient?.disconnect();
      redisClient = null;
    }
  }
};

/**
 * Check if Redis is Connected
 * ==========================
 * 
 * Used in health checks:
 * - GET /health - check if cache available
 * - GET /health/ready - check dependencies
 * 
 * Status values:
 * - 'ready': connected and ready for commands
 * - 'connecting': attempting to connect
 * - 'wait': waiting to reconnect
 * - 'offline': not connected
 * - 'end': connection closed
 * 
 * @returns true if status is 'ready', false otherwise
 * @exported Used in health.ts endpoint
 */
export const isRedisConnected = (): boolean => {
  return redisClient?.status === 'ready';
};

/**
 * Export Default Instance
 * ======================
 * 
 * Lazy initialization pattern:
 * - On first import: creates connection
 * - On subsequent imports: returns cached instance
 * - Safe for top-level imports in modules
 * 
 * Usage:
 * import redis from '../lib/redis'  // Gets connected client
 * 
 * Or use function:
 * import { getRedisClient } from '../lib/redis'
 * const redis = getRedisClient();  // Same client
 */
export default getRedisClient();
