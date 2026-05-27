## Middleware Stack Order (global, `app.use('*')`)

```
1. CORS              → reject disallowed origins early
2. requestId         → c.set('requestId', uuid) + X-Request-ID header
3. rateLimit         → CacheProvider-backed, 100/min/IP, 429 on overflow
4. cache injector    → c.set('cache', provider)
5. onError           → catches unhandled throws → error envelope + 500
```

Order invariants: rateLimit before auth (blocks unauthenticated floods) but after requestId (rejection is traceable).

Route-level middleware (auth, admin, zValidator) run after global stack, composed per route by sub-router.

## Error Path

- Services throw `Error` with domain-string `.message` (e.g. `RECIPE_NOT_FOUND`, `FORBIDDEN`).
- Route handlers catch and map via `error(c, code, msg, status, details?)` from `apps/api/src/utils/response/index.ts`.
- Unhandled exceptions → `onError(errorHandler)`: reads requestId, logs (Pino with secret redaction), returns 500 `INTERNAL_ERROR`.
- Validation failures → `zodValidationHook` transforms ZodError into standard `{ success: false, error: { code: 'VALIDATION_ERROR', details: [...] } }` envelope.

## Response Helpers

- `success(c, data, status?)` → `{ success: true, data, meta: { requestId } }`
- `paginated(c, items, { page, perPage, total, totalPages })` → adds `meta.pagination`
- `error(c, code, msg, status, details?)` → `{ success: false, error: { code, msg, details, requestId } }`
- All status codes typed as `ContentfulStatusCode` (no 1xx).

## Graceful Shutdown (SIGTERM/SIGINT order)

1. `stopJobs()` — clear interval timers
2. `server.shutdown()` — drain in-flight requests
3. `kv.close()` — if Deno KV provider active
4. `postgres-js client end` — close pool
5. `Deno.exit(0)`

## Background Jobs

- Pattern: `registerJob({ name, intervalMs, handler })` in `apps/api/src/utils/jobs/index.ts`.
- `startJobs()` called once at boot; `stopJobs()` at shutdown.
- Each invocation wrapped in try/catch — failing job never kills scheduler.
- Deno Deploy supports `Deno.cron()` for scheduled tasks.

## Side Effects (Notifications)

Social-event emails are fire-and-forget IIFEs — intentionally not awaited. See `mem:notifications`.
