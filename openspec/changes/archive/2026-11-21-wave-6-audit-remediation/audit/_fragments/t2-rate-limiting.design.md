### Rate limiting & cache driver hardening (t2-rate-limiting)

**Context**

Current state, validated against HEAD `ada9f6e` on 2026-11-18. The full evidence table, the
library comparison and the sources are in `audit/t2-rate-limiting.md`.

- **Identity.** `apps/api/src/middleware/rateLimit.ts:37-38` and `:89-90` key on the raw
  `x-forwarded-for || x-real-ip || 'unknown'` string. `getConnInfo` is never used. Whether this can
  be exploited depends on the topology:
  - Direct exposure, or proxies that append to XFF (Cloudflare): bypass by rotating XFF.
  - Traefik or Caddy with default trust: not spoofable, but behind Cloudflare every client shares
    the edge IP's bucket.
  - No proxy: one global `'unknown'` bucket.
- **State.** Counters go through the cache singleton (`rateLimit.ts:41-51`) as a non-atomic
  `get`, then mutate, then `set`.
  - `CACHE_ENABLED=false` installs `NullCacheProvider` (`main.ts:132-136`,
    `utils/cache/index.ts:75-95`), which switches limiting off.
  - The redis driver is `new Redis(url)` with ioredis 6 defaults (`utils/cache/redis.ts:88-89`):
    an offline queue plus 20 retries per request. The limiter has no try/catch and runs on `'*'`
    (`main.ts:75`), so a Valkey outage stalls every request and then 500s it, `/health` included.
  - `InMemoryCacheProvider` (`utils/cache/index.ts:28-51`) evicts only when the same key is read
    again, so memory grows without bound.
- **Policy.**
  - One `authRateLimit` instance (`modules/auth/index.ts:27`) with a hard-coded key
    `auth-ratelimit:${ip}` (`rateLimit.ts:90`) is shared by login, register and forgot-password,
    and it counts successful requests. Five ordinary auth actions in 15 minutes lock a legitimate
    user out.
  - `send-verification` has no limit (`auth/index.ts:273-297`).
  - Comment and report limits key only by IP (`comment/index.ts:45`, `report/index.ts:29`).
  - `/health`, `/ready` and local `/uploads/*` are counted against the global 100/min.
- **Contract.** Only `X-RateLimit-*` is sent: no `Retry-After`, and no CORS `exposeHeaders`
  (`middleware/cors.ts:16-22`). The 429 message says "login" on register and forgot-password
  (`rateLimit.ts:117`).
- **Hygiene.** The registration-disabled warn log records the client IP (`auth/index.ts:94-96`),
  which violates the AGENTS.md no-PII rule. The auth DB tests bypass the limiter with spoofed
  `x-forwarded-for: test-<uuid>` (`auth/index.test.ts:153-181`).
- **Docs and specs.** These claims are wrong or stale:
  - `docs/deployment_coolify.md:282-285`, `docs/architecture.md:96-101` and `:179`,
    `docs/request-lifecycle.md:17` and `:58`, and `docs/decisions.md:113-121` (ADR-006).
  - `openspec/specs/report-rate-limit/spec.md:11` codifies raw-XFF keying.
  - `openspec/specs/remote-cache` is entirely Deno KV.
- **Validation outcome.** Every audit claim was confirmed, with two corrections:
  - "Silently disabled" is overstated, because `.env.example:33` documents it.
  - Spoofability depends on the topology.

  Six further defects were found (N1-N6 in the notes). Severity stays **high**.

**Decisions**

1. **Use `rate-limiter-flexible` 11.5.x as the counting engine, behind an in-house Hono adapter.**
   - Choice: `RateLimiterRedis` (atomic Lua INCR+TTL on a dedicated ioredis client) with
     `insuranceLimiter: new RateLimiterMemory(sameOpts)` and `rejectIfRedisNotReady: true`.
     `RateLimiterMemory` alone serves the memory store.
   - Our adapter owns key derivation, policy lookup, headers, the 429 envelope, logging and
     fail-open. It lives in:
     - `apps/api/src/middleware/rateLimit.ts`: `rateLimit(policy, opts?)` and
       `rateLimitFailures(policy, { key, isFailure, resetOnSuccess })`.
     - `apps/api/src/utils/rate-limit/backend.ts`: the `RateLimitBackend` interface plus
       `createMemoryBackend` and `createRedisBackend`.
     - `utils/rate-limit/registry.ts`: `getRateLimitBackend`, `setRateLimitBackend` and
       `resetRateLimitBackend`.
     - `utils/rate-limit/policies.ts` and `utils/rate-limit/headers.ts`.
   - Alternatives:
     - `hono-rate-limiter` 0.5.4: Hono-native, but a store error rejects into a 500 with no
       fail-soft, it only knows header drafts 6 and 7, and it is pre-1.0.
     - Fixing the custom limiter: a `MULTI INCR/PEXPIRE NX/PTTL` store plus a bounded LRU,
       Lua-free, but it reimplements insurance, block and failure semantics.
   - Rationale: it is the only option where a Valkey outage degrades to per-process limiting.
     Atomicity is battle-tested, the library is mature and actively released (ISC licence, zero
     runtime deps), and it supports the OWASP login pattern natively (`get` / `penalty` /
     `delete`). The `RateLimitBackend` seam keeps the Lua-free MULTI store as a drop-in fallback
     if a managed Valkey forbids `EVAL`.

2. **Derive the client IP in one helper, with `TRUST_PROXY=none|hops|cloudflare` and hop counting.**
   - Choice: `apps/api/src/utils/client-ip/index.ts` exports `getClientIp(c, trust?)` and
     `rateLimitIpKey(ip)`.
     - `none`: `getConnInfo(c).remote.address` from `@hono/node-server/conninfo`.
     - `hops`: the chain `[...validXffEntries, socketPeer]`, indexed at
       `len - 1 - TRUST_PROXY_HOPS`, clamped to 0.
     - `cloudflare`: the `hops` candidate. If it falls in the bundled Cloudflare ranges (or
       `TRUST_PROXY_CIDRS`), use `CF-Connecting-IP` instead.
   - CIDR matching uses Node's built-in `net.BlockList`, and IP validation uses `net.isIP`.
   - Normalisation: strip the IPv6 zone, convert IPv4-mapped addresses to IPv4, and lower-case.
     `rateLimitIpKey` reduces IPv6 to the /64 prefix with a small expander (fast-check covered).
   - The Cloudflare ranges live in `utils/client-ip/cloudflare-ranges.ts`, with the source URL
     and fetch date in a comment.
   - Alternatives:
     - A CIDR-walk-only `TRUSTED_PROXIES` list: more robust when hop counts vary, but it needs
       the operator to know Docker or Traefik subnets, which Coolify hides.
     - Express-style `trust proxy` strings: a richer surface, but more to misconfigure.
     - Trusting `CF-Connecting-IP` blindly: anyone hitting the origin directly can forge it.
   - Rationale: a hop count is one number the operator can reason about ("how many proxies sit
     in front of the API"). The right-most-minus-N rule ignores every client-controlled prefix
     by construction, as MDN prescribes. Verifying the Cloudflare edge closes the
     direct-to-origin forgery without requiring Traefik changes in Coolify.

3. **Default to `TRUST_PROXY=none`, and set it explicitly in the deployment templates.**
   - Choice: the secure default is `none`.
     - `compose.production.yml` sets `TRUST_PROXY: ${TRUST_PROXY:-hops}` and
       `TRUST_PROXY_HOPS: ${TRUST_PROXY_HOPS:-1}`.
     - `apps/api/.env.example` (the Coolify paste template) sets `hops` / `1`, with a commented
       `cloudflare` line for orange-cloud.
     - The first XFF-bearing request under `none` logs one warn line.
   - Alternative: default `hops=1`. It is convenient behind one proxy, but spoofable whenever
     the API is exposed directly.
   - Rationale: a wrong default should fail toward shared buckets, which are visible, logged and
     only degrade UX. It should not fail toward a silent bypass.

4. **Keep rate-limit state in its own backend, selected explicitly.**
   - Choice: `RATE_LIMIT_STORE=memory|redis` (default `memory`), reusing `REDIS_URL`.
     `RATE_LIMIT_ENABLED` is the only off switch. Keys sit under the root `brewform-rl:`, outside
     the cache's `brewform:` namespace. Startup (`main.ts`) installs the backend before `serve()`.
   - Route modules create their middleware at import time. The middleware therefore resolves the
     backend lazily from the registry on each request, and memoises one limiter per policy per
     backend.
   - Alternatives: derive the store from `CACHE_DRIVER` (implicit coupling, the bug being fixed),
     or keep using `CacheProvider` (no atomic increment in its interface).
   - Rationale: the audit's core complaint is the coupling. An explicit setting is
     self-documenting, and the separate root makes cache flushes safe for the limiter.

5. **Fail-soft, then fail-open. No custom circuit breaker.**
   - Choice:
     - The limiter's ioredis client uses `enableOfflineQueue: false`, `maxRetriesPerRequest: 1`,
       `commandTimeout: 500` and `connectTimeout: 2000`, with the default background
       `retryStrategy`.
     - The library's insurance limiter takes over on any store error. With
       `rejectIfRedisNotReady`, it is used immediately while the client is not `ready`.
     - If the adapter catches an `Error` (not a `RateLimiterRes`), it logs `error` and calls
       `next()`.
     - Transitions are tracked through the client's `error` / `ready` events and a
       `degraded` flag: one warn on entering degraded mode, one info on recovery with
       `fallbackDecisions`.
   - Alternatives: fail-closed (deny everything, which is an outage), pure fail-open (no
     protection during an outage), or a hand-rolled breaker. With the offline queue off and
     ready-checks on, a breaker only saves the 500 ms timeout on a half-dead server.
   - Rationale: an outage of an optional dependency must never become an API outage, and
     protection should continue at reduced accuracy. That is exactly what the insurance limiter
     provides.

6. **Use named policies, with failure-only login counters per OWASP.**
   - Choice: the policy table in the `api-rate-limiting` spec.
     - The IP volumetric limits run before the body parser and auth.
     - The email-keyed policies run after `zValidator` and use `c.req.valid('json').email`,
       trimmed and lower-cased.
     - The user-keyed policies run after `authMiddleware`.
   - Login uses four policies:
     - per IP for all attempts (20/15 min);
     - per IP for failures (100/day);
     - per (email, IP) for consecutive failures (5/15 min, deleted on 2xx);
     - per email across IPs (20/h).
   - Failure-only counting: `get` before the handler, and 429 if `consumedPoints >= points`.
     After the handler, a 401 response triggers `penalty(key, 1)`, and a 2xx login triggers
     `delete(key)`. Unknown emails are counted the same way.
   - `confirmPasswordReset` returns the account's normalised email, and the reset route deletes
     both account counters (coordinate with the auth-session track, which reworks reset tokens).
   - Alternatives: keep the shared 5/15 min (locks out legitimate users), a hard account lockout
     (DoS), or CAPTCHA (OWASP: not a substitute, and adds a third-party dependency).
   - Rationale: OWASP ties the failure counter to the account and recommends a recovery path
     for locked owners. The (email, IP) counter stops single-source brute force without letting
     an attacker lock the owner out from everywhere, and the per-email cap bounds distributed
     attacks.

7. **Response contract.**
   - Choice:
     - IETF draft-11 `RateLimit-Policy` / `RateLimit` list items, appended per evaluated
       counting policy.
     - The legacy `X-RateLimit-*` headers for the last policy (their semantics are unchanged,
       because existing specs and tests assert them).
     - `Retry-After` on every 429.
     - Per-policy messages.
     - The envelope `{ success:false, error:{ code:'RATE_LIMITED', message, requestId } }`.
     - CORS `exposeHeaders` gains the six header names.
   - Alternatives: the draft-7 combined `RateLimit: limit=…, remaining=…` (superseded), or
     legacy headers only (no standard).
   - Rationale: follow the current WG draft and keep backward compatibility. `Retry-After` is
     the interoperable signal that clients honour.

8. **Keys and privacy.**
   - Choice:
     - The key format is `<policy-id>:<dimension>`, with
       `brewform-rl:<policy-id>:<dimension>` on Redis (via the library's `keyPrefix`).
     - Emails become the first 32 hex characters of their SHA-256 (`node:crypto`).
     - IPs are normalised, with IPv6 reduced to /64.
     - Logs carry only `policy`, `limit`, `userId` and `err`.
     - Drop `ip` from the registration-disabled log.
   - Alternative: HMAC with a secret. That would only matter if the keys were exposed, which
     they are not, and it adds key rotation.
   - Rationale: the key length is bounded, raw PII never sits in Valkey, and the AGENTS.md
     logging rules are met.

9. **Bound the memory cache with a built-in Map LRU and a sweep.**
   - Choice:
     - `InMemoryCacheProvider` takes `{ maxEntries = config.CACHE_MEMORY_MAX_ENTRIES ?? 10_000,
       sweepIntervalMs = 60_000 }`.
     - `get` deletes and re-sets the entry to refresh recency.
     - `set` of a new key at the cap evicts `store.keys().next().value`.
     - The sweep uses `setInterval(...).unref()` and logs at debug level when entries are
       removed.
     - `close()` clears the timer and the store.
     - Tests construct it with small caps and Vitest fake timers.
   - Alternative: the `lru-cache` package (ISC, mature, with `maxSize` and `ttlAutopurge`).
   - Rationale: about 40 lines of standard Map semantics with no new dependency, in line with
     the user's preference for built-in methods. The entry cap is sufficient once the limiter no
     longer writes request-derived keys.

10. **Wrap the cache fail-soft, and reconcile on recovery.**
    - Choice: a `FailSoftCacheProvider` decorator (`utils/cache/failSoft.ts`) wraps the redis
      provider in `createCacheProvider('redis')`.
      - A failed `get` becomes `null`, and a failed `set`, `delete` or `deleteByPrefix` becomes a
        no-op.
      - It logs one warn when entering degraded mode and one info on recovery with `droppedOps`.
      - If any invalidation was dropped, it runs one asynchronous `inner.deleteByPrefix([])`
        after the first success, logged with `reason: 'dropped-invalidations'`.
    - The cache's ioredis client uses the same fast-fail options as the limiter's, built by
      `utils/redis/client.ts` `createRedisClient(url)`.
    - Alternatives: let errors propagate (today's 500s), or serve stale data until TTL after an
      outage (up to 24 h for some keys).
    - Rationale: the cache is optional by definition. The reconciliation flush is the cheapest
      correct answer to lost invalidations. It cannot touch limiter keys (`brewform-rl:` does
      not match `brewform:*`).

11. **Report store health on `/ready` without changing its status semantics.**
    - Choice: `cache` and `rateLimitStore` fields (`ok` | `degraded` | `memory` | `disabled`)
      come from small `getCacheStatus()` / `getRateLimitStoreStatus()` getters. The status code
      still depends only on the DB.
    - Alternative: a metrics endpoint. There is no metrics stack today.
    - Rationale: operators get a probe-visible signal for the degraded mode that the logs
      report, at near-zero cost.

12. **Simulate client IPs in tests through connection info.**
    - Choice: `apps/api/src/utils/client-ip/test-helpers.ts` exports `peerEnv(ip)`, which
      returns `{ incoming: { socket: { remoteAddress: ip } } }`, passed as the third argument of
      `app.request()`.
      - Verify the exact shape against `@hono/node-server/conninfo` 2.1.6 during
        implementation.
      - `resetRateLimitBackend()` runs in `beforeEach`.
    - The Valkey integration suite (`utils/rate-limit/redis.integration.test.ts`) uses
      `describe.skipIf(!process.env.REDIS_TEST_URL)`.
    - Rationale: tests stop depending on the very header we stop trusting.

13. **Web 429 UX.**
    - `ApiError` gains `retryAfterSeconds?: number`, parsed from `Retry-After` in
      `apps/web/src/api/client.ts`.
    - The auth forms, the verification resend and the contact form map `RATE_LIMITED` to
      `t('error.rateLimited', { seconds })`. The key goes in `en.json` and `tr.json`, using the
      single-brace `{seconds}` interpolation the repo already uses.
    - Rationale: the server message is English-only, and Turkish users currently see raw
      English.

**Risks / Trade-offs**

- [A wrong `TRUST_PROXY` for the topology gives shared buckets (`none` behind a proxy) or a
  spoofable key (`hops` with direct exposure)] → Secure default, a warn-once hint when XFF
  arrives under `none`, the effective mode in the startup log, explicit values in both
  deployment templates, and a topology table in `docs/deployment_coolify.md` (docs track).
- [The bundled Cloudflare ranges go stale, so a new edge's `CF-Connecting-IP` is ignored and the
  client falls back to the edge IP's shared bucket] → This fails safe (no spoof).
  `TRUST_PROXY_CIDRS` adds ranges without a release, the source URL and date sit in the file
  header, and a maintenance note goes in the docs.
- [ioredis 6 defaults to RESP3 and its reply shapes could differ for `rate-limiter-flexible`] →
  The opt-in Valkey 9.1 integration test (`REDIS_TEST_URL`) verifies the Lua reply parsing. If it
  fails, set `protocol: 2` on the limiter client only.
- [A managed Valkey ACL forbids `EVAL`/`EVALSHA`, so every check falls to insurance] → The
  degraded warn makes it visible, and the `RateLimitBackend` seam allows the Lua-free
  `MULTI INCR / PEXPIRE NX / PTTL` backend (documented fallback).
- [During an outage the insurance limiter is per process, so the effective limit is N × replicas]
  → Accepted for the duration of an outage, and documented.
- [`auth-login-fail-account` (20/h) lets an attacker lock a known email out of password login for
  up to an hour] → Each IP is capped (5 per email+IP and 20 per IP per 15 min), so this needs at
  least 4 IPs. A password reset clears the counter (OWASP recovery path). The lock is never
  permanent, and the window is short.
- [NAT/CGNAT users share IP buckets, and `auth-register-ip` 5/h may block a classroom] →
  Moderate defaults, centralised policy constants, and `RATE_LIMIT_GLOBAL_MAX` env-tunable. The
  other values can be tuned in one file.
- [Failure-only counting is check-then-act, so parallel wrong-password requests can exceed 5 by
  the concurrency degree] → Bounded by `auth-login-ip` (20/15 min). Accepted.
- [Valkey `maxmemory-policy allkeys-*` would evict limiter keys early] → compose leaves the
  default `noeviction`, and the docs warn against changing it.
- [The reconciliation flush cold-starts the cache after an outage, producing a DB burst] → It runs
  only when invalidations were dropped. The pool is capped at 10, and the burst is short.
- [LRU pressure evicts hot entries, increasing DB load] → `CACHE_MEMORY_MAX_ENTRIES` is
  env-tunable, and the debug sweep log shows the size.
- [Auth and route tests currently rely on spoofed XFF] → They are migrated to `peerEnv()` plus
  `resetRateLimitBackend()` in the same PR (tasks).
- [The `api-middleware-logging` spec's exact-object example `{ limit: 100 }` gains a `policy`
  field] → The message string and logger name are unchanged. The owning track is flagged to adjust
  the scenario.
- [The new dependency is a supply-chain surface] → Exact version pin, zero transitive deps, and
  Renovate-tracked.

**Migration / Rollout**

- **No DB schema change, no migration.** `make db-generate` must still print "No schema changes".
- **Dependency.** Add `rate-limiter-flexible@11.5.0` (exact pin) to `apps/api/package.json`, then
  run `make install` and commit `pnpm-lock.yaml`.
- **New env vars** (validated in `env.ts`, documented in `apps/api/.env.example` and the root
  `.env.example`):
  - `TRUST_PROXY` (`none`), `TRUST_PROXY_HOPS` (`1`), `TRUST_PROXY_CIDRS` (unset)
  - `RATE_LIMIT_ENABLED` (`true`), `RATE_LIMIT_STORE` (`memory`), `RATE_LIMIT_GLOBAL_MAX` (`100`)
  - `CACHE_MEMORY_MAX_ENTRIES` (`10000`)
- **Compose.**
  - `compose.production.yml` api env adds `RATE_LIMIT_STORE: ${RATE_LIMIT_STORE:-redis}`,
    `TRUST_PROXY: ${TRUST_PROXY:-hops}` and `TRUST_PROXY_HOPS: ${TRUST_PROXY_HOPS:-1}`.
  - `compose.yml` dev keeps `TRUST_PROXY=none`. Vite proxies without `xfwd`, so dev clients share
    the Vite container's bucket, as before.
  - If the infra track routes `/api` through the web Caddy, the hop count is +1 and Caddy needs
    `trusted_proxies` for outer proxies (cross-track note).
- **Behaviour changes operators will notice:**
  - Auth limits are now per action and failure-based. Legitimate users stop being locked out.
  - send-verification is limited.
  - Comment and report limits also apply per user.
  - Probes and local uploads leave the global bucket.
  - New response headers.
- **Cloudflare deployments** must set `TRUST_PROXY=cloudflare`. Until they do, behaviour equals
  today's (edge-IP buckets), now made explicit by the docs and the warn line.
- **Stale keys.** Keys written by the old limiter (`brewform:ratelimit:*`, TTL ≤ 15 min) expire by
  themselves. New keys live under `brewform-rl:` with TTLs of at most 24 h, so no cleanup is
  needed.
- **Rollback.** Revert the PR. As an emergency switch without a rollback,
  `RATE_LIMIT_ENABLED=false` plus a restart (logs a warn). `TRUST_PROXY` changes need only an env
  edit and a restart.
- **Docs** (docs track, using these decisions):
  - `docs/deployment_coolify.md` §9: replace the Cloudflare paragraph with `TRUST_PROXY` modes,
    origin lockdown and Traefik `trustedIPs` notes.
  - `docs/architecture.md:92-101` and `:179`.
  - `docs/request-lifecycle.md:17` and `:58`.
  - `docs/api.md:530` and `:557`, plus a general rate-limit section with the policy table and
    headers.
  - `docs/auth.md:52`.
  - A new ADR superseding ADR-006's limiter and "no scripting" notes.
  - AGENTS.md: the Coolify nuance line gains `TRUST_PROXY`, and the middleware order is
    unchanged.
  - `openspec/specs/remote-cache` is REMOVED → `cache-driver`.
