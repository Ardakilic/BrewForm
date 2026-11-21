# api-rate-limiting Specification

## Purpose
TBD - created by archiving change wave-6-audit-remediation. Update Purpose after archive.
## Requirements
### Requirement: Client IP is resolved from a configured trust boundary
The API SHALL derive the client IP used for rate limiting through a single helper `getClientIp(c)` (`apps/api/src/utils/client-ip/index.ts`) driven by the `TRUST_PROXY` configuration, and SHALL NEVER use a raw `X-Forwarded-For`, `X-Real-IP` or `CF-Connecting-IP` header string as a rate-limit key.

The helper SHALL implement exactly these modes:

- `none` (default): the TCP peer address from `getConnInfo(c)` (`@hono/node-server/conninfo`). All forwarding headers are ignored.
- `hops`: build the chain `[...X-Forwarded-For entries, socket peer]` and select the entry at index `chain.length - 1 - TRUST_PROXY_HOPS`, clamped to `0`. The socket peer counts as the first trusted proxy. Entries that are not valid IPs (`node:net` `isIP()` returns `0`) are dropped before selection.
- `cloudflare`: compute the `hops` candidate. If that candidate is inside Cloudflare's published IP ranges, or inside a CIDR listed in `TRUST_PROXY_CIDRS`, and `CF-Connecting-IP` is a valid IP, return `CF-Connecting-IP`. Otherwise return the candidate.

The returned address SHALL be normalised: trimmed, an IPv6 zone index stripped, IPv4-mapped IPv6 (`::ffff:a.b.c.d`) converted to IPv4, and IPv6 lower-cased. For use as a rate-limit key, an IPv6 address SHALL be reduced to its /64 prefix. When no address can be determined (for example, no socket in an in-process `app.request()` test), the helper SHALL return `null` and the limiter SHALL use the literal bucket `unknown`.

#### Scenario: Spoofed X-Forwarded-For is ignored in none mode
- **WHEN** `TRUST_PROXY=none`, the socket peer is `203.0.113.7`, and the request carries `X-Forwarded-For: 1.2.3.4`
- **THEN** `getClientIp(c)` returns `203.0.113.7`

#### Scenario: Client-controlled prefix cannot change the key in hops mode
- **WHEN** `TRUST_PROXY=hops`, `TRUST_PROXY_HOPS=1`, the socket peer is the proxy `10.0.1.5`, and the request carries `X-Forwarded-For: <any attacker-chosen values>, 198.51.100.20`
- **THEN** `getClientIp(c)` returns `198.51.100.20` regardless of the attacker-chosen entries

#### Scenario: Two trusted hops select the correct entry
- **WHEN** `TRUST_PROXY=hops`, `TRUST_PROXY_HOPS=2`, the socket peer is `10.0.1.5`, and `X-Forwarded-For: 6.6.6.6, 198.51.100.20, 172.70.1.1`
- **THEN** `getClientIp(c)` returns `198.51.100.20`

#### Scenario: Forged CF-Connecting-IP from outside Cloudflare is rejected
- **WHEN** `TRUST_PROXY=cloudflare`, `TRUST_PROXY_HOPS=1`, and the selected hop is `198.51.100.99`, which is not a Cloudflare or `TRUST_PROXY_CIDRS` address, and the request carries `CF-Connecting-IP: 1.1.1.1`
- **THEN** `getClientIp(c)` returns `198.51.100.99`

#### Scenario: CF-Connecting-IP is honoured when the hop is a Cloudflare edge
- **WHEN** `TRUST_PROXY=cloudflare`, the selected hop is inside a published Cloudflare range, and `CF-Connecting-IP: 198.51.100.20`
- **THEN** `getClientIp(c)` returns `198.51.100.20`

#### Scenario: IPv6 clients are bucketed by /64
- **WHEN** two requests resolve to `2001:db8:1:2::a` and `2001:db8:1:2:ffff::b`
- **THEN** both produce the same rate-limit key component `2001:db8:1:2::/64`

#### Scenario: IPv4-mapped addresses are normalised
- **WHEN** the socket peer is `::ffff:203.0.113.7` in `none` mode
- **THEN** `getClientIp(c)` returns `203.0.113.7`

#### Scenario: Missing socket yields the unknown bucket
- **WHEN** a request is dispatched with `app.request()` and no connection info, in `none` mode
- **THEN** `getClientIp(c)` returns `null` and the limiter keys the request under `unknown`

### Requirement: Trusted-proxy and rate-limit settings are validated environment configuration
The API environment schema (`apps/api/src/config/env.ts`) SHALL define and validate the rate-limit and trusted-proxy settings below, and SHALL refuse to boot with an invalid value.

| Variable | Type / allowed values | Default |
|---|---|---|
| `TRUST_PROXY` | `none` \| `hops` \| `cloudflare` | `none` |
| `TRUST_PROXY_HOPS` | integer 1–5 | `1` |
| `TRUST_PROXY_CIDRS` | optional comma-separated IPv4/IPv6 CIDRs, each validated | unset |
| `RATE_LIMIT_ENABLED` | `true` \| `false` | `true` |
| `RATE_LIMIT_STORE` | `memory` \| `redis` | `memory` |
| `RATE_LIMIT_GLOBAL_MAX` | positive integer (requests per 60 s per client) | `100` |

`RATE_LIMIT_STORE=redis` SHALL require `REDIS_URL` (validated in `superRefine`), independently of `CACHE_ENABLED` and `CACHE_DRIVER`. Empty-string values injected by compose (`${VAR:-}`) SHALL be treated as unset, following the `api-env-config` capability's empty-value rule. At startup the API SHALL log the effective settings at info level (`{ enabled, store, trustProxy, hops }`, with no secrets or URLs). It SHALL log a warn line when `RATE_LIMIT_ENABLED=false`. The first time a request carrying `X-Forwarded-For` arrives while `TRUST_PROXY=none`, it SHALL log one warn line per process saying that all proxied clients may share one bucket.

#### Scenario: Invalid trust mode fails validation
- **WHEN** the API starts with `TRUST_PROXY=xff`
- **THEN** env validation fails and the process exits before binding the port

#### Scenario: Invalid CIDR fails validation
- **WHEN** the API starts with `TRUST_PROXY_CIDRS=10.0.0.0/33`
- **THEN** env validation fails with an error naming `TRUST_PROXY_CIDRS`

#### Scenario: Redis store requires a URL even with the cache disabled
- **WHEN** the API starts with `CACHE_ENABLED=false`, `RATE_LIMIT_STORE=redis`, and no `REDIS_URL`
- **THEN** env validation fails with an error naming `REDIS_URL`

#### Scenario: Misconfiguration hint is logged once
- **WHEN** `TRUST_PROXY=none` and two requests carrying `X-Forwarded-For` arrive
- **THEN** exactly one warn log about the untrusted forwarding header is emitted for the process

### Requirement: Rate-limit state is independent of the cache
Rate-limit counters SHALL be stored in a dedicated rate-limit backend selected by `RATE_LIMIT_STORE`, and SHALL NOT be read or written through `CacheProvider`, `NullCacheProvider` or the cache singleton.

`CACHE_ENABLED=false` SHALL NOT disable or weaken rate limiting. Rate limiting SHALL be disabled only by the explicit `RATE_LIMIT_ENABLED=false`, in which case every limiter middleware is a pass-through that sets no rate-limit headers. With `RATE_LIMIT_STORE=redis` the backend SHALL keep all keys under the `brewform-rl:` root, which is outside the cache namespace `brewform:`, so cache flushes never touch limiter state. The backend SHALL be replaceable in tests via `setRateLimitBackend()` / `resetRateLimitBackend()` (fresh memory backend).

#### Scenario: Limiter still works with caching disabled
- **WHEN** `CACHE_ENABLED=false`, `RATE_LIMIT_STORE=memory`, and a client sends 101 requests in 60 seconds
- **THEN** the 101st request returns HTTP 429

#### Scenario: Explicit disable is a pass-through
- **WHEN** `RATE_LIMIT_ENABLED=false` and a client sends 200 requests in 60 seconds
- **THEN** none of them returns 429 and no `RateLimit`, `RateLimit-Policy` or `X-RateLimit-*` header is set

#### Scenario: Cache flush does not reset rate-limit counters
- **WHEN** a client has exhausted a limit on the redis backend and `make flush-cache` (or the admin "flush all" action) runs
- **THEN** the client's next request in the same window still returns 429

### Requirement: Shared-store counters are atomic across requests and replicas
With `RATE_LIMIT_STORE=redis`, each limit check SHALL increment the counter and set its expiry in one atomic server-side operation, so that concurrent requests on one or more API replicas never lose increments.

The redis backend SHALL use `rate-limiter-flexible`'s `RateLimiterRedis` (atomic Lua increment with TTL) on a dedicated ioredis client. The memory backend SHALL use `RateLimiterMemory`, whose keys expire with their window. A limit of N SHALL allow exactly N requests per key per window under concurrency.

Limiter state SHALL be bounded in memory as well as in the shared store. Every in-memory counter (the memory backend and the redis insurance limiter) SHALL be dropped when its window ends, so per-process limiter memory is proportional to the number of distinct keys seen in the longest policy window (at most 24 h), never to the process lifetime. Every shared-store key SHALL carry a TTL equal to its policy window. The unbounded `Map` of the old cache-backed limiter SHALL NOT be reused.

#### Scenario: Memory counters expire with their window
- **WHEN** the memory backend counts one request for each of 1,000 distinct keys under a 60 s policy, and the fake clock then advances past 60 s
- **THEN** `limiter.get(key)` returns no record for any of those keys, and a new request for one of them starts a fresh window

#### Scenario: Shared-store keys always have a TTL
- **WHEN** the Valkey integration suite consumes a policy with a 15-minute window
- **THEN** the `brewform-rl:<policy-id>:<key>` key has a positive TTL of at most 900 seconds

#### Scenario: Concurrent burst on Valkey admits exactly the limit
- **WHEN** an integration test against Valkey 9.1 fires 50 concurrent checks against a policy with limit 10 for one key
- **THEN** exactly 10 are allowed and 40 are rejected

#### Scenario: Two replicas share one budget
- **WHEN** two API processes use the same Valkey and a client alternates requests between them under a limit of 10 per window
- **THEN** the 11th request in the window returns 429 regardless of which process serves it

### Requirement: Limiter degrades safely when the shared store is unavailable
The rate limiter SHALL NEVER turn a store failure into an HTTP 5xx or a stalled request. When the redis backend is unreachable, slow or erroring, it SHALL fall back to per-process in-memory limiting (fail-soft). If even the fallback throws, it SHALL allow the request (fail-open).

The limiter's ioredis client SHALL be created with `enableOfflineQueue: false`, `maxRetriesPerRequest: 1`, a command timeout of at most 500 ms and a connect timeout of at most 2000 ms, so a check against a dead server fails within the command timeout. `RateLimiterRedis` SHALL be configured with `rejectIfRedisNotReady: true` and an `insuranceLimiter` (`RateLimiterMemory` with the same points and duration). The limiter SHALL log `warn` once when it enters degraded mode (`{ store: 'redis', err }`), log `info` once on recovery (with the count of decisions made in degraded mode), and log `error` with `{ err, policy }` for each fail-open decision. `/health` and `/ready` SHALL keep answering while Valkey is down.

#### Scenario: Valkey outage keeps the API serving and limiting
- **WHEN** the Valkey server is stopped while the API runs with `RATE_LIMIT_STORE=redis`
- **THEN** requests keep returning their normal status codes within the command timeout, a client exceeding a policy still receives 429 from the per-process fallback, and `GET /health` returns 200

#### Scenario: Degraded-mode transitions are logged once
- **WHEN** 100 requests are served during a single Valkey outage and Valkey then recovers
- **THEN** exactly one degraded-mode warn log and one recovery info log are emitted for that outage

#### Scenario: Fallback failure fails open
- **WHEN** both the primary and the fallback limiter throw an `Error` for a request
- **THEN** the request reaches the route handler, and an error log with `policy` and `err` (but no IP or email) is emitted

### Requirement: Rate limits are expressed as named policies with isolated counters
Every rate limit SHALL be defined as a named policy in `apps/api/src/utils/rate-limit/policies.ts` (id, key dimension, limit, window, counting mode, 429 message), and each policy SHALL count in its own key namespace `<policy-id>:<key>`, so no two policies or routes share a counter.

The default policy table SHALL be:

| Policy id | Route(s) | Key | Limit / window | Counting |
|---|---|---|---|---|
| `global` | every route except `/health`, `/ready`, `GET /uploads/*` | IP | `RATE_LIMIT_GLOBAL_MAX` (100) / 60 s | every request |
| `uploads` | `GET /uploads/*` (local storage driver) | IP | 600 / 60 s | every request |
| `auth-login-ip` | `POST /api/v1/auth/login` | IP | 20 / 15 min | every request |
| `auth-login-fail-ip` | `POST /api/v1/auth/login` | IP | 100 / 24 h | failed attempts only |
| `auth-login-fail-account-ip` | `POST /api/v1/auth/login` | email + IP | 5 / 15 min | failed attempts only; reset on success |
| `auth-login-fail-account` | `POST /api/v1/auth/login` | email | 20 / 60 min | failed attempts only |
| `auth-register-ip` | `POST /api/v1/auth/register` | IP | 5 / 60 min | every request |
| `auth-forgot-ip` | `POST /api/v1/auth/forgot-password` | IP | 5 / 15 min | every request |
| `auth-forgot-account` | `POST /api/v1/auth/forgot-password` | email | 3 / 60 min | every request |
| `auth-token-ip` | `POST /api/v1/auth/reset-password`, `POST /api/v1/auth/verify-email` | IP | 10 / 15 min | every request |
| `auth-verify-send-ip` | `POST /api/v1/auth/send-verification` | IP | 10 / 60 min | every request |
| `auth-verify-send-user-burst` | `POST /api/v1/auth/send-verification` | user id | 1 / 60 s | every request |
| `auth-verify-send-user-daily` | `POST /api/v1/auth/send-verification` | user id | 5 / 24 h | every request |
| `contact-ip` | `POST /api/v1/contact` | IP | 3 / 15 min | every request |
| `comment-ip` | `POST /api/v1/comments/recipe/:recipeId` | IP | 5 / 60 s | every request |
| `comment-user` | `POST /api/v1/comments/recipe/:recipeId` | user id | 5 / 60 s | every request |
| `report-ip` | `POST /api/v1/reports` | IP | 3 / 15 min | every request |
| `report-user` | `POST /api/v1/reports` | user id | 3 / 15 min | every request |

On each route, IP-keyed policies SHALL run before body validation and authentication. Email-keyed policies SHALL run after `zValidator` and read the validated, trimmed, lower-cased email. User-keyed policies SHALL run after `authMiddleware`. The former shared `auth-ratelimit:<ip>` counter and the `rateLimitMiddleware` / `authRateLimitMiddleware` factories SHALL be removed.

#### Scenario: Login, register and forgot-password no longer share a budget
- **WHEN** a client successfully registers, logs in twice and requests a password reset within 15 minutes
- **THEN** none of those requests returns 429

#### Scenario: Health probes and local uploads bypass the global limiter
- **WHEN** a client sends 150 `GET /health` requests and 150 `GET /uploads/<file>` requests in 60 seconds
- **THEN** none of them returns 429

#### Scenario: Each policy has its own namespace
- **WHEN** a client has exhausted `contact-ip`
- **THEN** its `POST /api/v1/reports` and `POST /api/v1/auth/login` requests are not rejected by `contact-ip`

### Requirement: Login is protected per IP and per account
`POST /api/v1/auth/login` SHALL apply the `auth-login-ip`, `auth-login-fail-ip`, `auth-login-fail-account-ip` and `auth-login-fail-account` policies.

Failure-only policies SHALL check the counter before the handler runs and return 429 while the counter has reached its limit. After the handler, they SHALL consume one point only when the response status is 401 (invalid credentials). A 2xx login SHALL delete the `auth-login-fail-account-ip` counter for that email and IP. Failed attempts for email addresses that have no account SHALL be counted exactly like those for existing accounts, and the 429 body SHALL be identical in both cases, so the limiter does not reveal whether an account exists. A successful `POST /api/v1/auth/reset-password` SHALL delete both `auth-login-fail-account-ip` (for the requesting IP) and `auth-login-fail-account` counters for the account whose password was reset. That gives a locked-out owner a way back in.

#### Scenario: Five wrong passwords lock that account from that IP
- **WHEN** a client sends 5 logins with a wrong password for `alice@example.com` within 15 minutes, then a 6th with the correct password
- **THEN** the 6th request returns 429 with `Retry-After` set and does not authenticate

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

### Requirement: Registration, password-reset and verification emails are throttled
The API SHALL throttle every route that sends email or creates accounts with both an IP-keyed and an identity-keyed policy, so that neither one IP nor one target address can be used to flood a mailbox or the instance's SMTP quota.

`POST /api/v1/auth/register` SHALL apply `auth-register-ip`. `POST /api/v1/auth/forgot-password` SHALL apply `auth-forgot-ip` and `auth-forgot-account`, and SHALL still return its generic 200 body whenever it is not rate-limited. `POST /api/v1/auth/send-verification` SHALL apply `auth-verify-send-ip` before `authMiddleware`, and `auth-verify-send-user-burst` plus `auth-verify-send-user-daily` after it. `POST /api/v1/auth/reset-password` and `POST /api/v1/auth/verify-email` SHALL apply `auth-token-ip`.

#### Scenario: Verification resend is limited to one per minute
- **WHEN** an authenticated, unverified user calls `POST /api/v1/auth/send-verification` twice within 60 seconds
- **THEN** the first returns 200, the second returns 429 with `Retry-After` of at most 60, and only one email is sent

#### Scenario: Verification resend is limited per day
- **WHEN** the same user calls send-verification once every 61 seconds, six times
- **THEN** the sixth call returns 429

#### Scenario: Reset emails to one address are capped
- **WHEN** 4 `POST /api/v1/auth/forgot-password` requests for `victim@example.com` arrive from 4 different IPs within 60 minutes
- **THEN** the 4th returns 429 and at most 3 reset emails are sent

### Requirement: Rate-limited responses follow one contract
Every 429 produced by the limiter SHALL use the standard error envelope `{ success: false, error: { code: 'RATE_LIMITED', message, requestId } }`, where `message` is the policy's message and `requestId` comes from the request context, and SHALL carry a `Retry-After` header with the whole seconds until the key's window resets (minimum 1).

On every request a counting (non-failure-only) policy evaluates, the limiter SHALL append an item for that policy to the IETF `draft-ietf-httpapi-ratelimit-headers-11` fields `RateLimit-Policy: "<policy-id>";q=<limit>;w=<window-seconds>` and `RateLimit: "<policy-id>";r=<remaining>;t=<seconds-to-reset>`. It SHALL keep setting the legacy `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (epoch seconds) for the last policy evaluated. Failure-only policies SHALL emit headers only on their own 429. The CORS middleware SHALL list `Retry-After`, `RateLimit`, `RateLimit-Policy`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` in `exposeHeaders`. Messages SHALL be specific to the policy: login policies say "Too many login attempts, please try again later", and others say e.g. "Too many registration attempts…" or the generic "Too many requests, please try again later".

#### Scenario: 429 carries envelope and Retry-After
- **WHEN** a client exceeds `contact-ip`
- **THEN** the response is 429 with `error.code === 'RATE_LIMITED'`, a non-empty `error.requestId`, and a `Retry-After` header between 1 and 900

#### Scenario: Multiple policies appear as list items
- **WHEN** a request to `POST /api/v1/contact` is evaluated by `global` and `contact-ip`
- **THEN** the `RateLimit-Policy` header contains both `"global";q=100;w=60` and `"contact-ip";q=3;w=900`, and `X-RateLimit-Limit` is `3`

#### Scenario: Browser can read rate-limit headers cross-origin
- **WHEN** the SPA origin makes a CORS request that is rate-limited
- **THEN** the response's `Access-Control-Expose-Headers` includes `Retry-After` and `RateLimit`

#### Scenario: Register 429 does not mention login
- **WHEN** a client exceeds `auth-register-ip`
- **THEN** the 429 message does not contain the word "login"

### Requirement: Rate-limit keys and logs contain no raw personal data
Rate-limit store keys SHALL be bounded in length and SHALL NOT contain raw email addresses: email-keyed policies SHALL use the first 32 hex characters of the SHA-256 of the normalised email, and IP keys SHALL use the normalised address (IPv6 as its /64 prefix).

Limiter and client-IP log lines SHALL NEVER include IP addresses, email addresses, raw header values or store keys. They SHALL include only `policy`, `limit`, `userId` (when authenticated), `requestId`-scoped context and `err`. The registration-disabled warn log in `modules/auth/index.ts` SHALL drop its `ip` field.

#### Scenario: Email is hashed in the store key
- **WHEN** `auth-forgot-account` records a request for `Alice@Example.com `
- **THEN** the stored key is `auth-forgot-account:<32-hex sha256 of "alice@example.com">` and contains no `@`

#### Scenario: Exceeded-limit log has no IP
- **WHEN** a client exceeds `global`
- **THEN** the warn log `rateLimitMiddleware rate limit exceeded` has context `{ policy: 'global', limit: 100 }` and no IP, email or key field

#### Scenario: Registration-disabled log has no IP
- **WHEN** registration is disabled and a client calls `POST /api/v1/auth/register`
- **THEN** the warn log `Registration attempt while disabled` has no `ip` field

### Requirement: Rate-limited routes document 429 in OpenAPI
Every route that applies a rate-limit policy SHALL include in its `describeRoute()` a `429` response whose JSON schema is `resolver(ErrorEnvelopeSchema)` and whose description names the limit, and SHALL mention the limit in the operation `description`. `zValidator` SHALL remain the request validator (ADR-012).

This covers `POST /api/v1/auth/{login,register,forgot-password,reset-password,verify-email,send-verification}`, `POST /api/v1/contact`, `POST /api/v1/comments/recipe/:recipeId` and `POST /api/v1/reports`.

#### Scenario: send-verification documents 429
- **WHEN** `/api/v1/openapi.json` is generated
- **THEN** `paths['/api/v1/auth/send-verification'].post.responses['429']` exists with `content['application/json'].schema` resolved from `ErrorEnvelopeSchema`

#### Scenario: OpenAPI coverage test stays green
- **WHEN** `make test-api` runs `apps/api/src/routes/openapi.coverage.test.ts`
- **THEN** it passes with no undocumented or untagged route

### Requirement: Web client explains rate-limit errors in the user's language
The web API client SHALL expose the `Retry-After` value of a 429 response on `ApiError` (`retryAfterSeconds`), and the auth forms (login, register, forgot-password, reset-password), the verification-resend action and the contact form SHALL show the localised message `error.rateLimited` (with a `{seconds}` placeholder) instead of the raw English server message when `ApiError.code === 'RATE_LIMITED'`.

The key `error.rateLimited` SHALL exist in both `packages/shared/src/i18n/en.json` and `packages/shared/src/i18n/tr.json`.

#### Scenario: Login form shows a localised wait message
- **WHEN** the login request returns 429 with `Retry-After: 120` and the UI language is Turkish
- **THEN** the form shows the Turkish `error.rateLimited` text with `120` interpolated

#### Scenario: i18n parity holds
- **WHEN** the en/tr key-parity test runs
- **THEN** `error.rateLimited` is present in both files and the test passes

### Requirement: Rate limiting has regression test coverage
The API package SHALL contain Vitest tests that cover client-IP resolution (`apps/api/src/utils/client-ip/index.test.ts`), the limiter backends and middleware (`apps/api/src/middleware/rateLimit.test.ts`, `apps/api/src/utils/rate-limit/*.test.ts`), and each rate-limited route. These SHALL include spoofed-header regression cases, a fake-store outage case and an opt-in Valkey integration test.

The client-IP tests SHALL include a `fast-check` property: in `hops` mode the result is independent of any client-controlled XFF prefix. The outage test SHALL use a store double whose calls reject or hang, and assert a non-5xx response within the command timeout. The Valkey integration test SHALL run only when `REDIS_TEST_URL` is set, and SHALL verify atomicity and fail-soft against a real `valkey/valkey:9.1-alpine`. Route tests SHALL simulate distinct clients through connection info (a test helper that passes `{ incoming: { socket: { remoteAddress } } }` as the `app.request()` env), not through spoofable headers, and SHALL reset limiter state per test with `resetRateLimitBackend()`.

#### Scenario: Spoofed-XFF regression test
- **WHEN** a test sends 4 `POST /api/v1/contact` requests from one socket address, each with a different random `X-Forwarded-For`, under `TRUST_PROXY=none`
- **THEN** the requests share one `contact-ip` bucket and the 4th returns 429

#### Scenario: Integration test is opt-in
- **WHEN** `make test-api` runs without `REDIS_TEST_URL`
- **THEN** the Valkey integration suite is skipped and the run passes

#### Scenario: Auth route tests no longer depend on spoofable headers
- **WHEN** `apps/api/src/modules/auth/index.test.ts` runs
- **THEN** no request in it sets `x-forwarded-for` to obtain a fresh bucket, and all tests pass

