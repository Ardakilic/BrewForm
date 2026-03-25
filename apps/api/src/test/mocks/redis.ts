/**
 * Mock for src/utils/redis/index.ts
 * Redirected via import_map.json during deno test runs.
 */

import { spy } from "@std/testing/mock";

export const redis = {
  get: spy(() => Promise.resolve(null)),
  set: spy(() => Promise.resolve("OK" as const)),
  del: spy(() => Promise.resolve(1)),
  incr: spy(() => Promise.resolve(1)),
  expire: spy(() => Promise.resolve(1)),
};

export function getRedis() {
  return redis;
}

// Create object with methods that can be stubbed
const redisUtils = {
  checkRedisConnection(): Promise<boolean> {
    return Promise.resolve(true);
  },

  checkRateLimit(
    _identifier: string,
    _action: string,
    _maxRequests: number,
    _windowMs: number,
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
  }> {
    return Promise.resolve({
      allowed: true,
      remaining: 99,
      resetAt: Date.now() + 60000,
    });
  },

  invalidateCache(_pattern: string): Promise<void> {
    return Promise.resolve(undefined);
  },

  cacheGetOrSet<T>(
    _key: string,
    fetcher: () => Promise<T>,
    _ttl?: number,
  ): Promise<T> {
    return fetcher();
  },
};

// Export wrapper functions that call the object methods
// This allows stubbing to work correctly
export function checkRedisConnection(): Promise<boolean> {
  return redisUtils.checkRedisConnection();
}

export function checkRateLimit(
  identifier: string,
  action: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  return redisUtils.checkRateLimit(identifier, action, maxRequests, windowMs);
}

export function invalidateCache(pattern: string): Promise<void> {
  return redisUtils.invalidateCache(pattern);
}

export function cacheGetOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number,
): Promise<T> {
  return redisUtils.cacheGetOrSet(key, fetcher, ttl);
}

// Export the object for stubbing
export default redisUtils;

export const CacheKeys = {
  user: (id: string) => `user:${id}`,
  userByUsername: (username: string) => `user:username:${username}`,
  recipe: (id: string) => `recipe:${id}`,
  recipeBySlug: (slug: string) => `recipe:slug:${slug}`,
  recipeList: (key: string) => `recipes:list:${key}`,
  equipment: (type: string, id: string) => `equipment:${type}:${id}`,
  vendor: (id: string) => `vendor:${id}`,
  coffee: (id: string) => `coffee:${id}`,
  latestRecipes: () => "recipes:latest",
  popularRecipes: () => "recipes:popular",
  brewMethods: () => "brew-methods",
  drinkTypes: () => "drink-types",
};
