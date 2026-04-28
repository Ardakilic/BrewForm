# Request Lifecycle

A trace of how a single HTTP request moves through the BrewForm API, from the edge to the response.
Use this as a map when debugging unexpected behaviour or deciding where to add new logic.

## High-level path

```
Client (web SPA)
  │  fetch with Authorization: Bearer <accessToken>
  ▼
Deno.serve / Hono app  (apps/api/src/main.ts)
  │
  ▼  Global middleware (apps/api/src/main.ts)
  ├─ corsMiddleware           ← reject disallowed origins early
  ├─ requestIdMiddleware      ← assign c.set('requestId', uuid)
  ├─ rateLimitMiddleware      ← CacheProvider-backed counter, 100/min/IP
  ├─ cache injector           ← c.set('cache', cacheProvider)
  └─ onError                  ← errorHandler registered for any throw below
  │
  ▼  Route aggregator (apps/api/src/routes/index.ts)
  ├─ /health, /ready
  ├─ /api/v1/openapi.json, /api/v1/docs   (gated by OPENAPI_ENABLED)
  └─ /api/v1/<module>/...                 → 17 sub-routers
  │
  ▼  Sub-router (e.g. apps/api/src/modules/recipe/index.ts)
  ├─ describeRoute(...)        ← OpenAPI metadata (build-time, not a runtime hook)
  ├─ authMiddleware            ← c.set('userId', sub)
  ├─ zValidator('json'|'query', schema)
  └─ handler
       │
       ▼  Service layer (modules/<name>/service.ts)
       │   - business rules, authorization (ownership checks)
       │   - calls model.* and other services
       │   - throws domain errors as named strings (RECIPE_NOT_FOUND, FORBIDDEN, ...)
       │
       ▼  Model layer (modules/<name>/model.ts)
       │   - thin Prisma wrapper, `as any` cast to bypass type lag
       │   - the only place @prisma/client is imported
       │
       ▼  Prisma Client → PostgreSQL
  │
  ▼  Response helper (apps/api/src/utils/response/index.ts)
  └─ success(c, data, status?)  |  paginated(c, list, meta)  |  error(c, code, msg, status, details?)
```

Every step except the database round-trip is in-process, single-threaded JavaScript.

## Middleware order, in detail

Middleware is applied at `app.use('*', ...)` in `apps/api/src/main.ts`. Order matters — earlier
middleware sees the request first and the response last.

| # | Middleware              | Reads                                 | Writes                                               | Why this position                                                                                         |
| - | ----------------------- | ------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1 | `corsMiddleware`        | `Origin` header                       | preflight response                                   | Reject cross-origin requests before any work                                                              |
| 2 | `requestIdMiddleware`   | —                                     | `c.set('requestId')`, `X-Request-ID` response header | Every later log line and error response references this id                                                |
| 3 | `rateLimitMiddleware`   | client IP                             | calls `CacheProvider.set/get`, `429` on overflow     | Sits _before_ auth so unauthenticated floods are blocked, _after_ requestId so the rejection is traceable |
| 4 | cache injector          | —                                     | `c.set('cache', provider)`                           | Makes the same provider singleton available to every handler without a global import                      |
| 5 | `onError(errorHandler)` | exceptions thrown anywhere downstream | response envelope                                    | Last resort — see _Error path_ below                                                                      |

Route-level middleware (auth, admin, validators) is composed _per route_ by the sub-router and runs
after the global stack.

## Auth path (protected route)

```
authMiddleware (apps/api/src/middleware/auth.ts)
  │
  ├─ Read Authorization header → strip "Bearer "
  ├─ verify(token, JWT_SECRET, 'HS256')
  ├─ Reject if payload.type !== 'access' (prevents refresh-as-access misuse)
  ├─ Reject if user is banned or soft-deleted
  ├─ c.set('userId', payload.sub)
  └─ c.set('user', userRow)
```

`optionalAuthMiddleware` runs the same logic but yields `userId = null` when the header is absent or
invalid, instead of returning 401. Used by routes whose response varies by viewer (e.g. drafts
visible only to author).

`adminMiddleware` runs _after_ `authMiddleware` and returns 403 unless `user.isAdmin` is true.

## Validation

Two layers:

1. **Hard validation** at the route boundary via `@hono/zod-validator`'s
   `zValidator(target, schema)`. Schemas live in `@brewform/shared/schemas` so the same shape is
   enforced on the frontend form. A failure short-circuits with a 400 `VALIDATION_ERROR` and a
   per-field `details` array.
2. **Soft validation** in the service layer
   (`packages/shared/src/utils/validation.ts:validateSoftWarnings`). Returns warnings alongside the
   data — never blocks the save. Currently 7 checks (espresso ratio bounds, extraction time,
   temperature, missing grind size / coffee identity, milk prep on non-milk drink, no equipment).

## Error path

Errors bubble up through the layers as `Error` instances whose `.message` is a domain-specific
string constant (e.g. `RECIPE_NOT_FOUND`, `FORBIDDEN`, `EMAIL_ALREADY_EXISTS`). The route handler
catches each, maps it to an envelope code/HTTP status via `error(c, code, msg, status, details?)`,
and returns. Anything _not_ handled at the route level falls through to `onError(errorHandler)`,
which:

1. Reads `requestId` from context.
2. Logs the error with the requestId attached (Pino, with secret redaction).
3. Returns the standard error envelope with HTTP 500 and `code: INTERNAL_ERROR`.

The client receives the same envelope shape on success and on failure — see `docs/api.md` for the
schema.

## Response envelope

Always built via `apps/api/src/utils/response/index.ts`. Helpers:

- `success(c, data, status?)` → `{ success: true, data, meta: { requestId } }`
- `paginated(c, items, { page, perPage, total, totalPages })` → adds `meta.pagination`
- `error(c, code, message, status, details?)` →
  `{ success: false, error: { code, message, details, requestId } }`

All status codes are `ContentfulStatusCode`s (no 1xx) so the type system rejects malformed responses
at compile time.

## Logging & correlation

Pino is configured at `apps/api/src/utils/logger/index.ts` with field redaction (`*.passwordHash`,
`*.password`, `*.token`, `*.secret`, `*.apiKey`, `*.authorization`). Every module gets a child
logger via `createLogger('module-name')`.

Every error-level log includes the `requestId` so a client failure (which surfaces the id in the
response envelope) can be grepped against the server logs. In development the transport is
`pino-pretty`; in production it's structured JSON.

## Side-effect path: notifications

Social-event email notifications (gap H2) are fire-and-forget — they live outside the request
lifecycle so a failed SMTP delivery cannot fail the originating action. See `docs/notifications.md`
for the trigger points and template list.

```
request → service.ts (e.g. follow.followUser)
             │
             ├─ DB write (synchronous, awaited, part of the response)
             │
             └─ (async () => notifyXxx(...))().catch(log)   ← fire-and-forget
```

The IIFE is intentionally not awaited, but its rejection is caught and logged so silent failures
still surface in production logs.

## Background jobs

Long-running and periodic work (badge evaluation, cache refresh) is registered with
`registerJob({ name, intervalMs, handler })` in `apps/api/src/utils/jobs/index.ts`. `startJobs()` is
called once at server boot; `stopJobs()` is called from the shutdown handler. Each invocation is
wrapped in a try/catch so a failing job never tears down the scheduler.

## Graceful shutdown

`SIGTERM`/`SIGINT` triggers, in order:

1. `stopJobs()` — clears all interval timers
2. `server.shutdown()` — drains in-flight requests
3. `kv.close()` — if the Deno KV provider is in use
4. `prisma.$disconnect()` — closes the connection pool
5. `Deno.exit(0)`

Anything that times out past the host's grace window (Deno Deploy or container orchestrator) is
terminated forcibly — keep job intervals comfortably below that window.

## Quick reference: where to put new logic

| You want to …                      | Put it in …                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Reject malformed input             | a Zod schema in `@brewform/shared/schemas`, then `zValidator` in the route                              |
| Authorize an action                | the service, before the DB call (e.g. compare `recipe.authorId` to `userId`)                            |
| Add a new DB query                 | the module's `model.ts` only — services never import `@prisma/client`                                   |
| Add cross-cutting behaviour        | a new middleware in `apps/api/src/middleware/`, registered in `main.ts` or the relevant sub-router      |
| Send an email after a social event | a new template in `apps/api/src/templates/email/` plus a helper in `apps/api/src/utils/notify/index.ts` |
| Schedule periodic work             | `registerJob({...})` in a new file under `apps/api/src/utils/jobs/`                                     |
