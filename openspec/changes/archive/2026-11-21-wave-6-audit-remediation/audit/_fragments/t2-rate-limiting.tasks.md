### Rate limiting — dependency and environment configuration

- [ ] Add `rate-limiter-flexible` pinned to exactly `11.5.0` in `apps/api/package.json` `dependencies`. Run `make install`, commit the updated `pnpm-lock.yaml`, and confirm `make check-api` still passes
- [ ] Add failing cases to `apps/api/src/config/env.test.ts`:
  - defaults: `TRUST_PROXY='none'`, `TRUST_PROXY_HOPS=1`, `RATE_LIMIT_ENABLED=true`, `RATE_LIMIT_STORE='memory'`, `RATE_LIMIT_GLOBAL_MAX=100`, `CACHE_MEMORY_MAX_ENTRIES=10000`
  - rejects `TRUST_PROXY=xff`, `TRUST_PROXY_HOPS=0` and `=6`, `TRUST_PROXY_CIDRS=10.0.0.0/33` and `=not-a-cidr`, `CACHE_MEMORY_MAX_ENTRIES=10`
  - accepts `TRUST_PROXY_CIDRS=10.0.0.0/8, 2001:db8::/32`
  - `RATE_LIMIT_STORE=redis` with `CACHE_ENABLED=false` and no `REDIS_URL` fails on `REDIS_URL`
- [ ] Extend `envSchema` in `apps/api/src/config/env.ts` with the seven variables:
  - Validate CIDRs with `node:net` `isIP` plus a prefix-length check (≤32 for v4, ≤128 for v6), and expose `TRUST_PROXY_CIDRS` as a parsed `string[]`
  - Add the `RATE_LIMIT_STORE=redis` → `REDIS_URL` rule to the existing `superRefine`, independent of `CACHE_ENABLED`
  - Make the env tests pass, and keep the `api-env-config` empty-string-as-unset rule working for the new optional vars

### Rate limiting — client IP resolution

- [ ] Write `apps/api/src/utils/client-ip/index.test.ts` first, covering every `api-rate-limiting` "Client IP is resolved…" scenario:
  - `none` ignores XFF and CF headers
  - `hops=1` and `hops=2` chain selection, including invalid XFF entries being dropped and a short chain clamping to the socket
  - `cloudflare` accepted only when the hop is in the Cloudflare ranges or `TRUST_PROXY_CIDRS`
  - IPv4-mapped normalisation, IPv6 zone stripping, and `rateLimitIpKey` /64 bucketing
  - no socket → `null`
  - a `fast-check` property: in `hops` mode, prepending arbitrary strings to XFF never changes the result
- [ ] Add `apps/api/src/utils/client-ip/cloudflare-ranges.ts` exporting `CLOUDFLARE_IPV4` and `CLOUDFLARE_IPV6` arrays copied from `https://www.cloudflare.com/ips-v4` and `/ips-v6`, with the source URL and fetch date in a header comment, plus a unit assertion that both lists are non-empty valid CIDRs
- [ ] Implement `apps/api/src/utils/client-ip/index.ts`, with a module logger `createLogger('client-ip')`, until the tests pass. It exports:
  - `getClientIp(c, trust = trustConfigFromEnv())`, reading the peer via `getConnInfo` from `@hono/node-server/conninfo` inside try/catch and returning `null` when absent
  - `normalizeIp(raw)`
  - `rateLimitIpKey(ip | null)`, which returns `'unknown'` for `null` and the `<prefix>::/64` form for IPv6
  - a lazily built `net.BlockList` for the Cloudflare ranges plus `TRUST_PROXY_CIDRS`
  - a process-level warn-once when XFF is present under `none`, with context `{}` and no header value
- [ ] Add `apps/api/src/utils/client-ip/test-helpers.ts` exporting `peerEnv(ip)`, which returns the `app.request()` env shape that `getConnInfo` reads (verify against the installed `@hono/node-server` 2.1.6 `conninfo` source). Add one test proving `getClientIp` returns that IP

### Rate limiting — shared Redis client

- [ ] Write `apps/api/src/utils/redis/client.test.ts` asserting that `createRedisClient(url, { lazyConnect: true })` produces an ioredis instance whose `options` include `enableOfflineQueue: false`, `maxRetriesPerRequest: 1`, `commandTimeout: 500` and `connectTimeout: 2000`
- [ ] Implement `apps/api/src/utils/redis/client.ts` `createRedisClient(url, overrides?)` with those options and the default `retryStrategy`. Never log the URL. Log `error` events at most once per disconnect cycle with `{ err }`. Switch `createRedisProvider` in `apps/api/src/utils/cache/redis.ts` to use it, and update its docblock

### Rate limiting — policies, backend and headers

- [ ] Create `apps/api/src/utils/rate-limit/policies.ts` with the `RateLimitPolicy` type (`id`, `dimension: 'ip' | 'email' | 'email-ip' | 'user'`, `points`, `durationSec`, `mode: 'count' | 'failures'`, `message`) and the frozen `POLICIES` map holding exactly the table from the `api-rate-limiting` spec (`global` reads `config.RATE_LIMIT_GLOBAL_MAX`). Add `policies.test.ts` asserting unique ids, positive integers, every value in the spec table, and that no login message is used by a non-login policy
- [ ] Write `apps/api/src/utils/rate-limit/backend.test.ts` first:
  - the memory backend admits exactly `points` per key per window, and keys are isolated per policy
  - `createRedisBackend` with a fake client whose commands reject and whose `status` is `'end'` still enforces limits through the insurance limiter, emits exactly one degraded warn `{ store: 'redis', err }` across 50 checks, and one recovery info after a simulated `ready` event
  - `status()` reports `memory` / `ok` / `degraded`
- [ ] Implement `apps/api/src/utils/rate-limit/backend.ts`:
  - the `RateLimitBackend` interface: `limiter(policy)` (memoised per policy id), `status()`, `close()`
  - `createMemoryBackend()` (`RateLimiterMemory`, `keyPrefix: policy.id`)
  - `createRedisBackend(client)` (`RateLimiterRedis` with `storeClient`, `keyPrefix: 'brewform-rl:' + policy.id`, `rejectIfRedisNotReady: true`, `insuranceLimiter: new RateLimiterMemory(same points/duration)`)
  - degraded and recovery transitions driven by the client's `error` / `ready` events, with a `fallbackDecisions` counter and a module logger `createLogger('rate-limit-backend')`
- [ ] Implement `apps/api/src/utils/rate-limit/registry.ts`: `getRateLimitBackend()`, `setRateLimitBackend(b)`, `resetRateLimitBackend()` (fresh memory backend) and `getRateLimitStoreStatus()` (`disabled` when `RATE_LIMIT_ENABLED=false`). Add `registry.test.ts`
- [ ] Write `apps/api/src/utils/rate-limit/headers.test.ts`, then implement `headers.ts`:
  - `appendRateLimitHeaders(c, policy, { remaining, msBeforeNext })` appends Structured-Field list items to `RateLimit-Policy` (`"<id>";q=<points>;w=<durationSec>`) and `RateLimit` (`"<id>";r=<remaining>;t=<ceil seconds>`), and overwrites `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (epoch seconds)
  - `setRetryAfter(c, msBeforeNext)` (minimum 1)
- [ ] Add `apps/api/src/utils/rate-limit/redis.integration.test.ts`, guarded by `describe.skipIf(!process.env.REDIS_TEST_URL)`:
  - 50 concurrent consumes against a limit of 10 admit exactly 10
  - two backends on separate clients share one budget
  - a backend pointed at a closed port answers every check within 1 s via insurance

  Document `REDIS_TEST_URL=redis://:dev-valkey-password@valkey:6379` in the test docblock. If the RESP3 reply parsing fails, set `protocol: 2` on the limiter client and record why in a comment

### Rate limiting — middleware and app wiring

- [ ] Rewrite `apps/api/src/middleware/rateLimit.test.ts` first, using `peerEnv()` and `resetRateLimitBackend()`:
  - the 429 envelope (`RATE_LIMITED`, `requestId`, the policy message) and `Retry-After`
  - `RateLimit` / `RateLimit-Policy` items for two stacked policies, with `X-RateLimit-Limit` from the last one
  - `RATE_LIMIT_ENABLED=false` is a pass-through with no headers
  - limiting still works with `setCacheProvider(new NullCacheProvider())`
  - the spoofed-XFF regression: one peer with random XFF values hits 429
  - `rateLimitFailures`: 429 before the handler once the counter reaches the limit, `penalty` only on 401, `delete` on 2xx when `resetOnSuccess`, and no headers unless 429
  - fail-open: a backend whose limiter throws `Error` lets the request through and logs `error` with `{ err, policy }`
  - the exceeded log is `log.warn({ policy, limit, userId? }, 'rateLimitMiddleware rate limit exceeded')`, and no log call ever contains an IP, email or key
- [ ] Re-implement `apps/api/src/middleware/rateLimit.ts`, keeping `export const log = createLogger('rate-limit-middleware')`:
  - `rateLimit(policy, opts?: { key?: (c) => string | null; skip?: (c) => boolean })` (default key: `rateLimitIpKey(getClientIp(c))`, user policies key on `c.get('userId')`)
  - `rateLimitFailures(policy, { key, isFailure = (s) => s === 401, resetOnSuccess })`
  - an `emailKey(email)` helper (trim, lower-case, SHA-256 hex first 32 chars, via `node:crypto`)
  - the backend resolved lazily from the registry on every request
  - delete `rateLimitMiddleware` and `authRateLimitMiddleware`, and the `RateLimitEntry` / cache imports
- [ ] Wire startup in `apps/api/src/main.ts`:
  - install `createRedisBackend(createRedisClient(config.REDIS_URL))` when `RATE_LIMIT_STORE=redis`, otherwise keep the memory backend, before `serve()`
  - log info `{ enabled, store, trustProxy, hops }` (no URL), and warn when `RATE_LIMIT_ENABLED=false`
  - replace `app.use('*', rateLimitMiddleware(...))` with `rateLimit(POLICIES.global, { skip })`, skipping `/health`, `/ready` and `GET /uploads/*`, and add `rateLimit(POLICIES.uploads)` to the `/uploads/*` handler
  - close the limiter backend in `shutdown()` and update the header comment's middleware line
- [ ] Add `exposeHeaders: ['Retry-After', 'RateLimit', 'RateLimit-Policy', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']` to `apps/api/src/middleware/cors.ts`, with a case in `cors.test.ts` asserting `Access-Control-Expose-Headers`
- [ ] Add a `main` wiring test (in `apps/api/src/middleware/rateLimit.test.ts` or a new `apps/api/src/main.rateLimit.test.ts` importing `app`):
  - 150 `GET /health` requests are never 429
  - 101 requests to an API route from one `peerEnv` give a 429 on the 101st
  - `CACHE_ENABLED=false` does not change this

### Rate limiting — route policies

- [ ] Add failing tests to `apps/api/src/modules/auth/index.test.ts` (DB-backed, `peerEnv()` per simulated client, `resetRateLimitBackend()` in `beforeEach`):
  - register, two logins and forgot-password from one IP are all non-429
  - 5 wrong passwords then the correct one gives 429 with `Retry-After` and no cookies
  - a different IP with the correct password succeeds
  - 4 failures, a success, then 4 more failures stay non-429
  - 20 failures from 20 IPs make the 21st attempt 429
  - an unknown email gives an identical 429 body and headers
  - send-verification twice in 60 s gives 200 then 429, with exactly one email sent (spy on the notify module)
  - forgot-password for one email from 4 IPs gives a 429 on the 4th
  - the registration-disabled warn log has no `ip` key
- [ ] Migrate the existing `postJson` helper and the other requests in `apps/api/src/modules/auth/index.test.ts` from `x-forwarded-for: test-<uuid>` to `peerEnv(<unique test IP>)`. Confirm `grep -n "x-forwarded-for" apps/api/src/modules/auth/index.test.ts` is empty
- [ ] Update `apps/api/src/modules/auth/index.ts`:
  - remove `authRateLimit`
  - `/register`: `rateLimit(POLICIES.authRegisterIp)`
  - `/login`: `rateLimit(POLICIES.authLoginIp)` and `rateLimitFailures(POLICIES.authLoginFailIp)` before `zValidator`, then `rateLimitFailures(POLICIES.authLoginFailAccountIp, { resetOnSuccess: true })` and `rateLimitFailures(POLICIES.authLoginFailAccount)` after it, keyed from `c.req.valid('json').email`
  - `/forgot-password`: `authForgotIp` before and `authForgotAccount` after `zValidator`
  - `/reset-password` and `/verify-email`: `authTokenIp`
  - `/send-verification`: `authVerifySendIp` before `authMiddleware`, `authVerifySendUserBurst` and `authVerifySendUserDaily` after it
  - drop `ip` from the `Registration attempt while disabled` warn
- [ ] Coordinate with the auth-session track: make `authService.confirmPasswordReset` (`apps/api/src/modules/auth/service.ts`) return the account's normalised email. In the `/reset-password` handler, delete the `auth-login-fail-account` and `auth-login-fail-account-ip` (requesting IP) counters through the registry on success. Add a test: lock an account, reset the password, then log in successfully
- [ ] Add OpenAPI metadata to every rate-limited auth route in `apps/api/src/modules/auth/index.ts`: a `429` response with `content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } }` and a description naming the limit, plus the limits in the operation `description`. Keep `zValidator`. Add an assertion to `apps/api/src/routes/openapi.test.ts` that `/api/v1/auth/send-verification` POST documents `429`
- [ ] Update `apps/api/src/modules/contact/index.ts` to use `rateLimit(POLICIES.contactIp)`, keeping the existing 429 OpenAPI entry. Update `apps/api/src/modules/contact/contact.test.ts` to use `peerEnv()` and `resetRateLimitBackend()`, and add the spoofed-XFF regression case (4 POSTs from one peer with random XFF; the 4th is 429)
- [ ] Update `apps/api/src/modules/comment/index.ts`: `rateLimit(POLICIES.commentIp)` first, plus `rateLimit(POLICIES.commentUser)` right after `authMiddleware`. Update the 429 description, and replace `setCacheProvider` resets in `apps/api/src/modules/comment/index.test.ts` with `resetRateLimitBackend()` and `peerEnv()`
- [ ] Update `apps/api/src/modules/report/index.ts` and `apps/api/src/modules/report/index.test.ts` exactly as the modified `report-rate-limit` spec describes: `reportIp` first, `reportUser` after `authMiddleware`, `peerEnv()`, `resetRateLimitBackend()`, the spoofed-XFF, second-IP, per-user (DB-backed) and admin-not-throttled cases, and the `Retry-After` assertion
- [ ] Run `rg -n "x-forwarded-for|x-real-ip|cf-connecting-ip" apps/api/src --glob '!**/client-ip/**' --glob '!**/*.test.ts'` and confirm it prints nothing. Run `rg -n "rateLimitMiddleware|authRateLimitMiddleware" apps/api/src` and confirm only the log message string remains

### Cache driver — bounded memory cache

- [ ] Add failing cases to `apps/api/src/utils/cache/cache.test.ts`, using `new InMemoryCacheProvider({ maxEntries: 3 })` and Vitest fake timers:
  - LRU eviction order with recency refreshed on `get`
  - overwriting a key does not evict
  - 1 000 one-second-TTL entries are gone after advancing 61 s without reads
  - 50 000 writes with the default cap leave ≤ 10 000 entries
  - `close()` clears the interval (`vi.getTimerCount()` returns to its baseline) and empties the store
- [ ] Implement the bounded `InMemoryCacheProvider` in `apps/api/src/utils/cache/index.ts`: constructor options `{ maxEntries, sweepIntervalMs }`, Map re-insertion for recency, oldest-key eviction, a `setInterval(...).unref()` sweep with a debug log `{ swept, size }` only when entries were removed, a `close()`, and a `size` getter used by tests. Pass `config.CACHE_MEMORY_MAX_ENTRIES` from `createCacheProvider('memory')`, and update the file docblock (remove the stale "Hono context injection" claim only if the cache-wiring owner has not already done so)
- [ ] Make sure the default singleton in `apps/api/src/utils/cache/singleton.ts` and every test-constructed provider do not leak sweep timers: `.unref()` plus `close()` in the test `afterEach` where providers are created

### Cache driver — fail-soft redis driver and reconciliation

- [ ] Write `apps/api/src/utils/cache/failSoft.test.ts` first, with a client double whose methods can be toggled to reject:
  - a rejected `get` → `null`; a rejected `set` / `delete` / `deleteByPrefix` resolves
  - exactly one warn `{ driver: 'redis', err }` across 200 failures, and one info `{ driver: 'redis', droppedOps }` on the next success
  - after a dropped `delete`, the first success triggers exactly one asynchronous `inner.deleteByPrefix([])`, logged with `reason: 'dropped-invalidations'`
  - read-only outages trigger no flush
- [ ] Implement `apps/api/src/utils/cache/failSoft.ts` (`FailSoftCacheProvider implements CacheProvider`, module logger `createLogger('cache')`) and wrap the provider in `createCacheProvider('redis')`. Expose `getCacheStatus()` (`ok` / `degraded` / `memory` / `disabled`) for `/ready`
- [ ] Add a case to `apps/api/src/utils/cache/cache.test.ts` proving that `deleteByPrefix([])` builds the SCAN pattern `brewform:*`, and that the fake keyspace entry `brewform-rl:global:1.2.3.4` survives it
- [ ] Extend `apps/api/src/routes/health.ts` `/ready` with `cache: getCacheStatus()` and `rateLimitStore: getRateLimitStoreStatus()`. Keep the status code DB-only, update its `describeRoute` description and response docs, and add cases to `apps/api/src/routes/health.test.ts` for `memory` / `degraded` values and for a 200 while the cache is degraded
- [ ] Review `apps/api/scripts/flush-cache.ts`: it must keep using `deleteByPrefix([])` on the cache provider only and must never construct a limiter backend. Update its docblock to state that rate-limit keys (`brewform-rl:*`) are intentionally untouched

### Web — localised 429 messages

- [ ] Add failing cases to `apps/web/src/api/client.test.ts`: a 429 with `Retry-After: 120` produces `ApiError` with `code === 'RATE_LIMITED'`, `status === 429` and `retryAfterSeconds === 120`. A missing or invalid header leaves `retryAfterSeconds` undefined
- [ ] Implement `retryAfterSeconds` on `ApiError` and parse `Retry-After` (delta-seconds) in `apps/web/src/api/client.ts`
- [ ] Add `error.rateLimited` ("Too many attempts. Please try again in {seconds} seconds." / "Çok fazla deneme yapıldı. Lütfen {seconds} saniye sonra tekrar deneyin.") to `packages/shared/src/i18n/en.json` and `packages/shared/src/i18n/tr.json`. Run the en/tr parity test
- [ ] Add `apps/web/src/utils/apiErrorMessage.ts` `getApiErrorMessage(err, t, fallbackKey)`, which returns `t('error.rateLimited', { seconds })` for `RATE_LIMITED` (default 60 when unknown), otherwise `err.message`, otherwise `t(fallbackKey)`. Add a co-located test, and use it in `pages/auth/LoginPage.tsx`, `RegisterPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, `VerifyEmailPage.tsx`, `pages/ContactPage.tsx` and `components/EmailVerificationBanner.tsx`. Add one 429 case each to `LoginPage.test.tsx` and `ContactPage.test.tsx`

### Rate limiting & cache — config templates and docs handoff

- [ ] Add the new variables, with comments, to `apps/api/.env.example`:
  - `TRUST_PROXY=hops`, `TRUST_PROXY_HOPS=1`, and a commented `TRUST_PROXY=cloudflare` line explaining origin lockdown
  - `RATE_LIMIT_ENABLED=true`, `RATE_LIMIT_STORE=memory`, `RATE_LIMIT_GLOBAL_MAX=100`, `CACHE_MEMORY_MAX_ENTRIES=10000`
  - replace "CACHE_ENABLED=false disables all caching (incl. rate-limit state)" with "does not affect rate limiting"

  Mirror the dev-relevant lines in the root `.env.example` (`TRUST_PROXY=none`)
- [ ] Add `RATE_LIMIT_STORE: ${RATE_LIMIT_STORE:-redis}`, `TRUST_PROXY: ${TRUST_PROXY:-hops}` and `TRUST_PROXY_HOPS: ${TRUST_PROXY_HOPS:-1}` to the `api` service in `compose.production.yml`, with a header note about counting proxy hops (coordinate with the infra track if `/api` gets routed through the web Caddy, which makes it `hops=2` and requires Caddy `trusted_proxies`). Add `TRUST_PROXY=none` and `RATE_LIMIT_STORE=memory` to the dev `app` service in `compose.yml`
- [ ] Hand off to the docs track, which corrects these docs using `audit/_fragments/t2-rate-limiting.design.md`:
  - `docs/deployment_coolify.md:282-285`: the false "per-client limiting still works" Cloudflare claim → the `TRUST_PROXY` topology table, `cloudflare` mode, origin lockdown, and Traefik `trustedIPs`
  - `docs/architecture.md:92-101`: `NullCacheProvider` no longer affects limiting; the LRU bound and fail-soft redis
  - `docs/architecture.md:179`: the policy table reference
  - `docs/request-lifecycle.md:17,58`: no longer CacheProvider-backed
  - `docs/api.md:530,557`: headers and `Retry-After`
  - `docs/auth.md:52`: no IP in logs
  - a new ADR superseding ADR-006's limiter and "no scripting" notes in `docs/decisions.md`
  - AGENTS.md: the Coolify nuance line mentions `TRUST_PROXY`
  - `openspec/specs/remote-cache` is REMOVED with migration → `cache-driver`
- [ ] Flag to the owner of `openspec/specs/api-middleware-logging` that the rate-limit exceeded-log context now includes `policy` (the message string and logger name are unchanged)

### Rate limiting & cache — verification

- [ ] Run `make check`, `make lint`, `make test-api` (the Valkey integration suite skipped) and `make test-web`, then `make fmt`. Confirm `make db-generate` reports "No schema changes, nothing to migrate"
- [ ] Run the Valkey integration suite once against the compose Valkey: `make up`, then `make test-specific filter=src/utils/rate-limit/redis.integration.test.ts` with `REDIS_TEST_URL` exported into the container. Record the result in the PR description
- [ ] Do a manual smoke test with `RATE_LIMIT_STORE=redis` and `CACHE_DRIVER=redis` under `make dev`:
  - `docker compose stop valkey`, then check that `GET /health` and `GET /ready` (with `cache: 'degraded'`, `rateLimitStore: 'degraded'`) and a cached GET still answer 2xx within about 1 s
  - check that one degraded warn per component appears in the logs
  - `docker compose start valkey` and check for one recovery info each
