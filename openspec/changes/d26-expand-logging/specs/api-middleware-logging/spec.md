## ADDED Requirements

### Requirement: Auth middleware logs authentication failures

The auth middleware SHALL emit log messages at warn or error level for every authentication failure path: missing token, invalid/expired token, user not found for valid token, and banned user.

#### Scenario: Missing token is logged at debug level

- **WHEN** a request arrives without an Authorization header
- **THEN** the system SHALL emit `log.debug({}, 'authMiddleware no token found in Authorization header')`
- **AND** return a 401 response unchanged

#### Scenario: Token verification failure is logged at error level

- **WHEN** a token verification throws an exception (caught in the catch block)
- **THEN** the system SHALL emit `log.error({ err }, 'authMiddleware token verification failed')`
- **AND** return a 401 response unchanged

#### Scenario: Valid token but user not found is logged at warn level

- **WHEN** a token payload contains a user ID that does not exist in the database
- **THEN** the system SHALL emit `log.warn({ userId: payload.sub }, 'authMiddleware user not found for valid token')`
- **AND** return a 401 response unchanged

#### Scenario: Banned user is logged at warn level

- **WHEN** an authenticated user has `isBanned = true`
- **THEN** the system SHALL emit `log.warn({ userId }, 'authMiddleware access denied: user is banned')`
- **AND** return a 403 response unchanged

### Requirement: Auth middleware logs successful authentication

The auth middleware SHALL emit a debug log when authentication succeeds and user context is set on the request.

#### Scenario: Successful authentication is logged

- **WHEN** a valid token is verified and the associated user is found and not banned
- **THEN** the system SHALL emit `log.debug({ userId }, 'authMiddleware authentication successful')`
- **AND** set `userId` and `user` on the Hono context as before

### Requirement: Admin middleware logs forbidden access

The admin middleware SHALL emit a warn log when a non-admin user attempts to access an admin-only route.

#### Scenario: Non-admin user is logged and rejected

- **WHEN** an authenticated user with `role !== 'admin'` accesses an admin-guarded route
- **THEN** the system SHALL emit `log.warn({ userId, role }, 'adminMiddleware access denied: non-admin user')`
- **AND** return a 403 response unchanged

#### Scenario: Admin user access is logged

- **WHEN** an authenticated user with `role === 'admin'` accesses an admin-guarded route
- **THEN** the system SHALL emit `log.debug({ userId }, 'adminMiddleware admin access granted')`

### Requirement: Rate limit middleware logs exceeded limits

The rate limit middleware SHALL emit a warn log with the client IP, user ID (if authenticated), and configured limit when the rate limit is exceeded.

#### Scenario: IP-based rate limit exceeded is logged

- **WHEN** an unauthenticated client exceeds the rate limit threshold
- **THEN** the system SHALL emit `log.warn({ ip: "<client-ip>", limit: 100 }, 'rateLimitMiddleware rate limit exceeded')`
- **AND** return a 429 response unchanged

#### Scenario: User-ID-based rate limit exceeded is logged

- **WHEN** an authenticated client exceeds the auth rate limit threshold
- **THEN** the system SHALL emit `log.warn({ userId: "<user-id>", ip: "<client-ip>", limit: 100 }, 'authRateLimitMiddleware rate limit exceeded')`
- **AND** return a 429 response unchanged

### Requirement: CORS middleware infrastructure is loggable

The CORS middleware SHALL import and instantiate a module-scoped logger so that blocked-origin debugging can be added to the origin-checking path.

#### Scenario: CORS middleware has logger available

- **WHEN** the `apps/api/src/middleware/cors.ts` file is loaded
- **THEN** the file SHALL contain `import { createLogger } from '../utils/logger/index.ts'`
- **AND** the file SHALL contain `const log = createLogger('cors-middleware')`

### Requirement: Request ID middleware infrastructure is loggable

The request ID middleware SHALL import and instantiate a module-scoped logger so that trace-level logging of ID generation vs received header can be added.

#### Scenario: Request ID middleware has logger available

- **WHEN** the `apps/api/src/middleware/requestId.ts` file is loaded
- **THEN** the file SHALL contain `import { createLogger } from '../utils/logger/index.ts'`
- **AND** the file SHALL contain `const log = createLogger('request-id-middleware')`

### Requirement: Middleware loggers follow naming convention

Each middleware file SHALL use the kebab-case middleware name suffixed with `-middleware` as the logger name.

#### Scenario: Auth middleware logger naming

- **WHEN** the auth middleware instantiates its logger
- **THEN** the logger name SHALL be `'auth-middleware'`

#### Scenario: Rate limit middleware logger naming

- **WHEN** the rate limit middleware instantiates its logger
- **THEN** the logger name SHALL be `'rate-limit-middleware'`

### Requirement: Optional auth middleware logs differently when token is present vs absent

The `optionalAuthMiddleware` function SHALL emit only `log.debug` calls and SHALL never emit `log.error` or `log.warn` when a token is absent, because missing tokens are expected in optional authentication flows. When a token is present and valid, it SHALL log the authenticated user ID at debug level. Token verification failures in optional auth SHALL be logged at debug level (not error), since unauthenticated access is still permitted.

#### Scenario: optionalAuthMiddleware emits only debug logs when token is absent

- **WHEN** a request arrives without an Authorization header to an optionally-authenticated route
- **THEN** the system SHALL emit `log.debug({}, 'optionalAuthMiddleware no auth token supplied (proceeding unauthenticated)')`
- **AND** SHALL NOT emit any `log.error` or `log.warn` calls
- **AND** SHALL proceed to the next middleware without setting `userId` or `user` on the context

#### Scenario: optionalAuthMiddleware logs successful optional authentication at debug level

- **WHEN** a request arrives with a valid Authorization header to an optionally-authenticated route
- **THEN** the system SHALL emit `log.debug({ userId: payload.sub }, 'optionalAuthMiddleware authenticated user')`
- **AND** SHALL set `userId` and `user` on the Hono context

#### Scenario: optionalAuthMiddleware logs token verification failure at debug level (not error)

- **WHEN** a request arrives with an invalid/expired token to an optionally-authenticated route
- **THEN** the system SHALL emit a `log.debug` call (not `log.error`) indicating token verification failed
- **AND** SHALL proceed to the next middleware without setting auth context
- **AND** SHALL NOT return a 401 response (optional auth allows unauthenticated access)

### Requirement: Middleware logging must not alter the HTTP response status code or body

Every log call added to middleware functions SHALL be placed such that it does not change the existing control flow, response status code, or response body. Log statements SHALL be purely additive — inserted before `return c.json(...)` without modifying the arguments to `c.json()`.

#### Scenario: Auth middleware 401 response is unchanged after logging is added

- **WHEN** a request with a missing token triggers `log.debug` and returns a 401 response
- **THEN** the response status code SHALL be 401
- **AND** the response body SHALL be `{ message: 'Unauthorized' }` (unchanged from before logging was added)

#### Scenario: Auth middleware 403 response is unchanged after logging is added

- **WHEN** a request from a banned user triggers `log.warn` and returns a 403 response
- **THEN** the response status code SHALL be 403
- **AND** the response body SHALL be `{ message: 'Account suspended' }` (unchanged from before logging was added)

#### Scenario: Rate limit middleware 429 response is unchanged after logging is added

- **WHEN** a request exceeds the rate limit, triggering `log.warn` and a 429 response
- **THEN** the response status code SHALL be 429
- **AND** the response body SHALL be `{ message: 'Too many requests' }` (unchanged from before logging was added)

#### Scenario: Admin middleware 403 response is unchanged after logging is added

- **WHEN** a non-admin user triggers `log.warn` and a 403 response from admin middleware
- **THEN** the response status code SHALL be 403
- **AND** the response body SHALL be `{ message: 'Forbidden' }` (unchanged from before logging was added)

### Requirement: Auth middleware catch block log.error includes the err object without exposing token contents

When token verification throws an exception in `authMiddleware`, the `log.error` call in the catch block SHALL include the caught error object as `{ err }` so the stack trace and error message are available for debugging. The log call SHALL NOT include the raw token string, token payload, or any part of the Authorization header value.

#### Scenario: Token verification failure log includes err but not the token

- **WHEN** `authMiddleware` catches an error from `verify(token, secret)` due to an expired or malformed JWT
- **THEN** the system SHALL emit `log.error({ err }, 'authMiddleware token verification failed')`
- **AND** the log context SHALL contain the `err` object (error message, stack trace)
- **AND** the log context SHALL NOT contain the `token` variable, the Authorization header value, or any decoded JWT payload

#### Scenario: Pino redaction provides defense-in-depth for token fields

- **WHEN** the API logger is configured with Pino
- **THEN** Pino's redaction configuration SHALL redact the keys `token`, `secret`, `authorization`, and `passwordHash` from all log output
- **AND** even if a developer accidentally includes a token in a log context, Pino SHALL replace its value with `[Redacted]`

### Requirement: Successful admin middleware access is logged for audit trail

The admin middleware SHALL emit a `log.debug` call when an admin user is granted access, providing a record of admin route access that can be elevated to info level if needed for audit purposes.

#### Scenario: Admin access grant is logged with user ID

- **WHEN** an authenticated admin user accesses an admin-guarded route
- **THEN** the system SHALL emit `log.debug({ userId }, 'adminMiddleware admin access granted')`
- **AND** SHALL call `await next()` to proceed to the route handler
