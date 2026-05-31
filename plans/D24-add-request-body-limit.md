# D24 — Add Request Body Size Limit at Hono Level

**Severity:** Low  
**Status:** Open  
**File:** `apps/api/src/main.ts`

---

## Issue Description

The API currently limits file upload size (via the photo/upload route), but there is no global request body size limit at the Hono middleware level. A malicious or buggy client could send a multi-gigabyte JSON payload to any POST/PUT endpoint, consuming server memory and potentially causing OOM.

---

## Impact

- **DoS vector:** Large payloads can exhaust server memory.
- **No protection for non-upload routes:** POST/PUT/PATCH endpoints accepting JSON have no size guard.
- **Resource waste:** Even if the payload is rejected by validation, parsing a 1GB JSON body wastes memory and CPU.

---

## Root Cause

The Hono app was configured without the `bodyLimit` middleware. Only the file upload route has an explicit size check.

---

## Affected Files

| File | Description |
|------|-------------|
| `apps/api/src/main.ts` | Middleware stack — missing `bodyLimit` |

---

## Fix Approach

Add Hono's built-in `bodyLimit` middleware to the middleware stack, after `cors` and `requestId` but before routes.

### Hono Reference

From Context7 (`/websites/hono_dev`):

```typescript
import { bodyLimit } from 'hono/body-limit';

const app = new Hono();

app.use('*', bodyLimit({
  maxSize: 1024 * 1024, // 1MB
}));
```

The `bodyLimit` middleware returns a `413 Content Too Large` response when the body exceeds the limit.

---

## Implementation Steps

1. **Read** `apps/api/src/main.ts` — confirm the current middleware stack order.
2. **Import** `bodyLimit` from `'hono/body-limit'`.
3. **Add** the middleware after `rateLimitMiddleware` and before the cache injection middleware:
   ```typescript
   app.use('*', rateLimitMiddleware({ windowMs: 60_000, maxRequests: 100 }));
   app.use('*', bodyLimit({ maxSize: 1024 * 1024 })); // 1MB
   app.use('*', async (c, next) => {
     c.set('cache', cacheProvider);
     await next();
   });
   ```
4. **Verify** the upload route still works — it has its own size limit and should not be affected (file uploads use multipart/form-data, which is handled differently).
5. **Run** `make check-api` — type-check passes.
6. **Run** `make test` — all tests pass.

---

## Middleware Stack (After Fix)

```
cors → requestId → secureHeaders → rateLimit → bodyLimit(1MB) → cache injection → crawler → routes
```

---

## Testing Strategy

| Test | Expected |
|------|----------|
| POST with 500KB JSON body | 200/201 (success) |
| POST with 2MB JSON body | 413 Content Too Large |
| File upload route | Unaffected (separate handling) |
| GET requests | Unaffected (no body) |

---

## Risk Assessment

**Risk: Low**

- Hono's built-in middleware, well-tested.
- 1MB is generous for JSON APIs (typical payloads are <10KB).
- Returns clear 413 status code.
- File upload routes use multipart and may need separate consideration (verify).

---

## Dependencies

- None. Standalone security hardening.
