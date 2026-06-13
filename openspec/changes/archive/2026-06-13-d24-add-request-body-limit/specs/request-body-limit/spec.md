## ADDED Requirements

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

The `POST /api/v1/photos` route and all photo sub-routes SHALL be excluded from the 1 MB global body limit, allowing file uploads up to the application-level limit enforced by `validateImageUpload()` (`UPLOAD_MAX_SIZE_BYTES`, default 10 MB).

#### Scenario: Photo upload under 10 MB is accepted

- **WHEN** a client sends a multipart/form-data POST request to `/api/v1/photos` with a file under `UPLOAD_MAX_SIZE_BYTES`
- **THEN** the request reaches the photo upload handler
- **AND** the handler proceeds to `validateImageUpload()` for application-level validation

#### Scenario: Photo upload exceeding the application limit is rejected by validateImageUpload

- **WHEN** a client sends a multipart/form-data POST request to `/api/v1/photos` with a file exceeding `UPLOAD_MAX_SIZE_BYTES`
- **THEN** the request reaches the photo upload handler
- **AND** `validateImageUpload()` returns an error
- **AND** the handler returns HTTP 400 (unchanged behavior, not 413)

### Requirement: Middleware stack order

The `bodyLimit` middleware SHALL be registered after `rateLimitMiddleware` and before the cache injection middleware in the middleware stack, resulting in the following order:

```
cors → requestId → secureHeaders → rateLimit(100/min) → bodyLimit(1MB, excl. /api/v1/photos) → cache injection → crawler → routes
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
4. A request to `/api/v1/photos` with a large body (excluded, passes through)
5. A request exceeding `UPLOAD_MAX_SIZE_BYTES` to `/api/v1/photos` (returns 400, not 413)

#### Scenario: All body limit test cases pass

- **WHEN** `deno test --no-check --allow-all apps/api/src/middleware/bodyLimit.test.ts` is executed
- **THEN** all test cases pass
- **AND** coverage report shows ≥80% for the `bodyLimit` middleware logic
