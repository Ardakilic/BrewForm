# request-body-limit Specification

## Purpose
TBD - created by archiving change d24-add-request-body-limit. Update Purpose after archive.
## Requirements
### Requirement: Global request body size limit

The system SHALL reject HTTP requests whose body exceeds **1 MB** (1,048,576 bytes) with status **413 Payload Too Large**, except for the photo upload route which SHALL be excluded from this limit.

The error response SHALL follow the project's standard error envelope:
```json
{
  "success": false,
  "error": {
    "code": "PAYLOAD_TOO_LARGE",
    "message": "Request body too large",
    "requestId": "<uuid>"
  }
}
```

The `requestId` field SHALL be the same value set by the `requestIdMiddleware`.

#### Scenario: JSON request within the 1 MB limit passes through

- **WHEN** a client sends a POST request with a JSON body smaller than 1 MB AND a `Content-Length` header
- **THEN** the request reaches the route handler and returns the handler's response

#### Scenario: JSON request exceeding the 1 MB limit is rejected

- **WHEN** a client sends a POST request with a JSON body larger than 1 MB AND a `Content-Length` header
- **THEN** the system returns HTTP 413 with the standard error envelope containing code `PAYLOAD_TOO_LARGE`
- **AND** the route handler is never invoked

#### Scenario: Chunked request exceeding the 1 MB limit is rejected

- **WHEN** a client sends a POST request using chunked transfer encoding (no `Content-Length` header) whose body exceeds 1 MB
- **THEN** the system returns HTTP 413 with the standard error envelope
- **AND** the route handler is never invoked

#### Scenario: GET requests are unaffected

- **WHEN** a client sends a GET request to any endpoint (no request body)
- **THEN** the request reaches the route handler normally

### Requirement: Photo upload route exclusion

The `POST /api/v1/photos` route and all photo sub-routes SHALL be excluded from the 1 MB global body limit and SHALL instead be subject to the photo upload body cap defined by the `photo-upload-security` capability (`UPLOAD_MAX_SIZE_BYTES` + thumbnail cap + 64 KiB multipart overhead), so that file uploads up to the application-level limit enforced by `validateImagePart()` (`UPLOAD_MAX_SIZE_BYTES`, default 10 MB) are accepted while larger bodies are rejected with 413 before being buffered.

#### Scenario: Photo upload under 10 MB is accepted

- **WHEN** a client sends a multipart/form-data POST request to `/api/v1/photos` with a file under `UPLOAD_MAX_SIZE_BYTES`
- **THEN** the request reaches the photo upload handler
- **AND** the handler proceeds to `validateImagePart()` for application-level validation

#### Scenario: Photo upload exceeding the application limit is rejected by validateImagePart

- **WHEN** a client sends a multipart/form-data POST request to `/api/v1/photos` whose body is within the photo body cap but whose file part exceeds `UPLOAD_MAX_SIZE_BYTES`
- **THEN** the request reaches the photo upload handler
- **AND** `validateImagePart()` rejects the part
- **AND** the handler returns HTTP 400 with code `FILE_TOO_LARGE` (not 413)

#### Scenario: Photo request body above the photo cap is rejected before buffering

- **WHEN** a client sends a request to any `/api/v1/photos` route whose `Content-Length` (or streamed size) exceeds the photo body cap
- **THEN** the system returns HTTP 413 `PAYLOAD_TOO_LARGE` with the standard error envelope
- **AND** the route handler is never invoked

### Requirement: Middleware stack order

The `bodyLimit` middleware SHALL be registered after the global rate-limit middleware (`rateLimit(POLICIES.global)`, defined by the `api-rate-limiting` capability) and before the cache injection middleware in the middleware stack, resulting in the following order:

```
cors → requestId → secureHeaders → rateLimit(global policy) → bodyLimit(1MB; photo routes: photo cap) → cache injection → crawler → routes
```

#### Scenario: Rate limiting runs before body inspection

- **WHEN** a client exceeds the rate limit AND sends an oversized body
- **THEN** the system returns HTTP 429 (rate limited) before inspecting the body size
- **AND** `bodyLimit` is not invoked

### Requirement: Test coverage

The `bodyLimit` middleware behavior SHALL be covered by automated tests achieving at least 80% code coverage. Tests SHALL cover:

1. A request with body under 1 MB (passes through)
2. A request with body over 1 MB (returns 413 with correct envelope)
3. A GET request (unaffected)
4. A request to `/api/v1/photos` with a body larger than 1 MB but within the photo body cap (passes through)
5. A request to `/api/v1/photos` whose `Content-Length` or chunked body exceeds the photo body cap (returns 413 `PAYLOAD_TOO_LARGE`; the handler is not invoked)
6. A request to `/api/v1/photos` whose file part exceeds `UPLOAD_MAX_SIZE_BYTES` while the body stays within the cap (returns 400 `FILE_TOO_LARGE`, not 413)

#### Scenario: All body limit test cases pass

- **WHEN** `pnpm --filter @brewform/api exec vitest run src/middleware/bodyLimit.test.ts` is executed (inside Docker: `make test-specific filter=bodyLimit.test.ts`)
- **THEN** all test cases pass
- **AND** coverage report shows ≥80% for the `bodyLimit` middleware logic

