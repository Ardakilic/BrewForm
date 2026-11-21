## MODIFIED Requirements

### Requirement: Limiter degrades safely when the shared store is unavailable
The rate limiter SHALL NEVER turn a store failure into an HTTP 5xx or a stalled request. When the redis backend is unreachable, slow or erroring, it SHALL fall back to per-process in-memory limiting (fail-soft). If even the fallback throws, it SHALL allow the request (fail-open).

The limiter's ioredis client SHALL be created with `enableOfflineQueue: false`, `maxRetriesPerRequest: 1`, a command timeout of at most 500 ms and a connect timeout of at most 2000 ms, so a check against a dead server fails within the command timeout. `RateLimiterRedis` SHALL be configured with `rejectIfRedisNotReady: true` and an `insuranceLimiter` (`RateLimiterMemory` with the same points and duration). The limiter SHALL log `warn` once when it enters degraded mode (`{ store: 'redis', err }`), log `info` once on recovery (with the count of decisions made in degraded mode), and log `error` with `{ err, policy }` for each fail-open decision. It SHALL leave degraded mode on the first store call that succeeds after the failure, or when the client emits `ready`, whichever comes first, so a command timeout or an error reply on a live connection does not leave `/ready` reporting `degraded`; a later store failure SHALL start a new outage with its own warn. `/health` and `/ready` SHALL keep answering while Valkey is down.

#### Scenario: Valkey outage keeps the API serving and limiting
- **WHEN** the Valkey server is stopped while the API runs with `RATE_LIMIT_STORE=redis`
- **THEN** requests keep returning their normal status codes within the command timeout, a client exceeding a policy still receives 429 from the per-process fallback, and `GET /health` returns 200

#### Scenario: Degraded-mode transitions are logged once
- **WHEN** 100 requests are served during a single Valkey outage and Valkey then recovers
- **THEN** exactly one degraded-mode warn log and one recovery info log are emitted for that outage

#### Scenario: A command error on a live connection clears on the next success
- **WHEN** one limiter command times out while the Valkey connection stays up, the next command succeeds, and a later command fails again
- **THEN** the store status is `degraded` after the first failure and `ok` after the success, one recovery info log is emitted, and the second failure logs a second degraded-mode warn

#### Scenario: Fallback failure fails open
- **WHEN** both the primary and the fallback limiter throw an `Error` for a request
- **THEN** the request reaches the route handler, and an error log with `policy` and `err` (but no IP or email) is emitted

### Requirement: Login is protected per IP and per account
`POST /api/v1/auth/login` SHALL apply the `auth-login-ip`, `auth-login-fail-ip`, `auth-login-fail-account-ip` and `auth-login-fail-account` policies.

Failure-only policies SHALL reserve one point with an atomic `consume` before the handler runs and SHALL return 429 when that consume is rejected, so concurrent requests can never pass the limit together. After the handler, the reserved point SHALL stay only when the response status is 401 (invalid credentials); for every other status it SHALL be given back with `reward`, except that a 2xx login SHALL delete the `auth-login-fail-account-ip` counter for that email and IP. A request answered with 429 keeps its point. Failed attempts for email addresses that have no account SHALL be counted exactly like those for existing accounts, and the 429 body SHALL be identical in both cases, so the limiter does not reveal whether an account exists. A successful `POST /api/v1/auth/reset-password` SHALL delete both `auth-login-fail-account-ip` (for the requesting IP) and `auth-login-fail-account` counters for the account whose password was reset. That gives a locked-out owner a way back in.

#### Scenario: Five wrong passwords lock that account from that IP
- **WHEN** a client sends 5 logins with a wrong password for `alice@example.com` within 15 minutes, then a 6th with the correct password
- **THEN** the 6th request returns 429 with `Retry-After` set and does not authenticate

#### Scenario: Concurrent wrong passwords cannot pass the limit together
- **WHEN** 8 logins with a wrong password for one email are sent from one IP at the same time
- **THEN** exactly 5 of them return 401 and 3 return 429

#### Scenario: Successful and non-401 attempts do not use up the failure budget
- **WHEN** a client logs in successfully 10 times from one IP within 15 minutes and then sends 3 login requests that fail validation with 400
- **THEN** none of those requests returns 429, and the `auth-login-fail-ip` and `auth-login-fail-account` counters for that IP and email hold 0 points

#### Scenario: Another IP is not locked by the account-and-IP counter
- **WHEN** one IP has triggered `auth-login-fail-account-ip` for `alice@example.com` and a different IP logs in with the correct password
- **THEN** the login succeeds, provided `auth-login-fail-account` has not reached 20

#### Scenario: Success resets the consecutive-failure counter
- **WHEN** a client fails 4 logins for an email and then logs in successfully
- **THEN** the next 4 failed attempts from that IP for that email do not trigger 429

#### Scenario: Distributed attack on one account is capped
- **WHEN** 20 failed logins for `alice@example.com` arrive from 20 different IPs within 60 minutes
- **THEN** the 21st login attempt for that email from any IP returns 429 until the window ends

#### Scenario: Unknown emails behave like known ones
- **WHEN** a client fails 5 logins for an email with no account
- **THEN** the 6th attempt returns 429 with the same status, body and headers as for an existing account

#### Scenario: Password reset unlocks the account
- **WHEN** an account is locked by `auth-login-fail-account` and its owner completes `POST /api/v1/auth/reset-password`
- **THEN** the owner's next login with the new password succeeds
