# D24 — Add Request Body Size Limit at Hono Level

**Severity:** Low  
**Status:** Open  
**File:** `apps/api/src/main.ts`

---

## Validation Notes (corrections vs. original plan)

The following issues were found during codebase validation against `main` (`hono@4.12.19`):

1. **Misleading claim about the photo upload route.** The original plan stated "The API currently limits file upload size (via the photo/upload route)". This is inaccurate. `validateImageUpload()` in `apps/api/src/utils/upload/index.ts` is an *application-level* check that runs **after** `await c.req.formData()` has already loaded the entire multipart body into memory. There is no `bodyLimit` middleware on the upload route — meaning a malicious multipart payload is fully buffered before being rejected.

2. **Global 1 MB `bodyLimit` would silently break photo uploads.** `UPLOAD_MAX_SIZE_BYTES` defaults to `10 * 1024 * 1024` (10 MB) in `apps/api/src/config/env.ts`. Hono's `bodyLimit` inspects the `Content-Length` header (or streams the body when absent) for *all* content types, including `multipart/form-data`. A global 1 MB limit would therefore reject any photo upload larger than 1 MB with 413. The original plan's claim that "file uploads use multipart/form-data, which is handled differently" is **incorrect** — `bodyLimit` is content-type-agnostic.

3. **Missing `onError` handler would produce 500s instead of 413s.** Without a custom `onError`, Hono's `bodyLimit` throws `HTTPException(413)`. The project's `errorHandler` (`apps/api/src/middleware/errorHandler.ts`) does not handle `HTTPException` and falls through to the generic 500 handler. A custom `onError` is required to return the correct 413 with the project's standard error envelope.

4. **JSDoc comment in `main.ts` must be updated.** The file-level comment currently describes the middleware stack without `bodyLimit`; it must be updated to reflect the new step.

5. **CI command.** Implementation steps have been updated to use `make ci` (the full CI pipeline) consistent with other D-series plans.

---

## Issue Description

The API has no global transport-level request body size limit. JSON endpoints (`POST`, `PUT`, `PATCH`) accept arbitrarily large payloads; the entire body is parsed into memory before any application-level validation runs. A malicious or buggy client sending a multi-gigabyte JSON body could exhaust server memory and cause an OOM crash.

The photo upload route (`POST /api/v1/photos`) does have an application-level file-size check (`validateImageUpload`), but this check fires **after** the full multipart body is already in memory — so it is not a transport-level guard. It also allows files up to `UPLOAD_MAX_SIZE_BYTES` (default 10 MB), which must be respected when placing a global limit.

---

## Impact

- **DoS vector:** Large payloads can exhaust server memory.
- **No pre-parse protection for any route:** All endpoints buffer the entire body before any size check runs.
- **Resource waste:** Parsing a 1 GB JSON body wastes memory and CPU even if ultimately rejected.

---

## Root Cause

`apps/api/src/main.ts` registers no `bodyLimit` middleware. The existing upload size cap in `utils/upload/index.ts` is a post-parse application check, not a pre-parse transport guard.

---

## Affected Files

| File | Change |
|------|--------|
| `apps/api/src/main.ts` | Import and register `bodyLimitMiddleware`; guard `startup()` with `import.meta.main`; update JSDoc comment |
| `apps/api/src/middleware/bodyLimit.ts` | New middleware: 1 MB `bodyLimit` with conditional exclusion for `/api/v1/photos` |
| `apps/api/src/middleware/bodyLimit.test.ts` | New tests covering within-limit, over-limit, photo exclusion, GET unaffected, and `validateImageUpload` preservation |
| `apps/api/src/utils/upload/index.ts` | Add docblock to `validateImageUpload` |

---

## Fix Approach

Add Hono's built-in `bodyLimit` middleware as a **conditional wrapper** that:
- Applies a **1 MB limit** to all routes *except* `/api/v1/photos` (the only file-upload endpoint, which allows up to `UPLOAD_MAX_SIZE_BYTES` = 10 MB).
- Returns the project's standard JSON error envelope via the `onError` option.
- Is inserted after `rateLimitMiddleware` and before the cache-injection middleware.

### Hono `bodyLimit` Reference (Hono 4.12.19)

```typescript
import { bodyLimit } from 'hono/body-limit';

app.use('*', bodyLimit({
  maxSize: 50 * 1024, // 50 KB
  onError: (c) => c.text('overflow :(', 413),
}));
```

`bodyLimit` checks `Content-Length` when present; otherwise it streams the body and triggers `onError` once the configured size is exceeded. It is content-type-agnostic (applies equally to `application/json` and `multipart/form-data`).

---

## Implementation Steps

1. **Read** `apps/api/src/main.ts` — confirm the current middleware stack order and JSDoc comment.

2. **Create** `apps/api/src/middleware/bodyLimit.ts` with the pre-initialised `bodyLimit` constant and a conditional wrapper:

   ```typescript
   import { bodyLimit } from 'hono/body-limit';
   import type { MiddlewareHandler } from 'hono';
   import { error } from '../utils/response/index.ts';
   import type { AppEnv } from '../types/hono.ts';

   const jsonBodyLimit = bodyLimit({
     maxSize: 1024 * 1024, // 1 MB
     onError: (c) => error(c, 'PAYLOAD_TOO_LARGE', 'Request body too large', 413),
   });

   export const bodyLimitMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
     if (c.req.path.startsWith('/api/v1/photos')) {
       return next();
     }
     return jsonBodyLimit(c, next);
   };
   ```

3. **Wire** the middleware into `apps/api/src/main.ts`. Add the import and register it after `rateLimitMiddleware` and before the cache injection middleware:

   ```typescript
   import { bodyLimitMiddleware } from './middleware/bodyLimit.ts';

   app.use('*', rateLimitMiddleware({ windowMs: 60_000, maxRequests: 100 }));
   app.use('*', bodyLimitMiddleware);
   app.use('*', async (c, next) => {
     c.set('cache', cacheProvider);
     await next();
   });
   ```

4. **Guard** the top-level `startup()` call in `apps/api/src/main.ts` with `import.meta.main` so the file can be imported in tests without starting the server:

   ```typescript
   if (import.meta.main) {
     startup().catch((err) => {
       logger.error({ err }, 'Failed to start server');
       Deno.exit(1);
     });
   }
   ```

5. **Update** the JSDoc comment at the top of `main.ts` to reflect the new middleware step:

   ```
    *   cors → requestId → secureHeaders → rateLimit(100/min) → bodyLimit(1MB, excl. /api/v1/photos) → cache injection → crawler → routes
   ```

6. **Create** `apps/api/src/middleware/bodyLimit.test.ts` covering within-limit, over-limit (Content-Length and streaming), GET unaffected, photo route exclusion, and unchanged `validateImageUpload` behaviour.

7. **Add** a docblock to `validateImageUpload` in `apps/api/src/utils/upload/index.ts`.

8. **Run** `make check-api` and the targeted test/coverage commands — confirm type-check, tests, and coverage pass.

9. **Run** `make fmt`, `make lint`, and `make test-api` — confirm project-level checks pass. Note: `make test` also runs web (Vitest) tests; at the time of implementation an unrelated pre-existing failure exists in `apps/web/src/components/CookieConsent.test.tsx`.

---

## Middleware Stack (After Fix)

```text
cors → requestId → secureHeaders → rateLimit → bodyLimit(1MB, excl. /api/v1/photos) → cache injection → crawler → routes
```

---

## Testing Strategy

| Test | Expected |
|------|----------|
| POST `/api/v1/recipes` with 500 KB JSON body | 200/201 (within limit) |
| POST `/api/v1/recipes` with 2 MB JSON body | 413 — `{ success: false, error: { code: "PAYLOAD_TOO_LARGE", ... } }` |
| POST `/api/v1/photos` with a 5 MB image file | Unaffected — proceeds to application-level validation |
| POST `/api/v1/photos` with a file exceeding `UPLOAD_MAX_SIZE_BYTES` | 400 — rejected by `validateImageUpload()` (unchanged behaviour) |
| GET requests (no body) | Unaffected |

---

## Risk Assessment

**Risk: Low**

- Hono's built-in middleware is well-tested.
- 1 MB is generous for JSON APIs (typical payloads are < 10 KB).
- The photo upload route is explicitly excluded, preserving the existing 10 MB application-level cap.
- `onError` returns the project's standard error envelope with the correct 413 status code.
- No other routes in the codebase accept file uploads (verified: only `POST /api/v1/photos` uses `c.req.formData()`).

---

## Dependencies

- None. Standalone security hardening. `bodyLimit` ships with Hono and requires no new package.