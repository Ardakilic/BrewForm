# Request Lifecycle

A trace of how a single HTTP request moves through the BrewForm API, from the edge to the response.
Use this as a map when debugging unexpected behaviour or deciding where to add new logic.

## High-level path

```
Client (web SPA)
  │  fetch with Authorization: Bearer <accessToken>
  ▼
@hono/node-server / Hono app  (apps/api/src/main.ts)
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
       │   - thin Drizzle wrapper, `as any` cast to bypass type lag
       │   - the only place @brewform/db is imported
       │
       ▼  Drizzle ORM + postgres-js driver → PostgreSQL
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
   Validation failures are formatted through a `zodValidationHook` that transforms Zod issues into
   the standard `{ success: false, error: { code: 'VALIDATION_ERROR', details: [...] } }` envelope
   instead of returning the raw `ZodError` object.
2. **Soft validation** in the service layer
   (`packages/shared/src/utils/validation.ts:validateSoftWarnings`). Returns warnings alongside the
   data — never blocks the save. Currently 7 checks (espresso ratio bounds, extraction time,
   temperature, missing grind size / coffee identity, milk prep on non-milk drink, no equipment).

## Error path

Route handlers catch the domain errors they expect and answer with
`error(c, code, msg, status, details?)`. Everything else falls through to
`app.onError(errorHandler)` (`apps/api/src/middleware/errorHandler.ts`), which maps the error to
the standard envelope with `c.json` (so CORS, request-id and secure headers set earlier are kept).
It checks, in order:

1. **`HTTPException`** (framework errors such as malformed JSON): keeps its status, with
   `error.code` derived from it (`BAD_REQUEST` 400, `PAYLOAD_TOO_LARGE` 413, `RATE_LIMITED` 429,
   …). A custom `res` is returned unchanged; 4xx is logged at warn. (The body-limit and
   rate-limit middleware answer their own 413 and 429 envelopes before any route runs.)
2. **Typed `AppError`** (`apps/api/src/utils/errors.ts`: `NotFoundError`, `ForbiddenError`,
   `ConflictError`, `ValidationError`): its own status, code (for example `SLUG_CONFLICT`) and
   `details`. New service code throws these instead of string codes.
3. **`EQUIPMENT_INCOMPATIBLE`**: 422 `VALIDATION_ERROR` with one detail per equipment item.
4. **Postgres errors**: drizzle-orm wraps every driver error in `DrizzleQueryError`, so
   `getPostgresError` walks the `cause` chain (up to 5 levels) and recognises the driver error by
   shape (`name === 'PostgresError'` plus a 5-character SQLSTATE `code`). The SQLSTATE table:
   `23505` → 409 `CONFLICT`; `23503` → 400 `VALIDATION_ERROR` on insert/update (409 `CONFLICT` on
   delete); `23502`, `23514` and class `22` → 400 `VALIDATION_ERROR`; `57014` (statement timeout)
   → 503 `QUERY_TIMEOUT`. Other SQLSTATEs fall through to 500. Responses never contain SQL text,
   parameters, or constraint, table or column names.
5. **`ZodError`**: 400 `VALIDATION_ERROR` with per-field `details`.
6. **Auth/JWT failures**: 401 `UNAUTHORIZED`.
7. **Legacy string codes** (`new Error('UPPER_SNAKE')` that no handler caught), mapped by
   convention with a warn log: `FORBIDDEN` → 403, `*_NOT_FOUND` → 404 `NOT_FOUND`,
   `ALREADY_*` / `*_ALREADY_EXISTS` → 409 `CONFLICT`, `VALIDATION_ERROR…` → 400.
8. **Anything else**: 500 `INTERNAL_ERROR`. The message is `Something went wrong` in production;
   outside production it is the error message, except `Database error` for database errors
   (Drizzle's message embeds the query parameters).

Database errors are logged without query parameters or row values: mapped constraint errors log
only `{ pgCode, constraint, table }` at warn, and unmapped errors go through `toLoggableError`
(name, SQL text without params, SQLSTATE, constraint, stack). Every log line carries the
`requestId`.

The client receives the same envelope shape on success and on failure. The codes are listed in
`docs/api.md` → "Error Codes".

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

Periodic work (badge evaluation) is a `node-cron` schedule registered at module
top-level in `apps/api/src/utils/jobs/cron.ts` (`0 * * * *`, named
`evaluate-badges`). Importing `main.ts` registers it; there is no
start/stop API. Each invocation is wrapped in a try/catch so a failing job
never tears down the scheduler. Shutdown does not cancel the schedule —
`process.exit(0)` ends the process.

## Graceful shutdown

`SIGTERM`/`SIGINT` triggers, in order:

1. `server.close()` — drains in-flight requests
2. `postgres-js client end` — closes the connection pool
3. `closeTransporter()` — closes the email transporter
4. `process.exit(0)`

Anything that times out past the host's grace window (container orchestrator) is
terminated forcibly — keep job intervals comfortably below that window.

## Quick reference: where to put new logic

| You want to …                      | Put it in …                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Reject malformed input             | a Zod schema in `@brewform/shared/schemas`, then `zValidator` in the route                              |
| Authorize an action                | the service, before the DB call (e.g. compare `recipe.authorId` to `userId`)                            |
| Add a new DB query                 | the module's `model.ts` only — services never import `drizzle-orm`                                   |
| Add cross-cutting behaviour        | a new middleware in `apps/api/src/middleware/`, registered in `main.ts` or the relevant sub-router      |
| Send an email after a social event | a new template in `apps/api/src/templates/email/` plus a helper in `apps/api/src/utils/notify/index.ts` |
| Schedule periodic work             | a `cron.schedule(...)` call in `apps/api/src/utils/jobs/cron.ts` (imported by `main.ts`)                |
