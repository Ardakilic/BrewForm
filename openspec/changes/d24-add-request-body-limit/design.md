## Context

The API currently has no transport-level request body size limit. The only size check is in `validateImageUpload()` (`apps/api/src/utils/upload/index.ts:33`), an application-level check that runs after `await c.req.formData()` has already buffered the entire multipart body. This means a malicious payload up to server memory capacity is fully loaded before rejection.

Current middleware stack (from `apps/api/src/main.ts`):
```
cors → requestId → secureHeaders → rateLimit(100/min) → cache injection → crawler → routes
```

The `errorHandler` (`apps/api/src/middleware/errorHandler.ts`) does not handle `HTTPException` — Hono's `bodyLimit` throws `HTTPException(413)` when no `onError` callback is configured, which would fall through to the generic 500 handler. Providing an `onError` callback sidesteps this entirely by returning a Response directly.

The photo upload route (`POST /api/v1/photos` in `apps/api/src/modules/photo/index.ts:15`) accepts files up to `UPLOAD_MAX_SIZE_BYTES` (default 10 MB). This is the only multipart/form-data route in the codebase.

Hono version: 4.12.19. `bodyLimit` ships with Hono — no additional package required.

## Goals / Non-Goals

**Goals:**
- Prevent DoS via large JSON payloads by rejecting bodies > 1 MB at the transport layer
- Preserve the existing 10 MB upload cap for `POST /api/v1/photos`
- Return the project's standard error envelope on 413
- Achieve ≥80% test coverage for the new code

**Non-Goals:**
- Changing the photo upload size limit or validation logic
- Adding body size limits to individual routes beyond the global 1 MB
- Modifying the errorHandler to handle `HTTPException` (unnecessary with `onError`)
- Deno server-level request body size configuration (Deno's default limits are sufficient — no equivalent to Bun's `maxRequestBodySize`)

## Decisions

### Decision 1: Use Hono's built-in `bodyLimit` middleware

**Chosen:** `import { bodyLimit } from 'hono/body-limit'`

**Alternatives considered:**
- **Custom middleware reading Content-Length**: Rejected — reinvents the wheel. Hono's `bodyLimit` handles both Content-Length header detection and body streaming.
- **Application-level validation per route**: Rejected — body is already buffered by the time it reaches the handler, defeating the purpose.
- **Deno HTTP server-level limit**: Rejected — no built-in Deno equivalent of Bun's `maxRequestBodySize`; also less flexible (can't exclude specific routes).

### Decision 2: Conditional wrapper to exclude photo route

**Chosen:** A conditional middleware that checks `c.req.path.startsWith('/api/v1/photos')` before applying `bodyLimit`.

```
app.use('*', rateLimitMiddleware(...));  // existing

app.use('*', async (c, next) => {       // new
  if (c.req.path.startsWith('/api/v1/photos')) return next();
  return jsonBodyLimit(c, next);
});

app.use('*', cache injection...);       // existing
```

**Alternatives considered:**
- **Apply `bodyLimit` per-route on every route except photos**: Rejected — verbose, error-prone (easy to forget new routes).
- **Two separate Hono apps**: Rejected — overengineered for this use case.
- **Use `bodyLimit` on photos with a higher limit (10 MB)**: Rejected but still acceptable — the conditional exclusion is cleaner because the photo route has its own `validateImageUpload()` check and its limit is configurable via `UPLOAD_MAX_SIZE_BYTES`. Having two limits (transport + application) could lead to confusing error messages.

### Decision 3: 1 MB limit

**Chosen:** 1 MB (1024 × 1024 bytes)

**Rationale:** Typical JSON API payloads (recipe creation, user registration, etc.) are < 10 KB. 1 MB is generous for JSON while providing meaningful protection against DoS. The photo upload route (the only legitimate large-body use case) is excluded.

### Decision 4: `onError` callback for standard error envelope

**Chosen:** Custom `onError` returning `error(c, 'PAYLOAD_TOO_LARGE', 'Request body too large', 413)`

This ensures:
- Consistent error format with the rest of the API (`{ success: false, error: { code, message, requestId } }`)
- No `HTTPException` thrown, so no modification to errorHandler needed
- `requestId` is available because `requestIdMiddleware` runs before `bodyLimit`

### Decision 5: Middleware position

**Chosen:** After `rateLimitMiddleware`, before cache injection

**Rationale:** Rate limiting should run first — a client flooding large payloads should be rate-limited before body inspection. Cache injection and crawler middleware don't need body access. Secure headers, CORS, and requestId are already upstream.

### Decision 6: How Hono `bodyLimit` detects oversized bodies

Hono's `bodyLimit` checks `Content-Length` header first. If present and exceeds `maxSize`, it calls `onError` immediately without reading the body. If `Content-Length` is absent (e.g., chunked transfer encoding), it streams the body and calls `onError` once the accumulated size exceeds `maxSize`. This handles both well-behaved clients (with Content-Length) and edge cases (chunked encoding without Content-Length).

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| 1 MB limit rejects legitimate large JSON payloads (e.g., bulk operations) | No existing endpoints accept > 1 MB JSON. Future bulk endpoints can be excluded from the wrapper or use a higher limit. |
| `startsWith('/api/v1/photos')` matches hypothetical future routes like `/api/v1/photos-meta` | Cosmetically imprecise but harmless — such a route would have a higher body limit, which is acceptable. Could be tightened to exact match or regex if needed. |
| `Content-Length` header can be spoofed to be lower than actual body size | Hono's `bodyLimit` still catches this because after reading past the claimed `Content-Length`, it either errors (unexpected data) or relies on streaming checks. In practice, Hono's request body parsing validates against `Content-Length`. |
| Deno's HTTP server has its own internal limits | Deno has no configurable equivalent of Bun's `maxRequestBodySize`. Deno's default HTTP server does not impose a hard body size limit — the limit comes from available memory. Adding `bodyLimit` at the Hono level is the right layer. |
