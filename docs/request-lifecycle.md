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
  ├─ requestIdMiddleware      ← keep a valid X-Request-ID or generate a UUID → c.set('requestId')
  ├─ secureHeaders            ← CSP, HSTS, X-Frame-Options, referrer/permissions policies
  ├─ rateLimit(global)        ← RATE_LIMIT_GLOBAL_MAX/min per client IP (TRUST_PROXY identity),
  │                             own rate-limit store (memory or redis), never the CacheProvider
  ├─ bodyLimitMiddleware      ← 1 MB, photo cap on /api/v1/photos → 413 before buffering
  ├─ cache injector           ← c.set('cache', cacheProvider)
  ├─ crawlerMiddleware        ← OG HTML for crawler UAs on public /recipes/:slug
  ├─ onError                  ← errorHandler registered for any throw below
  └─ /uploads/:path{.+}       ← only with STORAGE_DRIVER=local (uploads policy)
  │
  ▼  Route aggregator (apps/api/src/routes/index.ts)
  ├─ /health, /ready                      (liveness, readiness)
  ├─ /share/:slug, /api/v1/sitemap.xml    (HTML / XML, not JSON envelopes)
  ├─ /api/v1/openapi.json, /api/v1/docs   (gated by OPENAPI_ENABLED)
  └─ /api/v1/<module>/...                 → 23 sub-routers on 21 prefixes
  │
  ▼  Sub-router (e.g. apps/api/src/modules/recipe/index.ts)
  ├─ describeRoute(...)        ← OpenAPI metadata (build-time, not a runtime hook)
  ├─ rateLimit(POLICIES.x)     ← route policies (IP-keyed before validation/auth)
  ├─ authMiddleware            ← c.set('userId', sub), c.set('user', row)
  ├─ zValidator('json'|'query', schema)
  └─ handler
       │
       ▼  Service layer (modules/<name>/service.ts)
       │   - business rules, authorization (ownership and visibility checks)
       │   - calls model.* and other services
       │   - throws typed AppErrors (NotFoundError, ForbiddenError, ConflictError,
       │     ValidationError) or legacy string codes (RECIPE_NOT_FOUND, FORBIDDEN, ...)
       │
       ▼  Model layer (modules/<name>/model.ts)
       │   - Drizzle builders and relational queries
       │   - services never import drizzle-orm; they call the model
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

| #  | Middleware                         | Reads                                  | Writes                                                          | Why this position                                                                                                   |
| -- | ---------------------------------- | -------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1  | `corsMiddleware`                   | `Origin` header                        | preflight response, exposed rate-limit headers                  | Reject cross-origin requests before any work                                                                        |
| 2  | `requestIdMiddleware`              | `X-Request-ID` header (if valid)       | `c.set('requestId')`, `X-Request-ID` response header            | Every later log line and error response references this id                                                          |
| 3  | `secureHeaders`                    | —                                      | CSP, HSTS, `X-Frame-Options: DENY`, referrer/permissions policy | Applied to every response, including the 429/413 answers below                                                      |
| 4  | `rateLimit(POLICIES.global)`       | client IP from `getClientIp` (`TRUST_PROXY`) | its own rate-limit store; `429` + `Retry-After` on overflow | Sits _before_ body parsing and auth so floods are cheap to reject, _after_ requestId so the rejection is traceable |
| 5  | `bodyLimitMiddleware`              | `Content-Length` / body stream         | `413 PAYLOAD_TOO_LARGE`                                         | Caps the body (1 MB; the photo cap on `/api/v1/photos`) before any handler buffers it                               |
| 6  | cache injector                     | —                                      | `c.set('cache', provider)`                                      | Makes the same provider singleton available to every handler without a global import                                |
| 7  | `crawlerMiddleware`                | `User-Agent`, path                     | OG HTML, or `X-Robots-Tag: noindex, nofollow` on fall-through   | Answers crawler previews of public recipes before routing, with the headers and limits of the stack above           |
| 8  | `onError(errorHandler)`            | exceptions thrown anywhere downstream  | response envelope                                               | Registered with `app.onError`, not as stack middleware — see _Error path_ below                                     |
| 9  | `/uploads/:path{.+}`               | path                                   | file bytes                                                      | Only with `STORAGE_DRIVER=local`; its own `uploads` policy (600/min per IP), exempt from the global policy for `GET`/`HEAD` |
| 10 | routes                             | —                                      | —                                                               | `app.route('/', routes)` mounts the aggregator last                                                                 |

**Client identity.** IP-keyed policies key on `getClientIp(c)` (`apps/api/src/utils/client-ip/index.ts`),
driven by `TRUST_PROXY`: `none` (default) uses the TCP peer and ignores forwarding headers; `hops`
takes the `X-Forwarded-For` entry `TRUST_PROXY_HOPS` proxies from the right (the socket peer counts
as the first trusted proxy, so client-supplied entries on the left cannot change the result);
`cloudflare` uses `CF-Connecting-IP` only when the hop is a Cloudflare edge or in
`TRUST_PROXY_CIDRS`. IPv6 clients share a /64 bucket. Rate limiting is not backed by the
`CacheProvider`: the limiter state lives in `RATE_LIMIT_STORE` (`memory` or `redis` on its own
connection, keys under `brewform-rl:`), so `CACHE_ENABLED=false` and cache outages do not affect it.
The policy table is in [`api.md`](api.md#rate-limits) and the design in ADR-016
([`decisions.md`](decisions.md)).

Route-level middleware (rate-limit policies, auth, admin, validators) is composed _per route_ by
the sub-router and runs after the global stack. Mount order: IP-keyed policies before validation
and auth, email-keyed policies after `zValidator`, user-keyed policies after `authMiddleware`.

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

The error handler's log lines include the `requestId`, so a client failure (which surfaces the id in
the response envelope and the `X-Request-ID` header) can be grepped against the server logs.
`LOG_FORMAT=pretty` selects the `pino-pretty` transport; the default is structured JSON. Rate-limit
and request logs never contain raw IPs or emails (rate-limit logs carry only `policy`, `limit`,
`userId` and `err`).

## Side-effect path: notifications

Social events produce an **in-app notification record** (the `notifications` table, read by the bell
and the notifications list) and an **email**. Both are fire-and-forget: they run outside the request
lifecycle so a failed insert or SMTP delivery cannot fail the originating action. See
[`notifications.md`](notifications.md) for the trigger points and template list.

```
request → service.ts (e.g. follow.followUser, recipe.toggleLike, comment.createComment)
             │
             ├─ DB write (synchronous, awaited, part of the response)
             │
             └─ createXxxNotification(...).catch(log)   ← fire-and-forget
                  │  (modules/notification/service.ts)
                  ├─ skip self-actions and recipients whose notify* flag is off
                  ├─ insert the in-app record (notifications table)
                  └─ notifyXxx(...) (utils/notify) → render MJML → SMTP
                                                     (skipped when APP_ENV=test)
```

One preference flag gates both channels of a category (for example `notifyRecipeLiked`). The
"followed user published a recipe" email (`notifyFollowersOfNewRecipe`) has no in-app record. The
promise is intentionally not awaited, but its rejection is caught and logged, and each step inside
logs its own failure, so silent failures still surface in production logs.

## Background jobs

Periodic work (badge evaluation) is a `node-cron` schedule registered at module
top-level in `apps/api/src/utils/jobs/cron.ts` (`0 * * * *`, named
`evaluate-badges`). Importing `main.ts` registers it; there is no
start/stop API. Each invocation is wrapped in a try/catch so a failing job
never tears down the scheduler. Shutdown does not cancel the schedule —
`process.exit(0)` ends the process.

The scheduler runs in every API process, so each replica fires every job. Badge awards are
idempotent (`onConflictDoNothing` on the user/badge key); a job that must run exactly once needs a
shared lock (for example `SET key value NX PX` on the Redis-protocol store when
`CACHE_DRIVER=redis`) or a single API replica.

## Graceful shutdown

The first `SIGTERM`/`SIGINT` runs `createShutdownHandler` (`apps/api/src/utils/lifecycle.ts`), in
order:

1. mark the process as shutting down — `GET /ready` answers `503` from now on, so orchestrators stop
   routing new traffic while the server drains
2. `server.close()` — drains in-flight requests
3. `postgres-js client end` — closes the connection pool
4. `closeTransporter()` — closes the email transporter
5. close the cache provider (the redis connection or the memory sweep timer)
6. close the rate-limit store (its own redis connection when `RATE_LIMIT_STORE=redis`)
7. `process.exit(0)` — or `exit(1)` if a step fails (the remaining steps are skipped)

A second signal is logged at debug level and ignored. Anything that times out past the host's
grace window (container orchestrator) is terminated forcibly — keep job intervals comfortably below
that window.

## Quick reference: where to put new logic

| You want to …                      | Put it in …                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Reject malformed input             | a Zod schema in `@brewform/shared/schemas`, then `zValidator` in the route                              |
| Authorize an action                | the service, before the DB call (e.g. compare `recipe.authorId` to `userId`)                            |
| Add a new DB query                 | the module's `model.ts` only — services never import `drizzle-orm`                                   |
| Add cross-cutting behaviour        | a new middleware in `apps/api/src/middleware/`, registered in `main.ts` or the relevant sub-router      |
| Notify a user of a social event    | a `create…Notification` fan-out in `apps/api/src/modules/notification/service.ts` (in-app record + email), an MJML template in `apps/api/src/templates/email/` and a helper in `apps/api/src/utils/notify/index.ts`; see [`notifications.md`](notifications.md) |
| Rate-limit a route                 | a named policy in `apps/api/src/utils/rate-limit/policies.ts`, mounted with `rateLimit(POLICIES.x)` in the route (never a hand-rolled counter or the cache) |
| Schedule periodic work             | a `cron.schedule(...)` call in `apps/api/src/utils/jobs/cron.ts` (imported by `main.ts`); it fires in every replica |
