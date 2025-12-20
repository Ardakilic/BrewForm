/**
 * BrewForm Redis Client
 * Redis client singleton for caching and rate limiting
 */

import Redis from 'ioredis';
import { getConfig } from '../../config/index.js';
import { getLogger } from '../logger/index.js';

// Singleton instance
let redisInstance: Redis | null = null;

/**
 * Get the Redis client instance (singleton pattern)
 */
export function getRedis(): Redis {
  if (!redisInstance) {
    const config = getConfig();
    const logger = getLogger();

    redisInstance = new Redis(config.redisUrl, {
      password: config.redisPassword || undefined,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.error({
            type: 'redis',
            operation: 'connection',
            message: 'Max retries reached',
          });
          return null;
        }
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
    });

    redisInstance.on('connect', () => {
      logger.info({ type: 'redis', operation: 'connect', message: 'Connected to Redis' });
    });

    redisInstance.on('error', (error) => {
      logger.error({
        type: 'redis',
        operation: 'error',
        error: error.message,
      });
    });

    redisInstance.on('close', () => {
      logger.info({ type: 'redis', operation: 'close', message: 'Redis connection closed' });
    });
  }

  return redisInstance;
}

/**
 * Disconnect from Redis
 */
export async function disconnectRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
    getLogger().info('Redis client disconnected');
  }
}

/**
 * Check Redis connectivity
 */
export async function checkRedisConnection(): Promise<boolean> {
  try {
    const redis = getRedis();
    const result = await redis.ping();
    return result === 'PONG';
  } catch (error) {
    getLogger().error({
      type: 'redis',
      operation: 'health_check',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Cache helper - get or set with TTL
 */
export async function cacheGetOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds = 300
): Promise<T> {
  const redis = getRedis();
  const cached = await redis.get(key);

  if (cached) {
    return JSON.parse(cached) as T;
  }

  const data = await fetcher();
  await redis.setex(key, ttlSeconds, JSON.stringify(data));
  return data;
}

/**
 * Invalidate cache by key pattern
 */
export async function invalidateCache(pattern: string): Promise<number> {
  const redis = getRedis();
  const keys = await redis.keys(pattern);
  
  if (keys.length === 0) {
    return 0;
  }

  return await redis.del(...keys);
}

/**
 * Rate limit check
 */
export async function checkRateLimit(
  identifier: string,
  action: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const redis = getRedis();
  const key = `ratelimit:${action}:${identifier}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  // Remove old entries
  await redis.zremrangebyscore(key, 0, windowStart);

  // Count requests in window
  const count = await redis.zcard(key);

  if (count >= maxRequests) {
    const oldestEntry = await redis.zrange(key, 0, 0, 'WITHSCORES');
    const resetAt = oldestEntry.length > 1 ? Number.parseInt(oldestEntry[1]) + windowMs : now + windowMs;
    
    return {
      allowed: false,
      remaining: 0,
      resetAt,
    };
  }

  // Add new request
  await redis.zadd(key, now, `${now}`);
  await redis.pexpire(key, windowMs);

  return {
    allowed: true,
    remaining: maxRequests - count - 1,
    resetAt: now + windowMs,
  };
}

/**
 * Cache keys namespace
 */
export const CacheKeys = {
  user: (id: string) => `user:${id}`,
  userByUsername: (username: string) => `user:username:${username}`,
  recipe: (id: string) => `recipe:${id}`,
  recipeBySlug: (slug: string) => `recipe:slug:${slug}`,
  recipeList: (filters: string) => `recipes:list:${filters}`,
  equipment: (type: string, id: string) => `equipment:${type}:${id}`,
  vendor: (id: string) => `vendor:${id}`,
  coffee: (id: string) => `coffee:${id}`,
  latestRecipes: () => 'recipes:latest',
  popularRecipes: () => 'recipes:popular',
  brewMethods: () => 'brew-methods',
  drinkTypes: () => 'drink-types',
};

export const redis = {
  get: getRedis,
  disconnect: disconnectRedis,
  checkConnection: checkRedisConnection,
  cacheGetOrSet,
  invalidateCache,
  checkRateLimit,
  keys: CacheKeys,
};

export default redis;
