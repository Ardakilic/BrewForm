/**
 * Mock for src/utils/redis/index.ts
 * Redirected via import_map.json during deno test runs.
 */

import { mockFn } from "../mock-fn.ts";

export const redis = {
  get: mockFn<Promise<string | null>>(() => Promise.resolve(null)),
  set: mockFn<Promise<"OK">>(() => Promise.resolve("OK" as const)),
  del: mockFn<Promise<number>>(() => Promise.resolve(1)),
  incr: mockFn<Promise<number>>(() => Promise.resolve(1)),
  expire: mockFn<Promise<number>>(() => Promise.resolve(1)),
};

export function getRedis() {
  return redis;
}

export const checkRedisConnection = mockFn<Promise<boolean>>(
  () => Promise.resolve(true),
);

export const checkRateLimit = mockFn(() =>
  Promise.resolve({ allowed: true, remaining: 99, resetAt: Date.now() + 60000 })
);

export const invalidateCache = mockFn<Promise<void>>(
  () => Promise.resolve(undefined),
);

export const cacheGetOrSet = mockFn(
  (...args: unknown[]) => (args[1] as () => Promise<unknown>)(),
);

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

export function resetRedisMocks(): void {
  redis.get.mockReset();
  redis.set.mockReset();
  redis.del.mockReset();
  redis.incr.mockReset();
  redis.expire.mockReset();
  checkRedisConnection.mockReset();
  checkRateLimit.mockReset();
  invalidateCache.mockReset();
  cacheGetOrSet.mockReset();
}
