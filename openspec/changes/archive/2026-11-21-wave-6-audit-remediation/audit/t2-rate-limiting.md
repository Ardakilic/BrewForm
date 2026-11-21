# t2-rate-limiting: research and validation notes

Track: **Rate limiting & cache driver hardening**
Owned capabilities: `api-rate-limiting` (new), `cache-driver` (new; replaces the Deno-era
`remote-cache` spec, which the docs track marks REMOVED), `report-rate-limit` (modified).

User decision (verbatim): "How can we address this properly? research. You can use context7 mcp
and web search."

Audit sources: `plans/AUDIT-2026-11-18.md` §1 row 3, §3.3, §3.6 (send-verification), and the raw
findings `security/ratelimit-xff-spoofable`, `security/memory-cache-unbounded-dos`,
`security/send-verification-mailbomb`, `api-architecture/rate-limit-coupled-to-cache`,
`devex-infra-ci/ratelimit-ip-from-headers-only`,
`plans-specs-drift/ratelimit-xff-spoofable-doc-claims-safe`.

---

## 1. Validation of the audit claims (read against HEAD `ada9f6e`)

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| V1 | The limiter keys on the raw `X-Forwarded-For` string | **Confirmed** | `apps/api/src/middleware/rateLimit.ts:37-38` and `:89-90`: `ip = x-forwarded-for \|\| x-real-ip \|\| 'unknown'`, then `key = \`${keyPrefix}:${ip}\`` (the whole header, commas included). `grep getConnInfo apps/api/src` finds nothing. |
| V2 | So the limiter can be bypassed | **Confirmed, but it depends on the topology** (verifier correction holds) | It is spoofable when the API is exposed directly (`make preview`, compose `app-prod` on :8000) or sits behind a proxy that *appends* to XFF (Cloudflare, nginx-style). Traefik (Coolify) and Caddy 2.5+ drop an untrusted incoming XFF by default and write the peer IP, so the header cannot be spoofed there. Behind Cloudflare → default Traefik, though, the header is the **Cloudflare edge IP**, so unrelated clients share buckets and lock each other out. With no proxy, everyone shares `'unknown'`. Every topology ends in either a bypass or a shared bucket. |
| V3 | `CACHE_ENABLED=false` turns rate limiting off | **Confirmed** ("silently" is overstated) | `main.ts:132-136` installs `NullCacheProvider`, and `utils/cache/index.ts:75-95` makes `get` always `null`, so the count never passes 1. `apps/api/.env.example:33` and `.env.example:12` do say "incl. rate-limit state". `docs/architecture.md:98` leaves it out. |
| V4 | A Valkey outage becomes an API outage | **Confirmed from the code** (not reproduced at runtime) | `utils/cache/redis.ts:88-89` is `new Redis(url)` with ioredis defaults. Per the ioredis v6.0.0 docs (Context7 `/redis/ioredis/v6.0.0`), `enableOfflineQueue` defaults to `true` and `maxRetriesPerRequest` to `20`, so commands queue across reconnect attempts and then reject with `MaxRetriesPerRequestError`. `rateLimit.ts:41-51` has no try/catch. The limiter runs on `'*'` (`main.ts:75`) ahead of `/health` and `/ready` (`routes/index.ts:44`), so every request stalls and then returns 500. Every service that awaits `cacheProvider.get` also throws. `compose.production.yml:86` defaults `CACHE_DRIVER` to `redis`. |
| V5 | The in-memory Map never evicts, so memory can run out | **Confirmed** (severity depends on the deployment, as the verifier said) | `utils/cache/index.ts:28-51` has no size cap and no sweep. An entry is removed only when the same key is read again (`:36-38`). Unique limiter keys are never re-read. The Coolify template defaults to `CACHE_DRIVER=memory` (`apps/api/.env.example:39`). |
| V6 | The counter is a non-atomic read-modify-write | **Confirmed** | `rateLimit.ts:41-51` and `:93-103` do `get`, mutate, then `set`. With Redis, concurrent requests lose increments. With memory there is an `await` between `get` and `set`, so interleaved requests can also read the same count. |
| V7 | `POST /auth/send-verification` has no limit | **Confirmed** | `modules/auth/index.ts:273-297` has `authMiddleware` only, and every call sends an email. Only the global 100/min applies. |
| V8 | The deployment doc claims per-client limiting works behind Cloudflare | **Confirmed wrong** | `docs/deployment_coolify.md:282-285`. Behind default Traefik the key is the Cloudflare edge IP (V2). |
| V9 | `report-rate-limit` spec codifies raw-XFF keying | **Confirmed** | `openspec/specs/report-rate-limit/spec.md:11`. |
| **N1** | *(new)* Login, register and forgot-password **share one counter**, and successful requests count against it | **Confirmed** | `auth/index.ts:27` creates one `authRateLimit` instance, used at `:65`, `:118` and `:202`. `rateLimit.ts:90` hard-codes the key `auth-ratelimit:${ip}`. A user who registers, logs in twice and asks for a password reset hits 429 on the next auth action. |
| **N2** | *(new)* The 429 message says "Too many login attempts" for register and forgot-password too | **Confirmed** | `rateLimit.ts:117`. |
| **N3** | *(new)* The registration-disabled warn log records the raw client IP (PII) | **Confirmed** | `auth/index.ts:94-96` logs `{ ip: x-forwarded-for … }`. AGENTS.md says to never log IPs. `docs/auth.md:52` documents this behaviour. |
| **N4** | *(new)* The auth DB tests rely on the spoofable header | **Confirmed** | `auth/index.test.ts:153-181`: `postJson` sends `x-forwarded-for: test-<uuid>` so that every request gets a fresh bucket. Once XFF is no longer trusted these tests would share one bucket and fail with 429, so they must be migrated. |
| **N5** | *(new)* The global limiter also throttles `/health`, `/ready` and local `/uploads/*` | **Confirmed** | `main.ts:75` runs before the `/uploads/*` handler (`main.ts:84+`) and the health router. |
| **N6** | *(new)* No `Retry-After` header, and the rate-limit headers are not CORS-exposed | **Confirmed** | `rateLimit.ts:53-55` sets only `X-RateLimit-*`. `middleware/cors.ts:16-22` has no `exposeHeaders`, so the cross-origin SPA (`brewform.cc` → `api.brewform.cc`) cannot read them. |
| **N7** | *(new)* Comment and report limiters key only by IP, even though both routes require auth | **Confirmed** | `comment/index.ts:45-49` and `report/index.ts:29-33` run before `authMiddleware`. |
| **N8** | *(new)* ADR-006 says the limiter shares `CacheProvider` and that we "avoid scripting" | **Confirmed** | `docs/decisions.md:113-121`. The new design supersedes it (docs track). |
| **N9** | *(new)* Both existing remote-cache specs are stale | **Confirmed** | `openspec/specs/remote-cache/spec.md` mandates Deno KV/denokv throughout. The unarchived delta at `openspec/changes/remove-deno-node24-pnpm/specs/remote-cache/spec.md` asserts "memory-only, `CACHE_DRIVER: z.enum(['memory'])`", which #166/#168 have since overtaken (`env.ts:24` is `z.enum(['memory','redis'])`). From that delta only "no Deno KV, no denokv sidecar, no `DENO_KV_*`" is still valid, and the docs track's REMOVED entry for `remote-cache` carries it. |

Conclusion: the core finding is valid and **high** severity. The fix has to cover all three
layers: **identity** (which client is this), **state** (where counters live and how they fail),
and **policy** (what each route allows). Fixing only the IP helper would leave V3-V6 and N1 in
place.

---

## 2. Research: client IP behind proxies

| Topology | What the API sees today | Correct source |
|---|---|---|
| Direct (dev, `make preview`, `app-prod :8000`) | XFF is whatever the client sends | TCP peer: `getConnInfo(c).remote.address` from `@hono/node-server/conninfo` (Hono docs, Context7 `/websites/hono_dev`) |
| client → Traefik (Coolify), default config | Traefik **drops** an untrusted XFF and sets `XFF: <client>` (the default is to trust only `forwardedHeaders.trustedIPs`) | Right-most XFF entry minus 1 trusted hop (`hops=1`) |
| client → Cloudflare → Traefik (default) | `XFF: <cf-edge>`; `CF-Connecting-IP: <client>` passes through unchanged | `CF-Connecting-IP`, **only if** the hop Traefik saw is a Cloudflare edge IP. Otherwise anyone hitting the origin directly can forge it. |
| client → Cloudflare → Traefik trusting CF ranges | `XFF: <spoof?>, <client>, <cf-edge>` | `hops=2`, or `cloudflare` mode as above |
| client → Caddy `reverse_proxy` (if the infra track routes `/api` through the web Caddy) | Caddy ignores an incoming XFF from peers outside `trusted_proxies` and sets the peer IP | `hops=1` per proxy layer. Outer proxies must be listed in Caddy's `trusted_proxies` for `hops=2` to hold. |

Sources and rules applied:
- MDN X-Forwarded-For: "any security-related use … (such as for rate limiting or IP-based access
  control) must only use IP addresses added by a trusted proxy". Use the **right-most** entries.
  The left-most is attacker-controlled. Two ways to choose the hop: a fixed trusted-proxy count,
  or walking from the right past trusted CIDRs.
- Cloudflare recommends `CF-Connecting-IP`, which it always overwrites at the edge. Direct-to-origin
  traffic bypasses that, which is why we verify the edge hop against Cloudflare's published ranges
  (`https://www.cloudflare.com/ips/`). Node's built-in `net.BlockList` (`addSubnet`/`check`) does
  the CIDR matching with no dependency.
- Traefik community threads: `forwardedHeaders.trustedIPs` controls whether the incoming XFF is
  kept. Coolify does not set it by default. Under Docker's userland proxy the peer can show up as
  the bridge gateway, which is one more reason the app needs an explicit, documented trust setting.
- IPv6: key on the /64 prefix, because a single subscriber usually controls a whole /64.
  express-rate-limit v8 makes the same call (its `ipv6Subnet` defaults to 56); we pick 64 as the
  common allocation unit. Normalise IPv4-mapped `::ffff:a.b.c.d` to IPv4.

**Recommendation:** use one `getClientIp(c)` helper with three modes: `none` (socket address, the
secure default), `hops` (right-most XFF minus N trusted hops, counting the socket peer), and
`cloudflare` (`CF-Connecting-IP` only when the hop is in Cloudflare's ranges or
`TRUST_PROXY_CIDRS`). Never use the raw header string as a key.

---

## 3. Research: rate-limit libraries vs a custom limiter

| Criterion | (1) `hono-rate-limiter` 0.5.4 (+ `@hono-rate-limiter/redis` 0.1.x) | (2) `rate-limiter-flexible` 11.5.0 | (3) Fix the custom limiter |
|---|---|---|---|
| Licence | MIT | ISC | n/a (ours) |
| Maturity / maintenance | Pre-1.0. 0.5.x shipped Dec 2025, and the npm registry shows 0.5.4 as latest. One small org maintains it. `@hono-rate-limiter/redis` targets `@vercel/kv`/Upstash (serverless REST), not ioredis. | Since 2018. 11.5.0 is current on the registry, published around Nov 2026 (npm operational timestamp). Zero runtime deps. Widely used: AdonisJS limiter is built on it. | We own all of it. The current custom code is what the audit found broken. |
| Hono 4.13 compat | Native middleware; `peerDependencies.hono: ^4.10.8` ✓ | Framework-agnostic. Needs a thin Hono adapter of about 80 LOC (key, headers, 429 envelope, logging) ✓ | ✓ |
| Redis/Valkey 9 via ioredis 6 | Core `RedisStore` duck-types ioredis. Atomic Lua via `EVALSHA`, with a reload-and-retry on `NOSCRIPT`. | `RateLimiterRedis` treats ioredis as the default and recommended client (`defineCommand('rlflxIncr')`, an atomic Lua INCR+TTL). The docs prescribe `enableOfflineQueue: false`. Valkey is protocol-compatible. ioredis 6 defaults to RESP3, and a Lua integer-array reply has the same shape under RESP3. We verify with an integration test against `valkey/valkey:9.1-alpine`. | `MULTI INCR / PEXPIRE NX / PTTL / EXEC`. Valkey supports `PEXPIRE … NX` (Redis 7+ semantics). Atomic without Lua. |
| Atomicity | ✓ (Lua) | ✓ (Lua) | ✓ (MULTI) |
| Behaviour when Valkey is down | A failed `store.increment` **rejects the middleware**, which our `onError` turns into a 500 (per the library's own errors doc). No fail-open; we would have to write a wrapping store. | **`insuranceLimiter`**: on any store error it switches automatically to a `RateLimiterMemory`, so limiting continues per process (fail-soft). **`rejectIfRedisNotReady`** skips Redis immediately when `client.status !== 'ready'`. | We write the fallback and the circuit logic ourselves. |
| Memory store bounds | `MemoryStore` uses two Maps that rotate every window, so keys expire in bulk. Bounded by time. | `RateLimiterMemory` expires keys with `setTimeout`. Bounded by time; max duration is about 24 days. | A bounded LRU written by us. |
| OWASP login pattern (count failures per account+IP, reset on success, block duration) | Possible with stacked middlewares, `skipSuccessfulRequests`, and `c.get('rateLimitStore').resetKey`. Clunky. | First-class: `get` / `consume` / `delete` / `block` / `blockDuration`. The wiki has a documented "login endpoint protection" recipe (slow-brute-by-IP plus consecutive-fails-by-username+IP). | We write it. |
| Standard headers | `draft-6` / `draft-7` only. The current draft-11 syntax is different. | None; the adapter emits them. | The adapter emits them. |
| Extra dependency | +1 (Hono-specific) | +1 (zero transitive) | 0 |
| Fit with ADR-006 ("avoid scripting") | Uses Lua | Uses Lua | Lua-free |

**Recommendation: option (2), `rate-limiter-flexible`, behind our own small Hono adapter**
(`apps/api/src/middleware/rateLimit.ts`, plus `utils/rate-limit/*` and `utils/client-ip/*`).
Reasons:
1. It is the only option where a Valkey outage **degrades to per-process limiting** instead of
   becoming a 500 or switching protection off. That is exactly the failure that made the audit
   rate this high.
2. It has atomic counters with no code of ours to get wrong, and the most mature and actively
   maintained codebase, with zero transitive deps under the ISC licence.
3. It supports the OWASP login pattern (account+IP failure counters, reset on success) natively.
4. The adapter keeps everything BrewForm-specific in our code: the response envelope, `requestId`,
   draft-11 headers, logging, and client-IP derivation. That keeps the library easy to swap out.

ADR-006's "avoid scripting" note dates from the in-memory era. Valkey 9.1 supports Lua, and the
default compose user has full ACL. The docs track records a superseding ADR. **Fallback** if Lua
is ever unavailable (a restricted ACL on a managed Valkey): option (3)'s
`MULTI INCR/PEXPIRE NX/PTTL` store behind the same `RateLimitBackend` interface. The design keeps
that seam.

Rejected:
- (1): no fail-soft, outdated header drafts, pre-1.0 API churn, and the store failure turns into a
  500 by design.
- (3) on its own: it reimplements (2)'s insurance, block and atomicity semantics plus their tests.
  We keep it only as the documented fallback.

---

## 4. Research: login throttling, headers, retry semantics

- **OWASP Authentication Cheat Sheet:** tie the failed-login counter to the **account**, not only
  the IP, so attackers cannot spread attempts across IPs. Balance the threshold, observation window
  and lockout duration. Guard against DoS-by-lockout and "allow the use of the forgotten password
  functionality" while locked. Use generic error messages and uniform processing. The OWASP WSTG
  calls 5-10 failures the typical threshold.
  → Policies: per-IP volumetric (20/15 min), per-IP failures (100/day), **per (account, IP)
  consecutive failures (5/15 min, reset on success)**, and **per account across all IPs (20/h)**.
  A successful password reset clears both account counters. Failures against non-existent emails
  are counted the same way, so the limiter does not leak whether an account exists.
- **IETF `draft-ietf-httpapi-ratelimit-headers-11`** (23 May 2026, active WG draft, not yet an
  RFC): `RateLimit-Policy: "<name>";q=<quota>;w=<window-s>` and
  `RateLimit: "<name>";r=<remaining>;t=<reset-s>`. Both are Structured-Field Lists, so several
  policies can appear on one response. Servers MAY send them on any status. `Retry-After` takes
  precedence for clients and SHOULD NOT point earlier than the window end.
  → Emit both, plus `Retry-After` on 429. Keep the legacy `X-RateLimit-*` for compatibility, since
  existing specs and tests assert them. Add all of them to CORS `exposeHeaders`.
- `Retry-After` on 429 (RFC 6585 §4, RFC 9110 §10.2.3): delta-seconds.

---

## 5. Research: Redis/Valkey client resilience (ioredis 6.0.0)

- ioredis 6.0.0 (2026-07-31) requires Node ≥20 and defaults to RESP3 (`protocol: 2` restores v5).
- Defaults per Context7 `/redis/ioredis/v6.0.0`: `enableOfflineQueue: true` and
  `maxRetriesPerRequest: 20`. The default `retryStrategy` backs off exponentially to a 5 s cap.
  These defaults are why an outage stalls every request today.
- For both the cache and limiter clients: `enableOfflineQueue: false` (fail fast while
  disconnected), `maxRetriesPerRequest: 1`, `commandTimeout: 500` ms, `connectTimeout: 2000` ms.
  Keep the default `retryStrategy` so the client reconnects in the background.
- Valkey keys must not be evicted under memory pressure. compose sets no `maxmemory`, so the
  default `noeviction` applies. Document: if an operator sets `allkeys-*` eviction, limiter
  counters can be evicted early.

---

## 6. Research: bounded in-memory cache

- Use a Map-based LRU: a `get` re-inserts the key to refresh recency, and a `set` at the cap
  evicts the oldest key (`map.keys().next()`). Add a periodic expiry sweep on
  `setInterval(…).unref()` and clear it in `close()`. This needs no dependency, which matches the
  user's stated preference for built-in methods (`lru-cache` was considered; see the design).
- Cap: `CACHE_MEMORY_MAX_ENTRIES` (default 10 000), sweep every 60 s.
- Once rate limiting no longer uses the cache, cache keys are server-generated (module/ID based)
  and never come from request headers. The cap is defence in depth.

---

## 7. Cross-track notes

- **Docs track:** correct `docs/deployment_coolify.md:282-285` (Cloudflare → `TRUST_PROXY=cloudflare`
  plus origin lockdown), `docs/architecture.md:92-101` and `:179`, `docs/request-lifecycle.md:17`
  and `:58`, `docs/api.md:530` and `:557`, `docs/auth.md:52`, and ADR-006
  (`docs/decisions.md:113-121`, superseded by a new ADR). Mark `openspec/specs/remote-cache`
  REMOVED with migration → `cache-driver`. AGENTS.md "Middleware stack order" is unchanged.
  AGENTS.md's Coolify nuance line should mention `TRUST_PROXY`.
- **Infra/compose track:** `compose.production.yml` and `apps/api/.env.example` gain
  `RATE_LIMIT_STORE`, `TRUST_PROXY`, `TRUST_PROXY_HOPS` and `CACHE_MEMORY_MAX_ENTRIES`. If the
  infra track routes `/api` through the web Caddy, `TRUST_PROXY_HOPS` must count that hop, and
  Caddy needs `trusted_proxies` for any outer proxy.
- **Auth-session track:** invalidating earlier verification tokens on resend, `tokenVersion`, and
  async bcrypt are out of scope here. The rate-limit counters are cleared after a successful
  password reset, which needs `confirmPasswordReset` to return the account's email (or ID).
- **`api-middleware-logging` spec (not owned):** keeps the logger name `rate-limit-middleware` and
  the message `rateLimitMiddleware rate limit exceeded`. The context object gains a `policy` field.
  The scenario's `{ limit: 100 }` example becomes `{ policy: 'global', limit: 100 }`, so the owner
  should modify that scenario if exact-object matching is intended.
