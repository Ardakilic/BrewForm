/**
 * BrewForm Cache Module — Backend Factory
 *
 * Selects and initialises the cache backend based on `CACHE_DRIVER` config.
 */

import type { CacheBackend } from "./types.ts";
import type { Config } from "../../config/index.ts";

export async function createCache(cfg: Config): Promise<CacheBackend> {
  switch (cfg.cacheDriver) {
    case "redis": {
      const { RedisBackend } = await import("./backends/redis.ts");
      const backend = new RedisBackend({
        cacheRedisUrl: cfg.cacheRedisUrl,
        cacheRedisPassword: cfg.cacheRedisPassword,
      });
      await backend.init();
      return backend;
    }
    case "deno-kv":
    default: {
      const { DenoKvBackend } = await import("./backends/deno-kv.ts");
      const backend = new DenoKvBackend({
        cacheDenoKvPath: cfg.cacheDenoKvPath,
      });
      await backend.init();
      return backend;
    }
  }
}
