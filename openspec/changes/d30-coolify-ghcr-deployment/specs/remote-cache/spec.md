# Remote Cache

The API connects to a remote `denokv` server (sidecar container) for its Deno KV cache when
`CACHE_DRIVER=deno-kv`, configurable via `DENO_KV_URL` and `DENO_KV_ACCESS_TOKEN`. A `denokv`
service is added to `compose.yml` (shared across the `dev` and `prod` profiles) so local and
remote share the same cache topology. The existing `CACHE_DRIVER=memory` path is retained as the
dev/test fallback and requires no `denokv` service.

The current cache-init code is at `apps/api/src/main.ts:126-131`:
```ts
if (config.CACHE_DRIVER === 'deno-kv') {
  kv = await Deno.openKv();
  setCacheProvider(createCacheProvider('deno-kv', kv));
  logger.info('Deno KV cache initialized');
} else {
  setCacheProvider(createCacheProvider('memory'));
  logger.info('In-memory cache initialized');
}
```
The `CacheProvider` abstraction (`apps/api/src/utils/cache/index.ts`) and `DenoKVCacheProvider`
are unchanged — only the `Deno.openKv()` call site changes to accept a URL.

## ADDED Requirements

### Requirement: API connects to remote Deno KV via DENO_KV_URL

When `CACHE_DRIVER=deno-kv`, the API SHALL call
`Deno.openKv(Deno.env.get('DENO_KV_URL') ?? 'http://denokv:4512')` to obtain the `Deno.Kv` handle,
connecting to the remote `denokv` sidecar server over the KV Connect HTTP protocol. The
`DENO_KV_ACCESS_TOKEN` env var SHALL be set in the API's environment and is read automatically by
the Deno runtime as the bearer token for the KV Connect protocol's metadata-exchange
`Authorization: Bearer <token>` header.

The exact code change at `apps/api/src/main.ts:126-131` SHALL be:
```ts
if (config.CACHE_DRIVER === 'deno-kv') {
  const kvUrl = Deno.env.get('DENO_KV_URL') ?? 'http://denokv:4512';
  logger.info({ url: kvUrl }, 'Deno KV cache connecting to remote server');
  kv = await Deno.openKv(kvUrl);
  setCacheProvider(createCacheProvider('deno-kv', kv));
  logger.info('Deno KV cache initialized (remote)');
} else {
  setCacheProvider(createCacheProvider('memory'));
  logger.info('In-memory cache initialized');
}
```

When `DENO_KV_URL` is unset, the API SHALL fall back to `http://denokv:4512` (the default
sidecar hostname in compose). When `CACHE_DRIVER=memory`, the `deno-kv` code path SHALL be
skipped entirely and `DENO_KV_URL` is not required.

The `CacheProvider` abstraction and `DenoKVCacheProvider` SHALL remain unchanged — the
`Deno.Kv` handle is identical whether local or remote, so all cache operations (`get`, `set`,
`delete`, `list`, `deleteByPrefix`) work without modification.

#### Scenario: API connects to denokv sidecar in prod

- **WHEN** the API starts with `CACHE_DRIVER=deno-kv`, `DENO_KV_URL=http://denokv:4512`, and
  `DENO_KV_ACCESS_TOKEN=<token>`
- **THEN** `Deno.openKv('http://denokv:4512')` is called
- **AND** the KV Connect protocol authenticates with the bearer token from
  `DENO_KV_ACCESS_TOKEN`
- **AND** cache reads/writes are stored in the `denokv` SQLite file at `/data/denokv.sqlite`
- **AND** the structured log contains `{ url: 'http://denokv:4512' }` at info level

#### Scenario: API falls back to default sidecar hostname

- **WHEN** the API starts with `CACHE_DRIVER=deno-kv` and `DENO_KV_URL` is unset
- **THEN** `Deno.openKv('http://denokv:4512')` is called (the default)
- **AND** the behavior is identical to setting `DENO_KV_URL=http://denokv:4512`

#### Scenario: Memory driver does not require DENO_KV_URL

- **WHEN** the API starts with `CACHE_DRIVER=memory`
- **THEN** `Deno.openKv()` is NOT called
- **AND** `DENO_KV_URL` and `DENO_KV_ACCESS_TOKEN` are not required
- **AND** the in-memory `Map`-based `InMemoryCacheProvider` is used
- **AND** the structured log contains "In-memory cache initialized"

#### Scenario: CacheProvider operations work unchanged

- **WHEN** the API is connected to a remote `denokv` and performs cache operations
  (`get(key)`, `set(key, value, ttl)`, `delete(key)`, `list({ prefix })`, `deleteByPrefix`)
- **THEN** the operations succeed against the remote KV
- **AND** no code changes are needed in `CacheProvider`, `DenoKVCacheProvider`,
  `InMemoryCacheProvider`, or any service that consumes the cache

---

### Requirement: flush-cache script uses remote KV URL

The `apps/api/scripts/flush-cache.ts` script (currently at line 10) SHALL call
`Deno.openKv(Deno.env.get('DENO_KV_URL') ?? 'http://denokv:4512')` instead of the current
`Deno.openKv()`, so that flushing the cache targets the remote `denokv` server when the API is
configured for remote KV.

The exact code change at `apps/api/scripts/flush-cache.ts:10` SHALL be:
```ts
// Before:
const kv = await Deno.openKv();

// After:
const kv = await Deno.openKv(Deno.env.get('DENO_KV_URL') ?? 'http://denokv:4512');
```

The script's `--allow-net` permission is already required (the current `make flush-cache` target
passes `--allow-env --allow-read --allow-write`; the implementer MUST add `--allow-net` for remote
KV connectivity — update the `make flush-cache` Makefile target to include `--allow-net`).

#### Scenario: flush-cache clears remote KV

- **WHEN** `deno run --allow-env --allow-read --allow-write --allow-net apps/api/scripts/flush-cache.ts`
  is run with `DENO_KV_URL=http://denokv:4512` set
- **THEN** the script connects to the remote `denokv` server
- **AND** all KV entries are deleted from the remote server
- **AND** stdout contains "Cleared N KV entries successfully." (or "No KV entries found to
  clear." if empty)

#### Scenario: flush-cache works without DENO_KV_URL (default)

- **WHEN** the script is run without `DENO_KV_URL` set
- **THEN** it connects to `http://denokv:4512` (the default)
- **AND** the behavior is identical to setting `DENO_KV_URL=http://denokv:4512`

---

### Requirement: DENO_KV_URL and DENO_KV_ACCESS_TOKEN in env schema

The Zod env schema in `apps/api/src/config/env.ts` SHALL include two new fields, added
immediately after the `CACHE_DRIVER` field (line 18):
```ts
CACHE_DRIVER: z.enum(['deno-kv', 'memory']).default('deno-kv'),
DENO_KV_URL: z.string().optional(),
DENO_KV_ACCESS_TOKEN: z.string().optional(),
```

Both fields are `z.string().optional()` because they are only required when
`CACHE_DRIVER=deno-kv`. The schema SHALL NOT enforce their presence via `superRefine` (to keep
the `memory` mode simple and avoid a breaking change for dev/test which uses `memory`); the
runtime `Deno.openKv()` call will fail with a clear connection error if `deno-kv` is selected
without a reachable server, which is the desired fail-fast behavior.

The `Env` type (exported as `z.infer<typeof envSchema>`) automatically includes the new fields
as `string | undefined`, so no other type changes are needed.

#### Scenario: Env schema accepts deno-kv without DENO_KV_URL

- **WHEN** `CACHE_DRIVER=deno-kv` and `DENO_KV_URL` is unset
- **THEN** env validation passes (`DENO_KV_URL` is optional)
- **AND** the API falls back to `http://denokv:4512` at runtime

#### Scenario: Env schema accepts memory without KV vars

- **WHEN** `CACHE_DRIVER=memory` and neither `DENO_KV_URL` nor `DENO_KV_ACCESS_TOKEN` is set
- **THEN** env validation passes (both are optional)
- **AND** the memory cache provider is used

#### Scenario: Env schema accepts explicit DENO_KV_URL

- **WHEN** `CACHE_DRIVER=deno-kv` and `DENO_KV_URL=http://10.0.0.5:4512` and
  `DENO_KV_ACCESS_TOKEN=abc123`
- **THEN** env validation passes
- **AND** the API connects to `http://10.0.0.5:4512` with the bearer token `abc123`

---

### Requirement: denokv sidecar service in compose

The `compose.yml` SHALL define a `denokv` service with:
- `image: ghcr.io/denoland/denokv:0.14.0` (pinned to a specific version, NOT `:latest` —
  `denokv` is pre-1.0 and CLI/protocol may change between versions)
- `command: ["--sqlite-path", "/data/denokv.sqlite", "serve", "--access-token", "${DENO_KV_ACCESS_TOKEN}"]`
  — note the flag order: `--sqlite-path` comes before the `serve` subcommand, and
  `--access-token` comes after `serve`
- `volumes: ["denokv_data:/data"]` — persists the SQLite file across container restarts
- A healthcheck (see implementation note below about the distroless image)
- `DENO_KV_ACCESS_TOKEN` is sourced from the `.env` file via compose's `${VAR}` interpolation

The `denokv` service SHALL NOT have a `profiles:` constraint (or SHALL be listed in both `dev`
and `prod` profiles) so it starts with both `make up` (infrastructure) and `make prod-up`.

The existing `app` (dev), `app-preview` (preview), and `app-prod` (prod) services SHALL add
`denokv` to their `depends_on` with `condition: service_healthy` (or `service_started` if the
healthcheck is unreliable — see implementation note).

The `denokv_data` named volume SHALL be declared in the top-level `volumes:` block.

**Implementation note on healthcheck:** The `ghcr.io/denoland/denokv:0.14.0` image is built from
`gcr.io/distroless/cc-debian12` (a minimal image with no shell, no `nc`, no `curl`). A compose
`healthcheck.test` using `["CMD-SHELL", "..."]` will fail because there is no shell. The
implementer has three options:
1. **Omit the compose healthcheck** and rely on (a) the API failing to start if `denokv` is down
   (fail-fast via `Deno.openKv()` connection error), or (b) Coolify's UI HTTP healthcheck (path
   `/` on port 4512).
2. **Use `["CMD", "denokv", ...]`** if `denokv` has a healthcheck/ping subcommand (the
   implementer must verify this against the denokv CLI — the README does not document one).
3. **Use `service_started` instead of `service_healthy`** in `depends_on` (less safe — the API
   may start before `denokv` is listening, but the API will retry the KV connection).

**Recommended:** Option 1 (omit compose healthcheck, use `service_started` in `depends_on`).
The API's `Deno.openKv()` will fail with a connection error if `denokv` isn't ready, the
container will restart, and eventually `denokv` will be up. This is simpler than fighting the
distroless image's lack of shell.

#### Scenario: denokv starts with persistent volume

- **WHEN** `docker compose --profile prod up` (or `make up`) is run
- **THEN** the `denokv` container starts and listens on port `4512`
- **AND** the SQLite file is written to `/data/denokv.sqlite` on the `denokv_data` volume
- **AND** the API container starts after `denokv` (via `depends_on`)

#### Scenario: denokv data persists across restarts

- **WHEN** the `denokv` container is stopped and restarted
- **THEN** the SQLite file on the `denokv_data` volume is retained
- **AND** previously-written KV entries are still readable by the API

#### Scenario: denokv is pinned to a specific version

- **WHEN** the `denokv` service image is inspected
- **THEN** the image is `ghcr.io/denoland/denokv:0.14.0` (not `:latest`)
- **AND** upgrades require an explicit image tag change in `compose.yml`

#### Scenario: denokv token is required

- **WHEN** the `denokv` container starts with `--access-token <token>`
- **THEN** the API must send `DENO_KV_ACCESS_TOKEN=<token>` to authenticate
- **AND** requests without the token are rejected

---

### Requirement: Split .env.example files document denokv configuration

The `.env.example` configuration SHALL be split into three files to clearly separate API
runtime env (what you paste into Coolify), web build-time env (what you set as GitHub Secrets),
and local-dev infrastructure env (what compose reads for Postgres/Garage/pgAdmin):

1. **`apps/api/.env.example`** — the complete API runtime env reference. SHALL include a
   "Cache Driver" section with `CACHE_DRIVER=deno-kv` (production default) and a "Deno KV"
   section with:
   - `DENO_KV_URL=http://denokv:4512` with a comment: "URL of the denokv server. In Coolify,
     use the denokv resource's internal hostname: http://denokv-<uuid>:4512"
   - `DENO_KV_ACCESS_TOKEN=` with a comment: "Bearer token for the denokv server. Generate
     with: openssl rand -hex 32. Must match the --access-token passed to the denokv container."
   - A `CACHE_DRIVER` comment noting that `deno-kv` requires `DENO_KV_URL` and
     `DENO_KV_ACCESS_TOKEN`.

2. **`apps/web/.env.example`** — web build-time vars only (NOT runtime). SHALL document
   `VITE_API_URL`, `VITE_PUBLIC_APP_URL`, and `VITE_LOG_LEVEL` with comments explaining these
   are set as GitHub Secrets (or `--build-arg` for local builds), not as runtime env vars. The
   web container has no runtime env.

3. **Root `.env.example`** — slimmed to local-dev infrastructure only (Postgres credentials,
   Garage S3 keys, pgAdmin credentials, `CACHE_DRIVER=memory` for dev, `DENO_KV_URL` and
   `DENO_KV_ACCESS_TOKEN` for the denokv compose service). SHALL include a header pointing to
   `apps/api/.env.example` and `apps/web/.env.example` for the full API and web env surfaces.

#### Scenario: apps/api/.env.example is the Coolify-paste reference

- **WHEN** a new operator wants to deploy the API on Coolify
- **THEN** they copy `apps/api/.env.example` and paste it into the Coolify API resource's
  Environment Variables tab (Developer view)
- **AND** `DENO_KV_URL` and `DENO_KV_ACCESS_TOKEN` are present and documented
- **AND** `CACHE_DRIVER=deno-kv` is the production default
- **AND** all API runtime env vars (DATABASE_URL, JWT_SECRET, SMTP_*, S3_*, CORS_*, ADMIN_*) are
  present in the same file

#### Scenario: apps/web/.env.example documents build-time vars only

- **WHEN** a new operator wants to configure the web image build
- **THEN** they set `VITE_API_URL` and `VITE_PUBLIC_APP_URL` as GitHub repository Secrets
- **AND** the `apps/web/.env.example` file documents this with comments
- **AND** the file clearly states these are NOT runtime env vars (Vite inlines them at build
  time)

#### Scenario: Root .env.example is usable for local dev

- **WHEN** a developer copies the root `.env.example` to `.env` for local dev
- **THEN** `CACHE_DRIVER=memory` is the default (no denokv required for dev)
- **AND** `DENO_KV_URL` and `DENO_KV_ACCESS_TOKEN` are present (used by the denokv compose
  service when `CACHE_DRIVER=deno-kv` is set, unused when `memory`)
- **AND** Postgres, Garage, and pgAdmin credentials are present for the local compose infra
- **AND** the header points to `apps/api/.env.example` and `apps/web/.env.example` for the full
  env surfaces