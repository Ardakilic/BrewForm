## Why

The API has no global transport-level request body size limit. All `POST`, `PUT`, and `PATCH` endpoints accept arbitrarily large payloads, fully buffering them into memory before any application-level validation runs. A malicious or buggy client sending a multi-gigabyte body can exhaust server memory and cause an OOM crash. The existing photo upload route has an application-level size check (`validateImageUpload`), but this fires **after** the full multipart body is already in memory — it is not a transport-level guard.

## What Changes

- Add Hono's built-in `bodyLimit` middleware with a **1 MB limit** for all JSON endpoints
- Exclude `POST /api/v1/photos` from the global limit (it accepts files up to `UPLOAD_MAX_SIZE_BYTES` = 10 MB, and enforces its own application-level cap via `validateImageUpload()`)
- Return the project's standard JSON error envelope (`{ success: false, error: { code, message, requestId } }`) on 413 responses via the `onError` callback
- Update the middleware stack JSDoc comment in `main.ts`
- Add unit and integration tests covering: within-limit requests, over-limit requests, photo route exclusion, and GET requests

## Capabilities

### New Capabilities

- `request-body-limit`: Transport-level enforcement of maximum request body size, applied globally except for file upload routes

### Modified Capabilities

None — this is a new security hardening capability; existing endpoint behavior is preserved.

## Impact

- `apps/api/src/main.ts` — add `bodyLimit` middleware import, conditional wrapper, and update JSDoc
- New: `apps/api/src/middleware/bodyLimit.test.ts` — tests for the body limit behavior
- No database changes, no schema changes, no new dependencies
