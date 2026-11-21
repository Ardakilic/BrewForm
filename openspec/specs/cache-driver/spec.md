# cache-driver Specification

## Purpose

Defines the API cache backend selected by `CACHE_DRIVER`: a bounded in-memory LRU cache, or a
namespaced Redis-protocol (Valkey) provider whose connections fail fast. Cache failures degrade to
cache misses, invalidations dropped during an outage are reconciled on recovery, readiness reports
cache and rate-limit store health without failing, and flush tooling stays inside the cache
namespace. It replaces the retired `remote-cache` capability.

## Requirements
### Requirement: Cache driver is selected by validated environment configuration
The API SHALL select its `CacheProvider` once at startup from `CACHE_ENABLED`, `CACHE_DRIVER` and `REDIS_URL`, validated by the Zod schema in `apps/api/src/config/env.ts`, and SHALL install it through `setCacheProvider()` before the HTTP server binds.

| Variable | Allowed values | Default | Effect |
|---|---|---|---|
| `CACHE_ENABLED` | `true` \| `false` | `true` | `false` installs `NullCacheProvider` (every read misses, every write is dropped) |
| `CACHE_DRIVER` | `memory` \| `redis` | `memory` | `memory` → bounded `InMemoryCacheProvider`, `redis` → `RedisCacheProvider` wrapped fail-soft |
| `REDIS_URL` | Redis-protocol URL (Redis or Valkey) | unset | required when `CACHE_ENABLED=true` and `CACHE_DRIVER=redis` |
| `CACHE_MEMORY_MAX_ENTRIES` | integer 100–1 000 000 | `10000` | entry cap of the memory driver |

The cache layer SHALL run on Node 26 with `ioredis` for the redis driver. It SHALL have no dependency on Deno KV, `denokv`, `Deno.openKv()`, `DENO_KV_URL` or `DENO_KV_ACCESS_TOKEN`. Rate limiting SHALL NOT be affected by any of these variables (see `api-rate-limiting`). At startup the API SHALL log `{ enabled, driver }` at info level, with no URL or credentials.

#### Scenario: Disabled cache installs the null provider
- **WHEN** the API starts with `CACHE_ENABLED=false`
- **THEN** the singleton is a `NullCacheProvider` and a cached service read always hits the database

#### Scenario: Redis driver without URL fails validation
- **WHEN** the API starts with `CACHE_ENABLED=true`, `CACHE_DRIVER=redis` and no `REDIS_URL`
- **THEN** env validation fails with an error naming `REDIS_URL` and the process exits

#### Scenario: Unknown driver is rejected
- **WHEN** the API starts with `CACHE_DRIVER=deno-kv`
- **THEN** env validation fails

#### Scenario: No Deno KV configuration exists
- **WHEN** `apps/api/src/config/env.ts`, `compose.yml`, `compose.production.yml` and the `.env.example` files are inspected
- **THEN** none of them define `DENO_KV_URL`, `DENO_KV_ACCESS_TOKEN` or a `denokv` service

### Requirement: In-memory cache is bounded by an LRU cap and a periodic sweep
`InMemoryCacheProvider` SHALL hold at most `CACHE_MEMORY_MAX_ENTRIES` entries, evicting the least-recently-used entry when a `set` of a new key would exceed the cap, and SHALL remove expired entries with a periodic sweep, so that its memory use cannot grow without bound.

A successful `get` SHALL mark the entry as most recently used. Overwriting an existing key SHALL NOT evict another entry. The sweep SHALL run every 60 seconds on a timer created with `.unref()`, so it never keeps the process alive. `close()` SHALL clear the timer and the store. Expired entries SHALL still be treated as missing on read between sweeps. The provider SHALL log at debug level when a sweep removes entries (`{ swept, size }`), and SHALL NOT log per eviction.

#### Scenario: Cap evicts the least-recently-used key
- **WHEN** a provider with a cap of 3 stores keys `a`, `b`, `c`, reads `a`, then stores `d`
- **THEN** `b` is evicted and `a`, `c` and `d` remain readable

#### Scenario: Sweep removes expired entries that are never read again
- **WHEN** 1 000 entries are stored with a 1-second TTL and fake time advances 61 seconds without reading them
- **THEN** the provider's size is 0

#### Scenario: Unique keys cannot grow memory without bound
- **WHEN** 50 000 distinct keys are written to a provider with the default cap
- **THEN** the provider holds at most 10 000 entries

#### Scenario: Close stops the sweep timer
- **WHEN** `close()` is called
- **THEN** the sweep interval is cleared and subsequent reads return null

### Requirement: Redis cache provider uses namespaced standard commands
`RedisCacheProvider` SHALL prefix every key with `brewform:`, store JSON-serialised values with `SET … PX <ttlMs>` when a TTL is given, delete single keys with `DEL`, and delete prefixes with `SCAN MATCH brewform:<escaped-prefix>*` followed by `DEL`. It SHALL NEVER use `KEYS` or `FLUSHDB`/`FLUSHALL`.

Glob metacharacters in a prefix SHALL be escaped so that the prefix is matched literally. An empty prefix SHALL match only `brewform:*`. Rate-limit keys live under the separate root `brewform-rl:`, which `brewform:*` does not match, so no cache operation can delete them.

#### Scenario: TTL maps to PX milliseconds
- **WHEN** `set(['a','b'], v, { ttlMs: 1500 })` is called
- **THEN** the client receives `SET brewform:a:b <json> PX 1500`

#### Scenario: Empty-prefix delete is scoped to the cache namespace
- **WHEN** `deleteByPrefix([])` runs against a server holding `brewform:x`, `brewform-rl:global:1.2.3.4` and `other:y`
- **THEN** only `brewform:x` is deleted

### Requirement: Redis cache connections fail fast
The redis cache client SHALL be created with `enableOfflineQueue: false`, `maxRetriesPerRequest: 1`, a command timeout of at most 500 ms and a connect timeout of at most 2000 ms, keeping ioredis's default background reconnect strategy, so that no cache command waits longer than the command timeout while the server is down or slow.

The client factory SHALL live in `apps/api/src/utils/redis/client.ts` and SHALL be shared by the cache and the rate limiter, each of which opens its own connection. Graceful shutdown SHALL close both connections.

#### Scenario: Cache call against a stopped server returns quickly
- **WHEN** Valkey is stopped and a service performs a cache `get`
- **THEN** the call settles within 500 ms (plus scheduling slack) instead of waiting for ioredis's default 20 retries

#### Scenario: Shutdown closes the cache connection
- **WHEN** the API receives `SIGTERM` with `CACHE_DRIVER=redis`
- **THEN** the cache client's connection is closed before the process exits

### Requirement: Cache backend failures degrade to cache misses
A failure of the cache backend SHALL NEVER propagate to a service or turn into an HTTP error: the redis driver SHALL be wrapped in a fail-soft decorator (`apps/api/src/utils/cache/failSoft.ts`) that turns a failed `get` into `null` and a failed `set`, `delete` or `deleteByPrefix` into a no-op.

The decorator SHALL log `warn` once when the backend starts failing (`{ driver: 'redis', err }`) and `info` once when an operation next succeeds (`{ driver: 'redis', droppedOps }`). It SHALL NOT log on every failed call. `GET /health` and `GET /ready` SHALL keep returning their normal status while the cache backend is down.

#### Scenario: Read during outage is a miss, not a 500
- **WHEN** Valkey is down and a client requests an endpoint whose service reads the cache first
- **THEN** the endpoint answers with its normal 2xx status using database data

#### Scenario: Write during outage does not fail the request
- **WHEN** Valkey is down and an authenticated user updates a recipe, which triggers cache invalidation
- **THEN** the update succeeds with its normal status

#### Scenario: Outage is logged once
- **WHEN** 200 cache operations fail during one outage and the next one succeeds
- **THEN** exactly one degraded warn log and one recovery info log are emitted

### Requirement: Invalidations dropped during an outage are reconciled on recovery
When at least one `delete` or `deleteByPrefix` was dropped during an outage, the fail-soft decorator SHALL perform one full cache-namespace flush (`deleteByPrefix([])`) after the first successful operation following that outage, so that entries made stale while invalidations were lost are not served after recovery.

The reconciliation flush SHALL run asynchronously (it never delays the request that observed recovery), SHALL be logged at info level (`{ driver: 'redis', reason: 'dropped-invalidations' }`), and SHALL NOT touch the rate-limit root `brewform-rl:`.

#### Scenario: Stale entry is not served after recovery
- **WHEN** a cached recipe detail exists, Valkey goes down, the recipe is updated (invalidation dropped), and Valkey comes back with the old entry
- **THEN** after the first successful cache operation the reconciliation flush removes the old entry, and the next detail read returns the updated recipe

#### Scenario: Outage with only reads does not flush
- **WHEN** only `get` calls failed during an outage
- **THEN** no reconciliation flush runs on recovery

### Requirement: Readiness reports cache and rate-limit store health without failing
`GET /ready` SHALL include `cache` and `rateLimitStore` fields in its JSON body, each one of `ok`, `degraded`, `memory` or `disabled`, and SHALL base its HTTP status only on database connectivity, so that an optional Valkey outage never marks the API unready.

The `/ready` `describeRoute()` metadata SHALL document the added fields.

#### Scenario: Valkey down keeps readiness green
- **WHEN** the database is reachable, `CACHE_DRIVER=redis`, `RATE_LIMIT_STORE=redis`, and Valkey is down
- **THEN** `GET /ready` returns 200 with `cache: 'degraded'` and `rateLimitStore: 'degraded'`

#### Scenario: Memory deployment reports memory
- **WHEN** `CACHE_DRIVER=memory` and `RATE_LIMIT_STORE=memory`
- **THEN** `GET /ready` returns `cache: 'memory'` and `rateLimitStore: 'memory'`

### Requirement: Cache flush tooling is scoped to the cache namespace
`apps/api/scripts/flush-cache.ts` (`make flush-cache`) and the admin "flush all" action SHALL delete only keys in the cache namespace, and SHALL NEVER delete rate-limit keys or keys belonging to other applications on a shared server.

With the memory driver or `CACHE_ENABLED=false`, the script SHALL print that there is nothing shared to flush and exit 0.

#### Scenario: flush-cache leaves rate-limit state intact
- **WHEN** `make flush-cache` runs with `CACHE_DRIVER=redis` while `brewform-rl:*` keys exist
- **THEN** all `brewform:*` keys are deleted and every `brewform-rl:*` key remains

#### Scenario: flush-cache on memory driver is a no-op
- **WHEN** `make flush-cache` runs with `CACHE_DRIVER=memory`
- **THEN** it prints "Memory cache driver is process-local; nothing to flush." and exits 0

### Requirement: Cache driver has regression test coverage
`apps/api/src/utils/cache/cache.test.ts` (and a co-located `failSoft.test.ts`) SHALL cover the LRU cap, recency on read, the expiry sweep with Vitest fake timers, `close()`, namespace scoping, fail-soft behaviour with a rejecting client double, single-transition logging, the reconciliation flush, and env validation of `CACHE_MEMORY_MAX_ENTRIES` in `apps/api/src/config/env.test.ts`.

#### Scenario: Cache suite passes
- **WHEN** `make test-specific filter=apps/api/src/utils/cache` runs
- **THEN** every listed case passes

#### Scenario: Env validation rejects an out-of-range cap
- **WHEN** `envSchema.safeParse` receives `CACHE_MEMORY_MAX_ENTRIES=10`
- **THEN** parsing fails with an error naming `CACHE_MEMORY_MAX_ENTRIES`

