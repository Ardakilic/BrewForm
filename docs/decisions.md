# Architectural Decisions

A short, intentionally opinionated record of _why_ BrewForm is built the way it is. Each entry
captures the choice, the alternatives considered, and the trade-off accepted. When future code
conflicts with one of these, this file is the place to either revise the decision or document why
the conflict is justified.

For the _what_ (file layout, schema, middleware order), see `architecture.md` and
`request-lifecycle.md`.

## Index

| ADR | Decision | Status |
| --- | -------- | ------ |
| [ADR-001](#adr-001--node-lts-26--pnpm-workspaces-instead-of-deno) | Node LTS (26) + pnpm workspaces | Accepted (replaces the original runtime choice) |
| [ADR-002](#adr-002--hono-instead-of-express-fastify-oak) | Hono as the HTTP framework | Accepted |
| [ADR-003](#adr-003--jwt-with-separate-access--refresh-tokens-instead-of-server-sessions) | JWT access + refresh tokens | Accepted (amended: httpOnly cookies) |
| [ADR-004](#adr-004--drizzle-orm--postgres-js-driver-instead-of-raw-sql-or-another-orm) | Drizzle ORM + postgres-js | Accepted |
| [ADR-005](#adr-005--module-pattern-model--service--controller-instead-of-fat-controllers) | model → service → controller modules | Accepted |
| [ADR-006](#adr-006--in-memory-cache-behind-a-cacheprovider-interface-redisvalkey-later) | In-memory cache behind `CacheProvider` | Superseded by ADR-015 and ADR-016 |
| [ADR-007](#adr-007--shared-package-between-frontend-and-backend) | Shared package between frontend and backend | Accepted |
| [ADR-008](#adr-008--nauseated-over-sick-for-the-emojitag-enum) | `nauseated` over `sick` | Accepted |
| [ADR-009](#adr-009--client-side-photo-thumbnailing-instead-of-server-side) | Client-side photo thumbnailing | Accepted |
| [ADR-010](#adr-010--qr-fromqr-heuristic-for-not-available-routing) | QR `?from=qr` "not available" routing | Accepted (amended in wave 6: unlisted recipes open) |
| [ADR-011](#adr-011--fire-and-forget-social-event-notifications) | Fire-and-forget notifications | Accepted |
| [ADR-012](#adr-012--describeroute-for-openapi-without-replacing-zvalidator) | `describeRoute` without replacing `zValidator` | Accepted |
| [ADR-013](#adr-013--jsdoc-on-entry-points-only-instead-of-every-function) | JSDoc on entry points only | Superseded by ADR-020 |
| [ADR-014](#adr-014--suppress-jsdom-not-implemented-navigation-warnings-in-frontend-tests) | Suppress jsdom navigation warnings | Accepted |
| [ADR-015](#adr-015--cache-driver-memory-default-redis-protocol-optional-cache_enabled-switch) | Cache driver and `CACHE_ENABLED` | Accepted |
| [ADR-016](#adr-016--rate-limit-store-and-client-identity-rate-limiter-flexible--trust_proxy) | Rate-limit store and client identity | Accepted |
| [ADR-017](#adr-017--database-side-search-ranking-with-pg_trgm-instead-of-in-app-ranking-or-full-text-search) | Database-side search ranking with `pg_trgm` | Accepted |
| [ADR-018](#adr-018--web-data-loading-on-react-router-data-apis-instead-of-tanstack-query) | Web data loading on React Router data APIs | Accepted |
| [ADR-019](#adr-019--server-generated-upload-keys-and-built-in-magic-byte-sniffing) | Server-generated upload keys and sniffing | Accepted |
| [ADR-020](#adr-020--a-docblock-on-every-exported-symbol-enforced-by-scriptsdocblock-scants) | A docblock on every exported symbol | Accepted (supersedes ADR-013) |
| [ADR-021](#adr-021--a-generated-api-reference-instead-of-a-hand-written-endpoint-list) | Generated API reference | Accepted |

New decisions take the next free number (ADR-022 onwards) and get a row here. A superseded ADR
stays in place verbatim with a "Superseded by ADR-NNN" line under its title.

---

## ADR-001 — Node LTS (26) + pnpm workspaces (instead of Deno)

> Supersedes the original Deno decision below (see
> [`openspec/changes/archive/2026-11-20-remove-deno-node24-pnpm/`](../openspec/changes/archive/2026-11-20-remove-deno-node24-pnpm/proposal.md)
> for the migration). Retained verbatim for history.

**Decision.** Run on the Node 26 LTS runtime (upgraded from Node 24), manage the monorepo with pnpm workspaces
(`pnpm-workspace.yaml` `packages: ['apps/*', 'packages/*']`), with shared version pins in the
pnpm `catalog:`.

**Why.** Node is the boring, hireable stack: Coolify/Nixpacks defaults assume it, every hire
knows it, and the full toolchain (`tsc`, Vitest, Biome, `tsx`) runs on it. pnpm's strict
`node_modules` fails on phantom imports, and its `catalog:` maps 1:1 from the old Deno catalog.
Task orchestration uses root `package.json` `scripts` with per-workspace sub-scripts composed
via `pnpm --filter` — no external task runner needed.

**Trade-off.** A `tsc` type-check step and `tsx` for TS execution instead of run-direct; slower
dev loop, but type-safe and free of strip-types limits. All relative imports use explicit `.ts`
extensions. Both Dockerfiles build on the exact tag `node:26.13.0-trixie-slim` (pnpm installed via
`npm i -g`, as Node 25+ dropped corepack). `tsx` is a development tool (`tsx --watch`, the dev seed
via `pnpm --filter @brewform/db run seed`); the API image ships no pnpm, tsx or drizzle-kit and
runs the server, the migration runner and the first-boot seed with plain `node` (native type
stripping).

**Original Deno decision (historical).** Run on the Deno runtime, manage the monorepo with native
Deno workspaces (`deno.json` `workspace.members`), and keep a `package.json` only for npm
dependency declarations (Drizzle Kit, type declarations, test runners).

---

## ADR-002 — Hono (instead of Express, Fastify, Oak)

**Decision.** Use Hono as the HTTP framework.

**Why.** Hono is built on Web Standards (`Request`/`Response`), runs unmodified on Node,
Bun, and Cloudflare Workers, and ships a tiny, typed core. Its sub-router model (`new Hono<AppEnv>()`)
gives us isolated, typed contexts per module without DI machinery.

**Trade-off.** Smaller ecosystem than Express. We accept this because (a) the surface area we need
is small (CORS, request ID, JWT, validators) and (b) `hono-openapi` covers the spec generation we
need.

---

## ADR-003 — JWT with separate access + refresh tokens (instead of server sessions)

> **Amended (current behaviour).** The "open follow-up" below has shipped: both tokens are now set
> by the API as `httpOnly`, `SameSite=Strict` cookies (`brewform_access_token`, 15 min, path `/`;
> `brewform_refresh_token`, 7 days or 180 days with remember-me, path `/api/v1/auth`; `Secure` in
> production) and are never returned in a response body or stored in `localStorage`.
> `authMiddleware` reads the access cookie first and still accepts `Authorization: Bearer` for
> non-browser clients. See `auth.md`. The text below is the original decision.

**Decision.** Stateless JWTs. Access token (15 min) used for every request. Refresh token (7 days)
exchanged for a new access token at the dedicated `/auth/refresh` endpoint.

**Why.** The frontend is a static SPA on a different origin from the API. Cookies across these origins require `SameSite=None; Secure` plus careful CORS config and
add no real benefit when both tokens are bearer-presented anyway. Stateless JWTs avoid a server-side
session store and keep the API horizontally scalable without sticky routing.

**Trade-off.** No server-side revocation: a leaked access token is valid until expiry. Mitigations:
short access lifetime (15 min), `type: 'access' | 'refresh'` discriminator on the payload to prevent
cross-use, and admin "ban user" which makes `authMiddleware` reject any token for that user on the
next request.

**Open follow-up.** The plan §6.6 recommends putting the refresh token in an HTTP-only cookie.
Currently it lives in `localStorage` for SPA simplicity. Tracked in `gap-analysis.md` as M5.

---

## ADR-004 — Drizzle ORM + postgres-js driver (instead of raw SQL or another ORM)

**Decision.** Drizzle ORM with `postgres-js` driver for all database access, with strict portability rules.

**Why.** Lightweight, SQL-like query builder; full TypeScript type inference; `postgres-js` driver keeps
PostgreSQL features accessible.

**Trade-off — and the rule it imposes.** Postgres-specific features are used via native SQL expressions where needed.
All IDs are UUID strings generated in code or by `gen_random_uuid()`, all structured data is relational. See
`architecture.md` §"Database rules" (the database rules in `AGENTS.md`; approved raw-SQL fragments are
listed in ADR-017).

**Trade-off — schema drift.** Drizzle schema is TypeScript-first; no code generation step needed.
Models use Drizzle's typed query API; `as any` is used sparingly for complex subqueries. Encapsulating Drizzle in
`model.ts` keeps the noise out of services.

**Rule — never edit generated SQL migration files.** All schema changes (tables, columns, indexes, enums,
constraints) are authored in `packages/db/src/schema.ts`. Run `make db-generate && make db-migrate` to auto-generate
and apply migrations. The generated SQL files in `packages/db/drizzle/` must never be manually edited — Drizzle's
hash-based migration tracking depends on their integrity, and manual edits cause silent migration failures.

---

## ADR-005 — Module pattern: model → service → controller (instead of fat controllers)

**Decision.** Every domain module under `apps/api/src/modules/<name>/` has exactly three files:
`model.ts`, `service.ts`, `index.ts`.

**Why.** Hard-line layering catches violations early. The lint rule "services never import
`drizzle-orm`" is enforceable simply by grepping. Controllers stay focused on HTTP concerns
(validation, status codes, envelope), services stay focused on business rules, models stay focused
on persistence.

**Trade-off.** A trivial CRUD operation costs three files instead of one. Worth it because (a) tests
can hit the service without HTTP, (b) the model boundary is the only place we tolerate `as any`, and
(c) a new contributor finds business logic in one predictable place.

---

## ADR-006 — In-memory cache behind a `CacheProvider` interface (Redis/Valkey later)

> **Superseded by ADR-015 and ADR-016.** The Redis-protocol driver shipped, and rate limiting no
> longer goes through `CacheProvider`. Retained verbatim for history.

**Decision.** Cache in memory by default (`CACHE_DRIVER=memory`), but route every cache call
through `CacheProvider` (`get`/`set`/`delete`/`deleteByPrefix`). No code is allowed to construct
a cache backend directly.

**Why.** No sidecar to provision — the API runs anywhere with zero extra services. The interface
lets us swap to Redis or Valkey later without touching consumers — the rate limiter,
taste-note cache, and compatibility-matrix cache all see the same API.

**Trade-off.** The in-memory cache is per-process and does not survive restarts. We avoid relying
on advanced Redis features (pub/sub, scripting) precisely so the swap stays cheap. A
Redis/Valkey-backed provider is an explicit follow-up, not this change.

---

## ADR-007 — Shared package between frontend and backend

**Decision.** A single `@brewform/shared` package holds Zod schemas, TypeScript types, constants
(brew methods, emoji tags), pure utilities (slug, conversion, soft-validation), and i18n JSONs. Both
apps depend on it; the frontend never depends on `@brewform/db`.

**Why.** The biggest source of bugs in client/server splits is schema drift. `RecipeCreateSchema` is
the single source of truth for both the API validator and the frontend form. Same for `EmojiTagKey`,
`BrewMethod`, etc.

**Trade-off.** The shared package is reachable from the browser, so it can't import anything
server-only. The split between "shared (browser-safe)" and "db (server-only)" is enforced
by import discipline — the dependency graph in `architecture.md` is the contract.

---

## ADR-008 — `nauseated` over `sick` for the EmojiTag enum

**Decision.** The enum value is `nauseated` (matching `🤢`). Earlier code used `sick` in the shared
package while the DB used `nauseated`, which would silently 500 on any save.

**Why.** Aligning the shared types/Zod to the DB enum is cheaper than a Postgres
`ALTER TYPE ... RENAME VALUE`, and `nauseated` is the more accurate label for the emoji it
represents.

**Trade-off.** None at runtime; this is purely a naming choice. Captured here because the rename was
a post-review fix and is the kind of thing that quietly creeps back without an explicit decision
record.

---

## ADR-009 — Client-side photo thumbnailing (instead of server-side)

**Decision.** Thumbnails are produced in the browser via `<canvas>` (max 600 px, JPEG q=0.85) and
uploaded alongside the original. The server stores the bytes; it does not resize.

**Why.** Avoids dragging a WASM image library (`@imagemagick/magick-wasm` or similar) into the server
runtime, which would inflate cold-start time and the Docker image. The browser already has the
original file in memory and a free `<canvas>` resize.

**Trade-off.** Non-browser clients (e.g. a future mobile app or a curl test) won't produce
thumbnails. The backend's `saveThumbnail()` falls back to the original URL in that case so
`Photo.thumbnailUrl` is never null. If a future client must upload without resizing and still
produce thumbnails, server-side generation becomes a localized change in one helper.

---

## ADR-010 — QR `?from=qr` heuristic for "not available" routing

> **Amended in wave 6 (2026-11).** The original rule also redirected a scan when the recipe was
> "no longer public", which sent every scan of an **unlisted** recipe (the visibility meant for
> direct links such as a QR code) to the unavailable page. Unlisted recipes now open normally.

**Decision.** QR codes can be generated for public and unlisted recipes (`draft` and `private` are
rejected with `RECIPE_NOT_AVAILABLE`) and embed `https://.../recipes/<slug>?from=qr`. The recipe
detail loader (`apps/web/src/pages/recipes/RecipeDetailPage.data.ts`) reads the query param. When
the API answers 404 for the scanner (the recipe was deleted, or is now draft or private), it
redirects to `/recipes/unavailable` instead of the generic 404. A recipe the scanner can view opens
normally, whatever its visibility; non-public pages render `noindex, nofollow` without a canonical
link or JSON-LD (see `seo.md`).

**Why.** A user scanning a printed QR on a coffee bag gets a meaningful explanation ("This recipe is
no longer available") instead of a confusing 404, and an unlisted recipe shared by QR stays
reachable. The mechanism is purely client-side and
self-contained — no server-side redirect, no API change.

**Trade-off.** A user who removes the query param loses the friendlier page. Acceptable: the 404 is
still correct, and the param survives the only flow that matters (QR → camera → browser).

---

## ADR-011 — Fire-and-forget social-event notifications

**Decision.** Email notifications for new follower / like / comment / new public recipe by followee
are sent from `apps/api/src/utils/notify/index.ts` and invoked as un-awaited IIFEs in the
originating service. Since F04/F05 the in-app notification record (follow, like, comment, mention)
is created the same way: an un-awaited call whose failure is logged, never surfaced (see
`notifications.md`).

**Why.** A failing SMTP server, a slow recipient, or a malformed template must not break the
underlying social action. The user follows another user → that follow must succeed even if notifying
triggers a 5xx from the SMTP host.

**Trade-off.** Delivery is best-effort: a failure logs but does not surface to the caller. We accept
this; the alternative (synchronous email) makes the API only as fast as the slowest mail server and
turns a transient SMTP outage into a user-visible failure. A retry queue would be the next step if
we ever observe meaningful drop rates in production.

---

## ADR-012 — `describeRoute` for OpenAPI without replacing `zValidator`

**Decision.** Use `hono-openapi`'s `describeRoute` for tags / summary / request bodies / responses.
Keep the existing `@hono/zod-validator`-based `zValidator(...)` as the request validation middleware
on every route — `hono-openapi`'s own `validator` is **not** used anywhere in `apps/api`. Spec
served at `/api/v1/openapi.json`, viewer at `/api/v1/docs`.

**Why.** `describeRoute` is independent of validator choice — it gives us a populated `paths` object
without rewriting every endpoint's validation. `describeRoute()` metadata now covers **every mounted
route group** (`auth`, `recipe` including the personal-notes routes, `admin`, `health`, `beans`,
`badges`, `brew-logs`, `coffee-varieties`, `collections` including `/users/:id/collections`,
`comments`, `contact`, `equipment`, `follow`, `notifications`, `photos`, `preferences`, `qrcode`,
`reports`, `setups`, `taste-notes`, `users`, `vendors`, `share`, `sitemap`). The coverage test
(`apps/api/src/routes/openapi.coverage.test.ts`) enforces documentation, tags and no orphan tags for
20 base paths and asserts that the Auth, Recipes, Admin and Health groups stay documented. The
per-route reference generated from the spec is ADR-021. `hono-openapi`'s own `validator` would also
work but would change the shape of `c.req.valid('json')` and the lint footprint across every module,
so we keep `zValidator` as the single request validator.

**Request-body documentation mechanism.** Responses are described with `resolver(zodSchema)`. When
this was decided, request bodies could not use `resolver()` because `hono-openapi` v1.3.0's
`resolver()` only processed response schemas; instead, request bodies are documented by converting the **same Zod input schema** that
`zValidator` validates against to JSON Schema using Zod v4's `z.toJSONSchema`, wrapped in a small
`jsonRequestBody` helper (`apps/api/src/utils/openapi/index.ts`). No schema is duplicated — the
validator and the documentation share one source.

**Version note (refreshed in wave 6).** The workspace now resolves `hono-openapi` 1.5.0
(`apps/api/package.json`: `^1.5.0`), whose `describeRoute()` also converts `resolver()` values in
`requestBody.content[*].schema`. BrewForm still documents every request body with
`jsonRequestBody`: it already uses the validator's own schema, the coverage tests assert its
output, and one mechanism per concern keeps the routes uniform. Moving request bodies to
`resolver()` would be a separate, deliberate change.

**Trade-off.** Both request bodies (via `jsonRequestBody`/`z.toJSONSchema`) and responses (via
`resolver`) are now fully described in the spec, alongside query/path parameters declared in
`describeRoute().parameters`. The spec is therefore complete enough for client generation and
full I/O typing while leaving the runtime validation path (`zValidator`) untouched.

---

## ADR-013 — JSDoc on entry points only (instead of every function)

> **Superseded by ADR-020.** Every exported symbol now carries a docblock, enforced by
> `scripts/docblock-scan.ts`. Retained verbatim for history.

**Decision.** JSDoc lives on module entry points (`main.ts`, `routes/index.ts`, the `CacheProvider`
interface, response helpers, the auth middleware, JWT helpers). Internal functions rely on
TypeScript types and clear names.

**Why.** Per `brewform-plan.md` §16.2: comment the _why_, not the _what_. JSDoc on every getter is
noise; JSDoc on the cache interface is documentation.

**Trade-off.** Tooling that builds API docs from JSDoc (`typedoc`) would produce a sparse output. We
don't use it; the per-feature docs in this directory are the user-facing reference.

---

## ADR-014 — Suppress jsdom "Not implemented: navigation" warnings in frontend tests

**Decision.** Add a global `click` listener in `apps/web/src/test-setup.ts` that calls `event.preventDefault()` on clicks to internal anchor links (`<a href="/...">`). This silences jsdom's "Not implemented: navigation to another Document" warning without affecting test assertions.

**Why.** The frontend test suite runs in jsdom via Vitest. jsdom does not implement actual page navigation, so clicking any `<a>` element that has an `href` triggers a console warning. The Navbar PBT test (`Navbar.pbt.test.tsx`) clicks mobile nav links 100 times per run; combined with a few other tests that click internal links, this produced ~101 scattered warnings across the full suite, making the test output noisy and masking real issues.

**Trade-off.** The listener prevents default only for `href` values starting with `/`, so external links and non-link clicks are unaffected. Navigation never actually worked in jsdom anyway, so no test behaviour changes — the warning was purely cosmetic. If we ever switch to `happy-dom` or a real browser runner, this listener becomes harmless (`preventDefault` on a non-navigating click is a no-op).

**Reference.** See `apps/web/src/test-setup.ts` for the implementation.

---

## ADR-015 — Cache driver: memory default, Redis-protocol optional, `CACHE_ENABLED` switch

> Supersedes ADR-006 (together with ADR-016).

**Decision.** The API cache has two drivers behind `CacheProvider`, chosen at startup in `main.ts`
and installed as the singleton in `apps/api/src/utils/cache/singleton.ts`. Route handlers read it
from the request context (`c.get('cache')`, injected by the cache middleware); no code constructs a
backend directly.

- `CACHE_DRIVER=memory` (default): `InMemoryCacheProvider`, a bounded `Map` LRU
  (`CACHE_MEMORY_MAX_ENTRIES`, default 10,000; a read refreshes recency, the oldest key is evicted
  at the cap) with an `unref()`'d expiry sweep every 60 s. Per process; nothing to provision.
- `CACHE_DRIVER=redis` + `REDIS_URL`: a Redis-protocol provider (any Redis-compatible server; the
  compose files run Valkey 9.1) on the shared fast-fail client (`utils/redis/client.ts`: no offline
  queue, one retry, short command and connect timeouts), wrapped in `FailSoftCacheProvider`
  (`utils/cache/failSoft.ts`). During an outage a failed read is a miss and a failed write a
  no-op, with one warn per outage and one info on recovery; if an invalidation was dropped, the
  cache namespace (`brewform:`) is flushed once after recovery so stale entries cannot outlive the
  outage.
- `CACHE_ENABLED=false` installs `NullCacheProvider` (every read misses). It turns caching off and
  nothing else; rate limiting is independent (ADR-016).
- `/ready` reports `cache` as `memory`, `disabled`, `ok` or `degraded` without changing its status
  code, which depends only on the database.

**Why.** A single instance should run with zero extra services, so memory stays the default. Several
replicas need a shared cache so an invalidation on one is seen by the others, which the
Redis-protocol driver provides. The unbounded memory map grew forever (entries were evicted only
when re-read), and the previous redis client used library defaults (offline queue, many retries),
so a cache outage stalled and then failed every request. A cache is an optimisation: an outage must
cost speed, not availability.

**Alternatives rejected.** `lru-cache` (a dependency for about 40 lines of `Map` code); serving stale
entries until their TTL after an outage (up to 24 h of stale data); keeping the rate-limit counters
in the cache (see ADR-016); Valkey-only features such as pub/sub invalidation (they would tie the
driver to one server family).

**Trade-off.** With the memory driver every replica has its own cache, so a write on one replica is
not seen by another until the entry expires; multi-replica deployments should use the redis driver.
While Valkey is down every request misses and hits the database.

---

## ADR-016 — Rate-limit store and client identity (`rate-limiter-flexible` + `TRUST_PROXY`)

> Supersedes ADR-006's "the rate limiter sees the same cache API" (together with ADR-015).

**Decision.** Rate limiting has its own state and its own notion of the client.

- **Engine.** `rate-limiter-flexible` 11.5.0 (pinned) behind an in-house Hono adapter
  (`middleware/rateLimit.ts`: `rateLimit(policy)` and `rateLimitFailures(policy, …)`;
  `utils/rate-limit/`: backend, registry, named `POLICIES`, headers).
  `RATE_LIMIT_STORE=memory` (default) uses `RateLimiterMemory`; `RATE_LIMIT_STORE=redis` reuses
  `REDIS_URL` with a dedicated client and `RateLimiterRedis` (atomic increment + TTL) with
  `rejectIfRedisNotReady` and an in-memory `insuranceLimiter`, so a Valkey outage degrades to
  per-process limiting instead of failing requests. Keys live under `brewform-rl:`, outside the
  cache namespace, so cache flushes never reset them. `RATE_LIMIT_ENABLED=false` is the only off
  switch; `CACHE_ENABLED` has no effect on limiting. If the adapter itself throws, it logs `error`
  and lets the request through.
- **Client identity.** `getClientIp(c)` in `utils/client-ip/index.ts` is the single source,
  controlled by `TRUST_PROXY`:
  - `none` (default): the TCP peer address only; forwarding headers are ignored (one warn line on
    the first request that carries them).
  - `hops`: the entry `TRUST_PROXY_HOPS` (default 1) positions from the right of
    `X-Forwarded-For` plus the socket peer, so client-written prefixes are ignored.
  - `cloudflare`: the `hops` candidate, replaced by `CF-Connecting-IP` only when that candidate is
    a bundled Cloudflare range or in `TRUST_PROXY_CIDRS`.
  Addresses are normalised and IPv6 is bucketed by /64 (`rateLimitIpKey`).
- **Policies and keys.** Named policies (`POLICIES` in `utils/rate-limit/policies.ts`: global,
  uploads, login, register, forgot-password, the email-token routes, verification resend, contact,
  comments, reports) key on IP, a hashed email or the user id. Login
  follows the OWASP failure-counting pattern: per-IP attempts, per-IP failures, consecutive
  failures per (email, IP) cleared on success, and per-email failures across IPs. Emails become the
  first 32 hex characters of their SHA-256; logs carry `policy`, `limit`, `userId` and `err`, never
  a raw IP or email.
- **Contract.** IETF draft-11 `RateLimit-Policy`/`RateLimit` headers (one item per evaluated
  policy), legacy `X-RateLimit-*`, `Retry-After` on every 429 and the
  `RATE_LIMITED` error envelope; CORS exposes all of them. `/ready` reports `rateLimitStore`.

**Why.** The old limiter keyed on the raw `X-Forwarded-For`, so a client could rotate the header to
bypass it, deployments behind a proxy shared one edge bucket, and deployments without one shared a
global `unknown` bucket. Its counters were a non-atomic get-mutate-set on the cache, so
`CACHE_ENABLED=false` silently switched limiting off and a cache outage turned into 500s on every
request, `/health` included. One shared auth bucket that counted successes locked out legitimate
users after a few normal actions.

**Alternatives rejected.** `hono-rate-limiter` (a store error becomes a 500, pre-1.0); fixing the
custom limiter with a hand-written `MULTI` store (reimplements insurance and failure semantics); a
CIDR list of trusted proxies (needs subnets Coolify hides); trusting `CF-Connecting-IP` blindly
(forgeable against the origin); hard account lockout or CAPTCHA for login.

**Trade-off.** Operators must set `TRUST_PROXY` to match their topology; the secure default fails
toward visible shared buckets rather than a silent bypass, and the deployment templates set it
explicitly (`hops`/`1` behind the web edge or Traefik; see `deployment_coolify.md` for Cloudflare).
With the memory store each replica counts separately, so the effective limit scales with the
replica count until `RATE_LIMIT_STORE=redis` is set.

---

## ADR-017 — Database-side search ranking with pg_trgm (instead of in-app ranking or full-text search)

**Decision.** Recipe search (`GET /api/v1/recipes?search=…` and `/recipes/starred`) is scored,
ordered and paginated by PostgreSQL. `buildListPageQuery` / `findListPage` in
`apps/api/src/modules/recipe/model.ts` run one core `select` with the author mini-projection,
`ORDER BY score DESC, <sortBy>, recipes.id`, `LIMIT perPage OFFSET …`, plus a parallel `COUNT(*)`
over the same `WHERE`. The score keeps the previous weights: `3 × title match + the best single
version's (2 × productName match + 1 × personalNotes match)`. Every match is the same escaped
`ilike '%term%'` predicate the filter uses (`toContainsPattern(normalizeSearchTerm(search))`), and
the search filter is one `inArray(recipes.id, union(titleIds, versionRecipeIds))` condition.
`sortBy=rating` orders by `avg(user_recipe_rating.rating)` with unrated recipes last. Every offset
listing ends with `recipes.id` as a unique tie-break.

The `pg_trgm` extension is approved, enabled by the only hand-written migration
(`drizzle-kit generate --custom --name=enable_pg_trgm`: `CREATE EXTENSION IF NOT EXISTS pg_trgm;`),
and backs three GIN `gin_trgm_ops` indexes declared in `schema.ts` (`recipe.title`,
`recipe_version.product_name`, `recipe_version.personal_notes`). The migration runner checks first
that the extension is installed or creatable (`packages/db/src/preflight.ts`). Two `sql` template
fragments are approved in `model.ts`, both marked `// D03 raw-SQL exception:`. They take Drizzle
columns and bound parameters only:

- the `CASE WHEN … THEN n ELSE 0 END` relevance score (with `coalesce`), because Drizzle 0.45 has
  no `CASE` builder;
- the `… NULLS LAST` rating order, because Drizzle's `asc()`/`desc()` have no nulls option.

Every API connection also runs under a server-side `statement_timeout`. It comes from
`DB_STATEMENT_TIMEOUT_MS` (default 10000, `0` disables), and a cancelled statement (SQLSTATE
`57014`) answers 503 `QUERY_TIMEOUT`.

**Why.** The previous search loaded every matching recipe, with every version's coffee name and
personal notes (up to 10,000 characters each), into the API process. It then ranked them in
JavaScript and sliced out one page. Memory and CPU grew with the number of matches on every
request, two pool connections stayed busy for the whole leading-wildcard sequential scan, and a
one-letter search was an unauthenticated denial-of-service vector. JavaScript `toLowerCase()` also
disagreed with PostgreSQL `ILIKE` (`İstanbul` matched in SQL but scored 0 in JS). Scoring in SQL
with the filter's own predicate fixes the mismatch by construction. Memory is O(perPage), and the
trigram indexes make `%term%` matches index-assisted for terms of three or more characters. The
index is lossy and rechecked, so results are unchanged.

Rejected alternatives:

- **PostgreSQL full-text search (`tsvector` + `ts_rank`).** It matches lexemes, not substrings
  (`yirga` does not find `Yirgacheffe`). `ts_rank` is frequency-based rather than the boolean
  3/2/1 model. Generated columns cannot span `recipe` and `recipe_version`. The `turkish` stemmer
  mangles English, and the query code would need the `@@` operator.
- **A bounded top-K candidate set ranked in JavaScript.** It still loads thousands of rows of notes
  per request, and relevant recipes older than the top K never appear, so the total is wrong.
- **The previous unbounded in-app ranking (F11).** See "Why".

**Trade-off.** The database now depends on an extension. Both official images BrewForm uses
(`postgres:18-trixie`, `postgres:18-alpine`) ship `pg_trgm` 1.6. A managed server must offer it,
and the migrating role needs `CREATE` on the database (`pg_trgm` is a trusted extension, so no
superuser is needed); the pre-flight stops the deployment with a remedy otherwise. GIN indexes add
write cost and size, roughly the size of the indexed text for `personal_notes`. Building them
briefly locks `recipe`/`recipe_version` writes during the migration. Search keeps offset
pagination (a `(createdAt, id)` cursor cannot follow the score), and keyset paging on the score is
a deferred follow-up. Terms shorter than three characters extract no trigrams. They fall back to a
full index scan, which the statement timeout bounds.

---

## ADR-018 — Web data loading on React Router data APIs (instead of TanStack Query)

**Decision.** The web app loads and writes server data only through React Router data APIs:

- **Route reads** run in route `loader`s, co-located in a `<Page>.data.ts` module next to the page
  (or under `apps/web/src/routes/`). Lazy routes use the object form
  `lazy: { loader, action, Component }`, so the data and the page code load in parallel.
- **Writes** run in route `action`s, submitted with `<Form>`, `useSubmit()` or
  `useFetcher().submit()`. Every action returns `{ ok: true, ... }` or `{ ok: false, error }` for
  expected failures; it does not throw. Pages with several mutations use one action keyed by
  `intent`, and the UI toasts or rolls back on `ok: false`.
- **Component-level reads** (typeaheads, the notification badge and dropdown, the add-to-collection
  list, brew history and stats, taste-note lookups, the QR download) use `useFetcher().load()`
  against `resources/*` resource routes. A fetcher's new `load()` cancels its previous one.
- Every loader and action passes `request.signal` to each API client call. Auth-guarded routes wrap
  them in `requireAuth`/`requireAdmin` (`routes/auth-guards.ts`), which turn a final 401 into
  `/login?next=…` and an admin 403 into `/`.
- `shouldRevalidate` and `defaultShouldRevalidate: false` scope revalidation to the data an action
  changed (social toggles and comments do not re-run the recipe detail loader).
- Static lookups (equipment, flat taste notes) go through the single-flight cache in
  `api/static-cache.ts`. Mutations call `invalidateStaticCache()`; the cross-tab listener calls
  the local-only `clearStaticCache()`.

`useEffect` is allowed only for non-fetch work (logging, subscriptions, focus handling) and for
triggering `fetcher.load()` or `revalidator.revalidate()` on mount or an external event (window
focus, `brewform:notifications-changed`). The single exception that calls the API client outside a
loader, action or resource route is the session store `contexts/AuthContext.tsx`, which sits above
the router and bootstraps the session with `userApi.me()`.

**Why.** React Router (already the app's router) provides, at no extra cost:

- request cancellation through `request.signal`, and stale responses are discarded;
- data that starts loading before render, in parallel with lazy page code (no waterfalls);
- pending state (`useNavigation()`, `fetcher.state`) and route `errorElement`s, so a failed load
  renders an error state instead of "no results";
- revalidation after mutations;
- the URL as the natural loader input, which the shareable list URLs need;
- auth redirects before anything renders.

Loaders and actions are plain async functions and easy to unit-test. The wave-6 audit counted 42
`useEffect` fetch blocks in 39 files. None of them aborted and only 4 had a stale-response guard,
and many rendered a failed load as an empty list. Mixing effect fetching with loaders carried the
costs of both. Because `apps/web` is one app, it can adopt one paradigm everywhere.

**Alternatives rejected.**

- **TanStack Query:** a new dependency, and a second cache to invalidate next to router
  revalidation. The D10 analysis (`plans/D10-tanstack-query-migration.md`) had already chosen the
  router's data APIs over it.
- **A homemade `useApiQuery` hook:** still two paradigms, and it loses the router's pending, error
  and revalidation integration.
- **`useEffect` + `useState` fetching:** familiar and co-located, but every effect needs its own
  abort and stale guard, loading/error/refetch state is hand-rolled per page, URL state has to be
  mirrored into component state, and auth redirects flash.
- **v8 route middleware for auth:** the session store lives above the router, and loaders start
  before it resolves, so the guards are loader wrappers instead.

**Enforcement.** A Biome `style/noRestrictedImports` override bans `api/client.ts`, `api/index.ts`
and `api/static-cache.ts` outside `api/**`, `routes/**`, `*.data.ts`, `AuthContext` and tests
(types live in `api/types.ts`, `ApiError` in `api/errors.ts`). `apps/web/src/architecture.test.ts`
fails on any `useEffect` that calls the API. `apps/web/src/data-loading.enforcement.test.ts` is a
lint-independent source scan of client imports, raw `fetch(`, loader placement and data-module
imports.

**Trade-off.** Each page needs route-config wiring and a `*.data.ts` module, and revalidation needs
thought (`shouldRevalidate`). There is no cache across navigations beyond the small static-lookup
cache. That is acceptable for this app, because loaders refetch cheaply and the lookups that are
read everywhere are cached.

---

## ADR-019 — Server-generated upload keys and built-in magic-byte sniffing

**Decision.** Photo uploads are stored under keys generated entirely on the server:
`crypto.randomUUID()` plus an extension from a fixed MIME table (`<uuid>.jpg|png|webp`, and
`<uuid>_medium.<ext>` for the thumbnail). Each part's type is detected from its bytes by a small
built-in sniffer (`apps/api/src/utils/upload/sniff.ts`: JPEG marker walk to SOF0–SOF15, PNG `IHDR`,
WebP `VP8 `/`VP8L`/`VP8X`), which also reads the header dimensions for the size and
decompression-bomb limits. The client filename is never read, the declared Content-Type is only a
hint, and every storage driver re-checks keys (`assertSafeStorageKey`) before any I/O. The S3 driver
URI-encodes and signs the exact `/<bucket>/<key>` path with an empty query and a signed
`content-type`; the local driver creates files exclusively (`wx`). The photo routes get their own
body cap (`UPLOAD_MAX_SIZE_BYTES` + thumbnail cap + 64 KiB) instead of skipping the 1 MB limit.

**Why.** The old key was `<timestamp>-<uuid8>.<client extension>`, built from the raw multipart
filename and concatenated into an unencoded S3 URL. A filename like
`a.x/%2e%2e/%2e%2e/other-bucket/payload` was signed and sent as a write to another bucket, and
`a.x/%2e%2e?policy=` produced a signed bucket-configuration `PUT`. Removing client input from keys
removes that whole class of bugs. Detecting the type from bytes stops HTML/SVG uploads disguised as
images and stores every object with a correct Content-Type.

**Alternatives rejected.**

- `file-type`: ESM-only with four transitive dependencies, described by its own README as "a
  best-effort hint", unbounded buffer by default, and it returns no dimensions.
- `image-size`: a reasonable zero-dependency fallback, but the allowlist has only three formats and
  the built-in parser (about 100 lines, every read bounds-checked) covers them.
- `sharp`: a native dependency that decodes and can re-encode; it belongs to image optimisation
  (F23), not to this security fix.
- `busboy` (streaming multipart): a new dependency and a handler rewrite; the bounded body cap keeps
  the buffered `formData()` within about 11 MiB, which is enough.
- Sanitising the client extension, content-hash keys, or keeping the timestamp: each still trusts
  input, shares objects between uploads, or leaks the upload time.

**Trade-off.** Dimension limits (16,384 px per side, 50 MP; 1,200 px for thumbnails) are code
constants, not env vars. No EXIF/GPS stripping happens yet, because doing it without re-encoding
loses the orientation (follow-up with F23). Builds on ADR-009: thumbnails are still made in the
browser, and the server now validates them like the original instead of storing any bytes. Old
photo rows keep their URLs (rows store full URLs, so no migration is needed).

---

## ADR-020 — A docblock on every exported symbol (enforced by `scripts/docblock-scan.ts`)

> Supersedes ADR-013.

**Decision.** Every exported production symbol (function, class, interface, type, enum and exported
constant) under `apps/api/src`, `apps/web/src`, `packages/shared/src` and `packages/db/src` carries a
`/** … */` docblock that states its purpose, plus `@param`/`@returns`/`@throws` where they add
information. Test, fixture, generated and `*.d.ts` files are excluded. `scripts/docblock-scan.ts`
(dependency-free, plain `node`) lists every export without one; `--check` exits 1 on any finding,
and it runs in `make docs-check` / `pnpm run docs:check` next to the doc-drift check.

**Why.** ADR-013's "entry points only" contradicted the code-documentation capability, and "enforced
by review" did not hold: exports added after the wave-5 backfill arrived undocumented. Agents and
contributors read docblocks as the contract of a module, so a missing one is a real gap. A scanner
makes the rule mechanical instead of a review judgement.

**Alternatives rejected.** Keeping ADR-013 (it already failed in practice); a typedoc build (adds a
dependency and output nobody reads; the docs in this folder remain the reference); a lint rule from
a plugin (Biome has no equivalent rule).

**Trade-off.** Small exported helpers carry a short docblock that can feel redundant. The scanner is
line-based (column-0 `export` statements), so unusual export forms are documented at their origin
or on the export statement.

---

## ADR-021 — A generated API reference (instead of a hand-written endpoint list)

**Decision.** `docs/api-reference.md` is generated: `pnpm --filter @brewform/api run docs:api`
(`apps/api/scripts/generate-api-reference.ts`) builds the real route tree in-process, the same way
the OpenAPI coverage test does, and renders every documented operation (method, path, summary,
auth, parameters, request body and responses) as Markdown. It is never edited by hand. CI
regenerates it and fails on any diff (`.github/workflows/ci.yml`, "API reference is up to date").
`docs/api.md` keeps only the conventions that apply across routes (envelopes, error codes,
authentication, pagination, search, rate limits, request limits, visibility, partial updates).

**Why.** The hand-written `docs/api.md` drifted: it missed whole modules (brew logs, collections,
notifications, merge, diff, the sitemap, the cursor and advanced-search parameters) and still
documented a removed filter. The OpenAPI metadata is already mandatory on every route (ADR-012), so
it is the one source that cannot fall behind the code.

**Alternatives rejected.** Keeping the hand-written list with a review checklist (it already
drifted); linking only the Scalar UI (`/api/v1/docs` needs a running API and `OPENAPI_ENABLED`, and
is not reviewable in a pull request); a third-party Markdown generator (a dependency for a small
renderer).

**Trade-off.** The reference is only as complete as the route metadata: a route without
`describeRoute()` is missing from it, and the auth and admin groups are outside the coverage test's
scope. Every route change also needs a regenerated reference in the same pull request.
