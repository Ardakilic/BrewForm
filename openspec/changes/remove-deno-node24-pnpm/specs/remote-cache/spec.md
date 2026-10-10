# remote-cache (delta: retire Deno KV)

## REMOVED Requirements

The Deno runtime is removed by this change, so every requirement that mandates
remote Deno KV is retired. The cache is process-local memory-only
(`CACHE_DRIVER=memory`, `InMemoryCacheProvider`); a Redis/Valkey-backed driver
is an explicit follow-up, not this change.

### Requirement: API connects to remote Deno KV via DENO_KV_URL

Retired. `Deno.openKv()` no longer exists; `main.ts` calls
`createCacheProvider(config.CACHE_DRIVER)` with `CACHE_DRIVER` restricted to
`'memory'`. No sidecar, no `DENO_KV_URL`, no access token.

#### Scenario: No remote KV connection at startup
- **WHEN** the API starts with any environment
- **THEN** `Deno.openKv()` is never called
- **AND** `DENO_KV_URL` and `DENO_KV_ACCESS_TOKEN` do not exist in config

### Requirement: flush-cache script uses remote KV URL

Retired. The script is a documented no-op (process-local memory has nothing
shared to flush).

#### Scenario: flush-cache touches no remote server
- **WHEN** the flush-cache script runs
- **THEN** it connects to no remote KV server

### Requirement: DENO_KV_URL and DENO_KV_ACCESS_TOKEN in env schema

Retired. Both fields are deleted from `env.ts`; the schema is
`CACHE_DRIVER: z.enum(['memory']).default('memory')`.

#### Scenario: Memory is the only cache driver
- **WHEN** the API starts with any environment
- **THEN** `CACHE_DRIVER` validates to `'memory'`
- **AND** `CACHE_DRIVER=deno-kv` fails env validation

### Requirement: denokv sidecar service in compose

Retired. The `denokv` service, `denokv_data` volume, `DENO_KV_*` env, and
`--unstable-*` flags are deleted from `compose.yml`, Dockerfiles, and
Coolify docs.

#### Scenario: No KV sidecar in compose
- **WHEN** `docker compose config` is rendered
- **THEN** no `denokv` service, `denokv_data` volume, or `DENO_KV_*` entry exists

### Requirement: Split .env.example files document denokv configuration

Retired. All three `.env.example` files document `CACHE_DRIVER=memory` and no
longer mention `DENO_KV_URL` / `DENO_KV_ACCESS_TOKEN`.

#### Scenario: Env examples contain no KV vars
- **WHEN** a developer reads any `.env.example`
- **THEN** `DENO_KV_URL` and `DENO_KV_ACCESS_TOKEN` are absent
