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

export const checkRedisConnection = spy(() => Promise.resolve(true));

export const checkRateLimit = spy(() =>
  Promise.resolve({ allowed: true, remaining: 99, resetAt: Date.now() + 60000 })
);

export const invalidateCache = spy(() => Promise.resolve(undefined));

export const cacheGetOrSet = spy(
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
