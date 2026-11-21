# Architecture

This document is the reference for _how_ the system is structured. Two companion docs cover the
_why_ and the _flow_:

- [`decisions.md`](decisions.md) — architectural decision records (Hono, JWT, Drizzle ORM, caching,
  rate limiting, search ranking, web data loading, module pattern, etc.)
- [`request-lifecycle.md`](request-lifecycle.md) — end-to-end trace of a request from the edge to
  the response, including middleware order, validation, error path, and side-effect path

## Monorepo Structure

BrewForm uses a pnpm workspaces monorepo (`pnpm-workspace.yaml`). Four packages:

| Package           | Purpose                                       | Runtime                                     |
| ----------------- | --------------------------------------------- | ------------------------------------------- |
| `apps/api`        | Hono backend API                              | Node 26 (`tsx --watch` in development)      |
| `apps/web`        | React SPA frontend                            | Browser (static SPA)                        |
| `packages/shared` | Types, Zod schemas, constants, utils, i18n    | Shared (api + web)                          |
| `packages/db`     | Drizzle schema, migrations, seed data, client | Server (api only)                           |

### Dependency Graph

```
apps/web ──────→ packages/shared
                       ↑
apps/api ──┬──→ packages/shared
           └──→ packages/db ──→ packages/shared
```

The frontend **never** imports from `@brewform/db`. All type sharing happens through
`@brewform/shared`.

### Package Identifiers

- `@brewform/shared` — types, schemas, constants, utils, i18n
- `@brewform/db` — Drizzle client, schema, migrations

Both are configured as pnpm workspace members in `pnpm-workspace.yaml` (`packages: ['apps/*', 'packages/*']`).

Among the utilities in `@brewform/shared` is `generateUniqueUsername(base, isTaken)`, which cleans
the base and probes `-1` … `-100` suffixes until `isTaken` reports a free username. Availability is
checked by `isUsernameTaken` and `isEmailTaken` in `apps/api/src/modules/auth/model.ts`. Both
compare case-insensitively (`eq(lower(col), lower(value))`, both sides lowered by the database)
against **every** user row, soft-deleted ones included, so they agree with the
`user_email_lower_unique` and `user_username_lower_unique` indexes on any database locale (a
deleted account's username stays reserved).

## Backend Module Pattern

Each API domain module follows a strict 3-layer pattern:

```
modules/
  recipe/
    model.ts      ← Drizzle query builder (raw data access, typed selects/inserts)
    service.ts    ← Business logic (validation, authorization, orchestration)
    index.ts      ← Controller (Hono routes, Zod validation, response formatting)
```

**Key rules:**

- **Services never import from `drizzle-orm`** directly — they import from model files
- **Models use Drizzle relational queries and typed builders** for all database access
- **Controllers validate with shared Zod schemas** — `@brewform/shared/schemas`
- **Lint suppressions are line-level only**: a single
  `// biome-ignore lint/<group>/<rule>: <justification>` comment directly above the offending line.
  File-level and range suppressions are rejected (see [Lint policy](#lint-policy)).

### Hono Context Variables

All routes share typed context variables via `AppEnv` (`apps/api/src/types/hono.ts`):

```typescript
import type { AppEnv } from '../../types/hono.ts';
const router = new Hono<AppEnv>();
// c.get('userId')    → string | null       (set by authMiddleware / optionalAuthMiddleware)
// c.get('user')      → ContextUser | null  (set by authMiddleware / optionalAuthMiddleware)
// c.get('cache')     → CacheProvider       (injected by the cache middleware in main.ts)
// c.get('requestId') → string              (set by requestIdMiddleware)
```

## Cache Architecture

All caching goes through the `CacheProvider` interface (`apps/api/src/utils/cache/index.ts`).
Nothing constructs a cache backend directly:

- `main.ts` builds exactly one provider at startup from `CACHE_ENABLED`, `CACHE_DRIVER` and
  `REDIS_URL` (validated in `apps/api/src/config/env.ts`), installs it with `setCacheProvider()`
  before the HTTP server binds, and logs `{ enabled, driver }` (never the URL).
- The cache middleware injects that same instance into every request, so handlers read it as
  `c.get('cache')`.
- Services use the process-wide singleton `cacheProvider` from `apps/api/src/utils/cache/singleton.ts`
  (several take it through a `deps` seam so unit tests can substitute it). Tests swap the singleton
  with `setCacheProvider()`, which closes the provider it replaces.

```typescript
interface CacheProvider {
  get<T>(key: string[]): Promise<T | null>;
  set<T>(key: string[], value: T, options?: { ttlMs?: number }): Promise<void>;
  delete(key: string[]): Promise<void>;
  deleteByPrefix(prefix: string[]): Promise<void>;
  close?(): Promise<void>;
  status?(): CacheStatus; // 'ok' | 'degraded' | 'memory' | 'disabled', reported by GET /ready
}
```

| `CACHE_ENABLED` / `CACHE_DRIVER` | Provider                                         | Behaviour                                                                                         |
| -------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `true` / `memory` (default)      | `InMemoryCacheProvider`                          | Process-local and bounded (below); lost on restart and not shared between replicas                |
| `true` / `redis`                 | `RedisCacheProvider` in `FailSoftCacheProvider`  | Shared Redis-protocol server via `REDIS_URL` (Valkey 9.1 in the compose files); fail-soft (below)  |
| `false`                          | `NullCacheProvider`                              | Every read misses, every write is dropped; services keep working against the database              |

**Bounded memory.** `InMemoryCacheProvider` holds at most `CACHE_MEMORY_MAX_ENTRIES` entries
(default 10 000, allowed 100–1 000 000). A successful `get` marks an entry as most recently used, and
storing a new key at the cap evicts the least-recently-used one (overwriting a key never evicts).
Expired entries read as missing and are removed by a sweep every 60 seconds on an `unref()`'d timer,
which logs `{ swept, size }` at debug level only when it removed something. `close()` stops the
timer and clears the store.

**Namespacing.** Keys are string arrays joined with `:`, e.g. `["taste-notes", "hierarchy"]`. The
redis driver prefixes every key with `brewform:`, stores JSON with `SET … PX <ttlMs>`, deletes with
`DEL`, and deletes prefixes with `SCAN MATCH brewform:<escaped-prefix>*` + `DEL` (never `KEYS` or
`FLUSHDB`). Rate-limit keys live under the separate root `brewform-rl:`, which no cache operation
can match.

**Degradation.** A cache outage never becomes an HTTP error:

- The redis client (`apps/api/src/utils/redis/client.ts`) fails fast: no offline queue, one retry,
  a 500 ms command timeout and a 2 s connect timeout, with ioredis's background reconnect.
- `FailSoftCacheProvider` (`utils/cache/failSoft.ts`) turns a failed `get` into a miss and a failed
  `set`/`delete`/`deleteByPrefix` into a no-op. It logs one warn when the backend starts failing and
  one info (with `droppedOps`) when an operation next succeeds.
- If an invalidation was dropped during the outage, the first success afterwards triggers one
  asynchronous `deleteByPrefix([])` of the `brewform:` namespace, so stale entries are not served.
- `GET /ready` reports `cache: 'degraded'` but keeps its status; only the database decides readiness.

**Independent of rate limiting.** The limiter has its own store (see
[Rate limiting](#rate-limiting)), so `CACHE_ENABLED=false` (`NullCacheProvider`) and a cache outage
no longer affect limiting. See ADR-015 in [`decisions.md`](decisions.md).

## Validation

Zod schemas live in `@brewform/shared/schemas` and are shared between frontend and backend:

- **Hard validation** — blocks save. Applied at the route boundary with `zValidator(target, schema)`
  from `@hono/zod-validator`; failures become a 400 `VALIDATION_ERROR` envelope with per-field
  `details`.
- **Soft validation** — warns but allows save. Applied in the service layer, returns warnings
  alongside data

Example: recipe creation uses `RecipeCreateSchema` (hard validation with `.superRefine()`) while
warnings like "extraction time seems short for espresso" are computed separately.

## Database rules

BrewForm targets PostgreSQL only (PostgreSQL 18 in the compose files). The rules mirror
`AGENTS.md` → "Database rules":

- **No raw SQL statements** — Drizzle ORM only. No JSONB/UUID columns (IDs are
  `$defaultFn(() => crypto.randomUUID())` strings). Query code in `model.ts` uses Drizzle builders.
  `ilike` is the accepted case-insensitive match operator. A `sql` template **fragment** is allowed
  only where Drizzle has no builder (e.g. `CASE` expressions, row-value comparisons, `NULLS LAST`)
  and only for a use listed in the accepted-exception registry of the `lint-style` spec
  ([`openspec/specs/lint-style/spec.md`](../openspec/specs/lint-style/spec.md), "Raw SQL is
  confined to an accepted-exception registry"). It must interpolate Drizzle columns and bound
  values, never concatenate user input, and must carry a `// D03 raw-SQL exception: <why>` comment
  within the 10 lines above it. `packages/shared/src/lint-policy.test.ts` enforces the registry: it
  rejects a fragment without the comment and any `sql.raw(`/`.unsafe(`, and each file's fragment
  count must match `RAW_SQL_REGISTRY`. No other Postgres-specific operators (`@@`, `%`, `~*`, JSON
  operators) in application query code.
- **Schema-level Postgres features are permitted**: index ordering, CHECK constraints, GIN indexes
  with operator classes, and extensions approved by an ADR in [`decisions.md`](decisions.md)
  (currently `pg_trgm`, ADR-017). An extension is enabled only through a
  `drizzle-kit generate --custom` migration containing `CREATE EXTENSION IF NOT EXISTS <name>;`.
- **Bounded reads** — every list or search query in `model.ts`, and every sitemap page read in the
  `deps` of `apps/api/src/routes/sitemap.ts`, applies `limit` (at most the schema's `perPage`
  maximum, or `SITEMAP_PAGE_SIZE`). Ordering, ranking and pagination happen in SQL, never by
  loading a full result set into the API process.
- **Soft deletes** — filter live rows with `isNull(t.deletedAt)`, e.g.
  `and(eq(t.id, id), isNull(t.deletedAt))` (see [Soft Deletes](#soft-deletes)).
- **Recipe visibility** — recipe listings build their visibility filter only from
  `listableRecipeCondition`/`viewableRecipeCondition` in `apps/api/src/modules/recipe/model.ts`
  (discovery surfaces pass `null`); services use `canViewRecipe`/`canListRecipe`. Nothing else
  compares `recipes.visibility` inline (enforced by `visibility.enforcement.test.ts`; admin is
  exempt). Unlisted means direct-link only.
- **Case-insensitive identifiers** — compare `user.email`/`user.username` with
  `eq(lower(col), lower(value))` using the `lower()` helper from `@brewform/db/schema`: the database
  lowers both sides, so lookups agree with the `_lower_unique` indexes on any locale. Unique generated values (recipe slugs) are claimed with
  `insert … onConflictDoNothing({ target }).returning()` inside the transaction; a `23505` is never
  caught inside a transaction (Postgres aborts the transaction).
- **Services import from model files**, never from `drizzle-orm` directly.
- **All schema changes** (tables, columns, indexes, enums, constraints) are made in
  `packages/db/src/schema.ts` (the Drizzle TypeScript schema) first. Run
  `make db-generate && make db-migrate` to auto-generate and apply the migration.
  **Never edit the generated SQL migration files manually** — manual edits break Drizzle's
  hash-based migration tracking and cause silent failures. The only hand-written migration SQL is
  the `--custom` `0018_enable_pg_trgm` shell.

## Database

### Schema Overview

33 tables and 15 enums in a single Drizzle schema (`packages/db/src/schema.ts`):

- **Core**: User, UserPreferences, Recipe, RecipeVersion
- **Recipe parts**: RecipeTasteNote, RecipeEquipment, RecipeAdditionalPreparation,
  RecipeVersionPhoto
- **Social**: Comment, UserFollow, UserRecipeLike, UserRecipeFavourite, UserRecipeRating,
  Notification (in-app notifications, F05)
- **Personal**: Collection, CollectionItem (F01), BrewLog (brew journal, F02), UserRecipeNote
  (caller-scoped private notes)
- **Assets**: Photo, Bean, Vendor, Equipment, CoffeeVariety
- **Configuration**: Setup, TasteNote, BrewMethodEquipmentRule
- **Gamification**: Badge, UserBadge
- **Moderation & account**: Report, AuditLog, PasswordReset, EquipmentDeleteRequest,
  EmailVerificationToken

Enums: `visibility`, `brew_method`, `drink_type`, `equipment_type`, `emoji_tag`, `badge_rule`,
`unit_system`, `temperature_unit`, `theme`, `date_format`, `additional_preparation_type`,
`report_status`, `coffee_variety_category`, `equipment_delete_request_status`, `notification_type`.

### Notable indexes

- **Search (ADR-017)**: the `pg_trgm` extension (migration `0018_enable_pg_trgm`) and three GIN
  `gin_trgm_ops` indexes — `recipe_title_trgm_idx`, `recipe_version_product_name_trgm_idx` and
  `recipe_version_personal_notes_trgm_idx` — serve the recipe search, which ranks and pages in SQL.
  `make db-reset` creates the extension before `db-push`, because `drizzle-kit push` does not manage
  extensions.
- **Identifiers**: `user_email_lower_unique` and `user_username_lower_unique` on `lower(<col>)`, and
  the partial `setup_user_default_unique` (at most one default setup per user).

### Soft Deletes

All main entities have a `deletedAt timestamp with time zone` field. Filter live rows with
`isNull(table.deletedAt)`, combined with the other conditions, e.g.
`and(eq(table.id, id), isNull(table.deletedAt))`. Never compare `deletedAt` with `eq` and a null
value: Drizzle binds that as `= $1`, which never matches. Use `findFirst`/`select … limit(1)`
rather than a unique lookup, since `deletedAt` is not part of a unique constraint.

### Comment Moderation (`isAdmin` Flag)

`Comment_Service.createComment` and `Comment_Service.deleteComment` both accept an `isAdmin: boolean` parameter that grants elevated permissions:

- **Replies** — when `isAdmin` is `true`, the service allows the caller to reply to any comment on any recipe, bypassing the normal recipe-owner check. When `isAdmin` is `false`, only the recipe owner may reply.
- **Deletions** — when `isAdmin` is `true`, the service allows the caller to delete any comment regardless of authorship, bypassing the normal author check. When `isAdmin` is `false`, only the comment's own author may delete it. Deleting a top-level comment also soft-deletes its live replies on the same recipe (`softDeleteReplies`) and decrements the recipe's stored `commentCount` by `1 + replies` (the admin path is the same function). The stored `commentCount` is recounted after every migration run (`packages/db/src/recount-comment-counts.ts`, run by the API image entrypoint and `make db-migrate`; `make db-recount-comments` runs it alone).

The `isAdmin` flag is derived from the authenticated user object (`c.get('user').isAdmin`) set by `authMiddleware` and forwarded by the comment router — no separate `adminMiddleware` is applied to comment routes.

Default (non-admin) behaviour: only the recipe owner may reply to a comment; only the comment's author may delete it.

### Connection Pooling

Configured via `DATABASE_URL` and `postgres-js` options:

```
DATABASE_URL=postgresql://user:pass@host:5432/brewform
```

Connection pooling is handled by the `postgres-js` driver (`max: 10`, built by
`packages/db/src/pool-options.ts` and used in `packages/db/src/index.ts`). The shared pool sends a
`statement_timeout` of `DB_STATEMENT_TIMEOUT_MS` (default 10 000 ms, `0` disables it); a query that
hits it maps to 503 `QUERY_TIMEOUT`.

## Middleware Stack

Applied in this order in `apps/api/src/main.ts`:

1. **CORS** (`corsMiddleware`) — allows the origins in `CORS_ALLOWED_ORIGINS` and exposes the
   rate-limit headers to the SPA
2. **Request ID** (`requestIdMiddleware`) — keeps a valid incoming `X-Request-ID` or generates a
   UUID, and echoes it in the response header
3. **Secure headers** (`secureHeaders`) — CSP, HSTS, `X-Frame-Options: DENY`, referrer and
   permissions policies
4. **Rate limiting** (`rateLimit(POLICIES.global)`) — `RATE_LIMIT_GLOBAL_MAX` requests per minute
   per client IP (default 100); skips `/health`, `/ready` and `GET`/`HEAD /uploads/*`
5. **Body limit** (`bodyLimitMiddleware`) — 1 MB for every route, the larger photo cap on
   `/api/v1/photos`; 413 `PAYLOAD_TOO_LARGE` before a handler buffers the body
6. **Cache injection** — `c.set('cache', cacheProvider)`
7. **Crawler** (`crawlerMiddleware`) — serves Open Graph HTML to known social/search crawlers on
   public `/recipes/:slug` paths; a missing or non-public recipe (or a failed lookup) falls
   through marked `X-Robots-Tag: noindex, nofollow`
8. **Error handler** — `app.onError(errorHandler)` (registered with `onError`, not as stack
   middleware) maps every thrown error to the error envelope
9. **`/uploads/:path{.+}`** — only with `STORAGE_DRIVER=local`; its own `uploads` policy
   (600 per minute per IP). `serveLocalUpload` (`utils/storage/serve.ts`) streams the file from
   disk (about one read chunk in memory per request, whatever the file size) and answers a 200
   with `Cache-Control: public, max-age=31536000, immutable`, because upload keys never change
   content
10. **Routes** — `app.route('/', routes)` from `apps/api/src/routes/index.ts`

Route-level middleware:

- **`authMiddleware`** — required auth (valid JWT, not banned, not deleted)
- **`optionalAuthMiddleware`** — inspect token if present, allow anonymous
- **`adminMiddleware`** — requires auth + admin role
- **Route rate-limit policies** — `rateLimit(POLICIES.x)` and `rateLimitFailures(POLICIES.x)`:
  IP-keyed policies before validation and auth, email-keyed policies after `zValidator`,
  user-keyed policies after `authMiddleware`

### Rate limiting

Every limit is a named policy in `POLICIES` (`apps/api/src/utils/rate-limit/policies.ts`; the table
with every policy and the client-facing headers is in [`api.md`](api.md#rate-limits)). The Hono
adapter `apps/api/src/middleware/rateLimit.ts` runs on `rate-limiter-flexible` 11.5.0 (ADR-016):

- **Store** — `RATE_LIMIT_STORE=memory` (default, one `RateLimiterMemory` per policy) or `redis`
  (`RateLimiterRedis` on its own ioredis connection to `REDIS_URL`, keys under
  `brewform-rl:<policy-id>:`). The store is independent of `CACHE_ENABLED`/`CACHE_DRIVER`. A redis
  error or a client that is not ready falls back to an in-memory insurance limiter with the same
  limits; `GET /ready` reports `rateLimitStore`.
- **Client identity** — `getClientIp` (`apps/api/src/utils/client-ip/index.ts`) follows
  `TRUST_PROXY`: `none` (default) uses the TCP peer and ignores forwarding headers; `hops` takes the
  `X-Forwarded-For` entry `TRUST_PROXY_HOPS` proxies from the right (the socket peer counts as the
  first); `cloudflare` uses `CF-Connecting-IP` only when the hop is a Cloudflare edge or in
  `TRUST_PROXY_CIDRS`. IPv6 clients share a /64 bucket.
- **Keys and logs** — counters are keyed `<policy-id>:<key>`, where the key is the normalised IP,
  the user id, or a truncated SHA-256 of the email. Rate-limit logs carry `policy`, `limit`,
  `userId` and `err` only — never an IP, email or store key.
- **Responses** — a 429 uses the standard error envelope with the policy message, plus
  `Retry-After` and the `RateLimit`/`RateLimit-Policy`/`X-RateLimit-*` headers. If the limiter
  itself throws, the request is allowed and the error logged. `RATE_LIMIT_ENABLED=false` turns
  every policy into a pass-through.

## OpenAPI

The API exposes an auto-generated OpenAPI 3.x specification derived from `describeRoute(...)`
metadata. Every mounted route group carries it: `auth`, `recipes` (including private notes),
`users` (including user collections), `admin`, `health`, `beans`, `badges`, `brew-logs`,
`coffee-varieties`, `collections`, `comments`, `contact`, `equipment`, `follow`, `notifications`,
`photos`, `preferences`, `qrcode`, `reports`, `setups`, `taste-notes`, `vendors`, `share` and
`sitemap` (24 tags in the `tags` array of `routes/openapi.ts`). Two endpoints, both gated by the
`OPENAPI_ENABLED` env flag:

- `GET /api/v1/openapi.json` — machine-readable spec for client generation or Postman import
- `GET /api/v1/docs` — a Scalar-based HTML viewer (loaded from a CDN)

The spec is built at request time via `hono-openapi`'s `openAPIRouteHandler`, so any new route gets
picked up automatically. Routes without `describeRoute()` are left out of the spec. See
`decisions.md` ADR-012 for why we kept `zValidator` instead of swapping to `hono-openapi`'s
validator.

**Coverage scope.** `apps/api/src/routes/openapi.coverage.test.ts` builds the real router and checks
the generated document. It requires an operation under each of the 21 in-scope base paths (beans,
badges, brew-logs, coffee-varieties, collections, comments, contact, equipment, follow,
notifications, photos, preferences, qrcode, reports, setups, taste-notes, users, vendors, `/share`,
the root `/sitemap.xml` and the deprecated `/api/v1/sitemap.xml` redirect), and for every documented operation: at least one declared tag, no orphan tags, a
response map, and a documented `401` on auth-guarded in-scope operations. Auth, recipes, admin and
health are outside that scope (the test only asks for at least one operation tagged `Auth`,
`Recipes`, `Admin` and `Health`), and most admin routes are still undocumented.

**Generated reference.** [`api-reference.md`](api-reference.md) lists every documented route. It is
generated from the same document by `apps/api/scripts/generate-api-reference.ts`: run
`pnpm --filter @brewform/api run docs:api` after changing a route's metadata and commit the result
(the script warns about mounted routes missing from the spec). Cross-cutting conventions live in
[`api.md`](api.md).

### Adding a new route (required)

Every new route — or any change to a route's request/response shape — MUST carry OpenAPI metadata.
A route without `describeRoute()` is considered incomplete.

1. Prepend `describeRoute({ tags, summary, description, security, parameters, requestBody, responses })`
   from `hono-openapi`. Keep `zValidator(...)` as the validator (ADR-012); never import
   `hono-openapi`'s `validator`. Metadata must not change runtime behavior.
2. Document responses with `resolver(successEnvelope(XOutputSchema))` /
   `resolver(paginatedEnvelope(XOutputSchema))` and `resolver(ErrorEnvelopeSchema)` for each error
   (always `401` on auth-guarded routes; `404`/`403`/`400`/`409` where mapped).
3. Document JSON request bodies with `jsonRequestBody(InputSchema)`
   (`apps/api/src/utils/openapi/index.ts`) — `resolver()` only converts responses in the installed
   hono-openapi 1.x. Never `import 'zod-openapi/extend'` (the subpath does not exist in `zod-openapi` v6; it breaks the build).
4. Add the entity Output Schema under `packages/shared/src/schemas/responses/` (derived from the real
   `service.ts` return shape, additive, with a co-located unit test) and register any new tag in the
   `tags` array of `routes/openapi.ts`. Non-JSON routes document their true content type, not a JSON envelope.
5. Run `make test-api` — `routes/openapi.coverage.test.ts` enforces tagging, responses and zero
   orphan tags — and regenerate `docs/api-reference.md` with
   `pnpm --filter @brewform/api run docs:api`.

## Notifications

Social events reach the recipient on two channels: an **in-app** record in the `notifications`
table (shown by the bell and the notifications list, F05) and an **email**. One preference flag in
`UserPreferences` gates both channels of a category:

| Event                                | In-app type | Email template           | Flag                       |
| ------------------------------------ | ----------- | ------------------------ | -------------------------- |
| Someone follows you                  | `follow`    | `new-follower`           | `notifyNewFollower`        |
| Someone likes your recipe            | `like`      | `recipe-liked`           | `notifyRecipeLiked`        |
| Someone comments on your recipe      | `comment`   | `recipe-commented`       | `notifyRecipeCommented`    |
| Someone @mentions you in a comment   | `mention`   | `mentioned-in-comment`   | `notifyMentionedInComment` |
| A followed user publishes a recipe   | — (email only) | `followed-user-posted` | `notifyFollowedUserPosted` |

The fan-out lives in `apps/api/src/modules/notification/service.ts` (`createFollowNotification`,
`createLikeNotification`, `createCommentNotification`, `createMentionNotifications`): it skips
self-actions and opted-out recipients, writes the record, then sends the email through the
`notify*` helpers in `apps/api/src/utils/notify/`, which render the pre-compiled MJML template and
send via SMTP (skipped when `APP_ENV === 'test'`). The calling services fire these without awaiting
them and catch their errors, so a failed write or SMTP delivery never blocks the social action. See
[`notifications.md`](notifications.md) for trigger points, templates, and how to add a new category.

## Background Jobs

Hourly badge evaluation runs as a `node-cron` schedule:

```typescript
// apps/api/src/utils/jobs/cron.ts — registered by importing main.ts.
// No start/stop API; the schedule lives as long as the process.
cron.schedule('0 * * * *', evaluateAllBadges, { name: 'evaluate-badges' });
```

The handler is wrapped in a try/catch so a failing run never tears down the
scheduler. Shutdown does not cancel the schedule — `process.exit(0)` ends it
with the process.

**Every replica runs every job.** The scheduler lives inside each API process, so with several API
replicas each one fires `evaluate-badges` every hour. Badge evaluation tolerates that: awards are
inserted with `onConflictDoNothing` on the `(user_id, badge_id)` unique key, so duplicate runs only
cost extra queries. A future job whose side effects must happen exactly once has to take
a shared lock (for example `SET key value NX PX` on the Redis-protocol store when
`CACHE_DRIVER=redis`) or the deployment has to run a single API replica.

## Graceful Shutdown

The first `SIGTERM` or `SIGINT` runs the handler built by `createShutdownHandler`
(`apps/api/src/utils/lifecycle.ts`):

1. Marks the process as shutting down, so `GET /ready` answers `503` while connections drain
2. Closes the HTTP server
3. Closes the postgres-js client (`client.end()`)
4. Closes the email transporter
5. Closes the cache provider (the redis connection, or the memory sweep timer)
6. Closes the rate-limit store (its own redis connection when configured)
7. Calls `process.exit(0)` (`exit(1)` if a step fails; the remaining steps are skipped)

A second signal is logged at debug level and ignored.

## Web data flow

The SPA (`apps/web`) loads and writes server data only through React Router data APIs (ADR-018 in
[`decisions.md`](decisions.md)):

```
URL change / user action
  │
  ▼  createBrowserRouter route (apps/web/src/router.tsx)
  ├─ loader  (<Page>.data.ts)        ── api client + request.signal ──▶ /api/v1/...
  ├─ action  (<Form>, useSubmit, fetcher.submit) → { ok: true, … } | { ok: false, error }
  └─ resources/* routes              ← useFetcher().load()/submit() for component-level data
  │
  ▼  page component: useLoaderData(), useActionData(), fetcher.data
```

- **Reads** run in route `loader`s in a `<Page>.data.ts` module next to the page (or under
  `apps/web/src/routes/`); lazy routes use `lazy: { loader, action, Component }` so data and page
  code load in parallel. Component-level reads (typeaheads, the notification bell and list, the
  add-to-collection list, brew history and stats, taste-note lookups, the QR download, private
  notes) use fetchers against `resources/*` routes.
- **Writes** run in route `action`s. Expected failures return `{ ok: false, error, code? }`
  (`routes/action-result.ts`) instead of throwing, so the page stays rendered and can toast or roll
  back. Social toggles and comments return the new state to keyed fetchers; `shouldRevalidate` and
  `defaultShouldRevalidate: false` keep unrelated loaders from re-running. A failed action never
  revalidates the recipe detail loader, and a failed toggle (like, favourite, follow) returns the
  pre-click state, so the button falls back to the last confirmed value. The add-to-collection
  modal never revalidates per submission; it revalidates the page once on close, and only after a
  change.
- **Cancellation and auth** — every loader and action passes `request.signal` to each API client
  call. The API client refreshes the session on every 401 (one shared `POST /auth/refresh`, then a
  retry) except from login, register, refresh and logout. `requireAuth`/`requireAdmin`
  (`routes/auth-guards.ts`) turn a final 401 into `/login?next=…` and an admin 403 into `/`.
  Resource routes are never wrapped and never redirect: a final 401 returns
  `{ ok: false, code: 'UNAUTHORIZED' }`, which `useActionFeedback` toasts as `error.unauthorized`.
  Failed loads render the route `errorElement` (`RouteErrorState`), never an empty list.
- **URL state** — the URL is the source of truth for list pages. `useListUrlState(parse)` uses the
  same parser as the page's loader; a filter change resets the page, page changes keep the
  filters, and defaults are never written. Text inputs use `useDebouncedUrlText`, which commits
  after 300 ms with a history `replace`. Every URL write builds on the latest URL through
  `useLatestSearchParams` (the target of a navigation still loading on the same path, else the
  current URL), so a timer or a quick second click never drops a change; `clearAll` first cancels
  every pending debounced text commit.
- **Static lookups** (equipment, flat taste notes) go through the single-flight cache in
  `api/static-cache.ts`; mutations call `invalidateStaticCache()`, and the cross-tab listener calls
  the local-only `clearStaticCache()`.
- **Logging** — loaders and actions wrap their work in `withDataLog` (`routes/data-logging.ts`):
  `started`/`completed` debug logs with ids and one error log on failure; aborts and thrown
  `Response`s are not logged as errors.
- **API base URL** — `api/client.ts` uses the runtime `/config.js` value
  (`docker-web-entrypoint.sh` writes it from `VITE_API_URL`), then the build-time `VITE_API_URL`,
  then same-origin `/api/v1`. In development Vite proxies `/api/*` and `/sitemap.xml` to
  `VITE_API_PROXY_TARGET`.

`useEffect` is allowed only for non-fetch work (logging, subscriptions, focus) and for triggering
`fetcher.load()` or `revalidator.revalidate()`. The one place outside loaders, actions and resource
routes that calls the API client is the session store `contexts/AuthContext.tsx`, which sits above
the router. Components sign out through `useSignOut()` (`hooks/useSignOut.ts`): the server logout
runs, the page is replaced with `/`, and only then is the user cleared, so no private page or data
from the old session stays on screen. Sign-in and sign-out write the `brewform-auth-change` marker
(`utils/auth-broadcast.ts`), and `useAuthTabSync` (mounted once in `App.tsx`) mirrors them in the
other tabs from the `storage` event. The rules are enforced: a Biome `style/noRestrictedImports` override bans the API client
modules in pages and components, `apps/web/src/architecture.test.ts` fails on a `useEffect` that
calls the API, and `apps/web/src/data-loading.enforcement.test.ts` scans client imports, raw
`fetch(`, loader placement and data-module imports.

## Testing

Tests use Vitest everywhere, with explicit imports:

```typescript
import { describe, expect, it, vi } from 'vitest';
```

Conventions:

- **API DB tests** import `'../../test-setup.ts'` (relative to the module) first; it supplies the
  test `DATABASE_URL`/`JWT_SECRET` fallbacks and sets `LOG_LEVEL=silent`. API test files run
  serially (`fileParallelism: false` in `apps/api/vitest.config.ts`) because DB-backed files share
  one database.
- **Test database** — DB-backed tests use the dedicated `brewform_test` database (the `make test*`
  targets inject its `DATABASE_URL`), never the dev `brewform` database. Run
  `make test-db-provision` once after `make up` (create + migrate + seed; idempotent; mirrors the
  `test` job of `.github/workflows/ci.yml`).
- **Environment** — `CACHE_DRIVER=memory` and `APP_ENV=test` (which suppresses email delivery).
- **Logger assertions** spy on the module's exported logger: `vi.spyOn(log, '<level>')`.
- **Web tests** run in jsdom with Testing Library (`@testing-library/react`,
  `@testing-library/user-event`, `@testing-library/jest-dom`).

Commands:

- `make test` — full test suite (API + shared + db + web)
- `make test-api` — API tests only
- `make test-shared` — shared package tests only
- `make test-web` — web tests only
- `make test-coverage` — every suite with coverage (the API line threshold is a ratchet)
- `make test-specific filter=path/to/test.ts` — matching files in the api, db and shared
  workspaces (not web); one web file:
  `docker compose run --rm --no-deps app pnpm --filter @brewform/web exec vitest run <path>`
- `make test-db-provision` — provision the `brewform_test` database

Tests run without type-checking (type checking done separately via `make check`, plus
`make check-tests` for API and shared test files). All barrel file imports use explicit `.ts`
extensions.

## Code Style & Formatting

BrewForm uses Biome as the single source of truth for code formatting and linting. The config
lives in `biome.json`: `lineWidth: 100`, `indentWidth: 2`, single quotes, semicolons always.

### Mandatory `make fmt` before commit

**Run `make fmt` after every batch of edits, before committing or pushing.** Symbolic edits and
regex replacements (whether from an agent, an IDE, or a manual refactor) preserve logic but may not
match Biome's exact whitespace rules — trailing commas, line wrapping, indentation, and semicolon
insertion are all normalised by `biome check --write` in ways that are easy to miss by eye.

CI enforces `pnpm run fmt-check` in the `quality` job of `.github/workflows/ci.yml` and **fails the
build on any formatting diff**. The pre-commit hook (`.githooks/pre-commit`, enabled via
`make setup-hooks`) also runs `pnpm run fmt-check` locally, but do not rely on the hook alone — run
`make fmt` proactively after each batch of edits, not just at commit time.

### Commands

| Command | Purpose |
|---------|---------|
| `make fmt` | Apply `biome check --write` to all files (in-place) |
| `make fmt-check` | Check formatting without changes (CI uses this) |
| `make lint` | Run `biome check` across all workspaces |
| `make check` | Type-check all workspaces (`tsc --noEmit`) |
| `make docs-check` | Doc-drift check and docblock scan |
| `make ci` | Local pipeline: `fmt-check` → `lint` → `check` → `build-web` → `check-tests` → `test-coverage` → `test-web` → `docs-check` |

### Lint policy

`biome.json` uses the `recommended` preset with three rules raised to errors:
`suspicious/noExplicitAny`, `suspicious/useAwait` and `suspicious/noEmptyBlockStatements`. The web
app (`apps/web/**`) lowers seven `a11y` rules plus `correctness/useExhaustiveDependencies`,
`security/noDangerouslySetInnerHtml` and `suspicious/noArrayIndexKey` to warnings, and adds the
`style/noRestrictedImports` data-loading rule (error). The lint scripts run `biome check src/`
without `--error-on-warnings`, so warnings are reported but do not fail CI; errors do.

Suppressions are line-level only: one
`// biome-ignore <category>/<group>/<rule>: <justification>` comment (e.g.
`lint/suspicious/noExplicitAny`) directly above the line it covers, naming exactly one rule with a
non-empty justification. File-level and range forms are not allowed.
`packages/shared/src/lint-policy.test.ts` scans every `apps/*/src` and `packages/*/src` tree and
fails with `file:line` on a violation. The lint-style capability (`openspec/specs/lint-style/spec.md`)
holds the full policy.

### Import conventions

- All imports use explicit file extensions (`.ts`, `.tsx`) — no sloppy imports.
- Shared dependency versions are pinned in the `pnpm-workspace.yaml` `catalog` and each
  workspace's `package.json`.

### Documentation comments

Every exported production symbol under `apps/api/src`, `apps/web/src`, `packages/shared/src` and
`packages/db/src` carries a `/** … */` docblock directly above its declaration (code-documentation
capability, ADR-020). That covers functions, classes, components and hooks, and also constants,
types, interfaces, Zod schemas, `z.infer` aliases, Drizzle tables and enums, Hono routers and
module singletons. For `export default X;` and local `export { X };` the docblock sits on the
declaration of `X`. Line comments (`//`) and plain block comments (`/* */`) do not count. Test,
spec, fixture, generated and `*.d.ts` files are out of scope.

`node scripts/docblock-scan.ts --check` lists every missing docblock as `file:line symbol` and exits
1. It runs in `pnpm run docs:check` / `make docs-check` and in the `doc-drift` CI job.

Follow the house style captured by the wave-5 inventory
(`openspec/changes/archive/2026-07-27-wave-5-debt-clearance/audit/docblock-inventory.md`):

1. **API service functions**: an imperative first sentence, then vertically aligned
   `@param name - desc` lines and `@returns` (`apps/api/src/modules/collection/service.ts`):

   ```ts
   /**
    * Create a collection for the authenticated user.
    * @param userId - The authenticated user's UUID.
    * @param data   - Collection creation payload (name, description, visibility).
    * @returns The created collection with author, items, and recipeCount.
    */
   ```

2. **Small shared utils**: a single-line `/** … */` with a verb-first "does X: mechanics" summary
   and no tags (`packages/shared/src/utils/conversion.ts`):
   `/** Formats a weight stored in grams for display: "12.3 g" (metric) or "0.4 oz" (imperial), … */`.
3. **React hooks and components**: tag-less prose that states the behaviour and says in words what
   is returned. Components may add interaction notes, cross-file references and known limitations
   (`apps/web/src/hooks/useDebounce.ts`, `apps/web/src/components/recipe-list/RecipeCard.tsx`).
4. **Zod schemas**: "Validates X; response envelope for METHOD /route" one-liners
   (`packages/shared/src/schemas/responses/user.ts`).
5. **Cross-references**: `{@link Symbol}` for related types and functions, backticks for code
   references, declarative present tense.

The bulk categories use prescribed one-liners:

| Export | Docblock |
|---|---|
| Drizzle `pgTable` const | Names the entity and its notable columns or constraints (soft delete, unique targets) |
| Drizzle `pgEnum` const | Names the `*_VALUES` constant that drives it |
| `z.infer` alias | `/** Inferred type of {@link XSchema}. */` |
| Hono router const | `/** Hono router for /api/v1/x — mounted in routes/index.ts. */` |
| Module `log` singleton | Names the module the logger belongs to |
| Module `deps` object | Names the module and the injectable seam it provides |
