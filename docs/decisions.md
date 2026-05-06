# Architectural Decisions

A short, intentionally opinionated record of _why_ BrewForm is built the way it is. Each entry
captures the choice, the alternatives considered, and the trade-off accepted. When future code
conflicts with one of these, this file is the place to either revise the decision or document why
the conflict is justified.

For the _what_ (file layout, schema, middleware order), see `architecture.md` and
`request-lifecycle.md`.

---

## ADR-001 — Deno + npm workspaces (instead of Node + pnpm)

**Decision.** Run on the Deno runtime, but manage dependencies through `package.json` and npm
workspaces.

**Why.** Deno gives us first-class TypeScript without a build step, fetch/Web-Standards APIs,
built-in test runner / linter / formatter, and Deno Deploy as a free hosting target. Going pure-Deno
(with `deno.json` import maps) would have been simpler in isolation but locked us out of Prisma's
npm-only client and a large chunk of the Node ecosystem. Going pure-Node would mean shipping a
separate build pipeline and losing Deno Deploy.

**Trade-off.** Two ecosystems must coexist: we use `deno install` for deps and `deno run` for
execution, with `--unstable-sloppy-imports` to bridge the import-style gap. The Dockerfile uses only
Deno; the seed script is TypeScript and runs via `deno run --allow-all`.

**Excluded.** Import maps in `deno.json`. All imports use explicit npm/JSR specifiers — see
`implementation-master-prompt.md` and `deno.json`.

---

## ADR-002 — Hono (instead of Express, Fastify, Oak)

**Decision.** Use Hono as the HTTP framework.

**Why.** Hono is built on Web Standards (`Request`/`Response`), runs unmodified on Deno, Bun, Node,
and Cloudflare Workers, and ships a tiny, typed core. Its sub-router model (`new Hono<AppEnv>()`)
gives us isolated, typed contexts per module without DI machinery.

**Trade-off.** Smaller ecosystem than Express. We accept this because (a) the surface area we need
is small (CORS, request ID, JWT, validators) and (b) `hono-openapi` covers the spec generation we
need.

---

## ADR-003 — JWT with separate access + refresh tokens (instead of server sessions)

**Decision.** Stateless JWTs. Access token (15 min) used for every request. Refresh token (7 days)
exchanged for a new access token at the dedicated `/auth/refresh` endpoint.

**Why.** The frontend is a static SPA on a different origin (GitHub Pages) from the API (Deno
Deploy). Cookies across these origins require `SameSite=None; Secure` plus careful CORS config and
add no real benefit when both tokens are bearer-presented anyway. Stateless JWTs avoid a server-side
session store and keep the API horizontally scalable on Deno Deploy without sticky routing.

**Trade-off.** No server-side revocation: a leaked access token is valid until expiry. Mitigations:
short access lifetime (15 min), `type: 'access' | 'refresh'` discriminator on the payload to prevent
cross-use, and admin "ban user" which makes `authMiddleware` reject any token for that user on the
next request.

**Open follow-up.** The plan §6.6 recommends putting the refresh token in an HTTP-only cookie.
Currently it lives in `localStorage` for SPA simplicity. Tracked in `gap-analysis.md` as M5.

---

## ADR-004 — Prisma (instead of raw SQL or another ORM)

**Decision.** Prisma Client for all database access, with strict portability rules.

**Why.** Generated, fully-typed query API; built-in migrations; multiple-DB provider support keeps
`MySQL` / `SQLite` reachable later without rewriting queries.

**Trade-off — and the rule it imposes.** Postgres-specific features (`@db.JsonB`, `@db.Uuid`,
`mode: 'insensitive'`, GIN indexes) are forbidden unless isolated behind a `// POSTGRES-SPECIFIC`
comment. All IDs are `@default(uuid())` strings, all structured data is relational. See
`architecture.md` §"Portability Rules".

**Trade-off — generated-types drift.** When the schema changes, generated types lag behind the DB
until `prisma generate` is re-run. Models cope by file-level
`// deno-lint-ignore-file no-explicit-any` and `as any` on query options. Encapsulating Prisma in
`model.ts` keeps the noise out of services.

---

## ADR-005 — Module pattern: model → service → controller (instead of fat controllers)

**Decision.** Every domain module under `apps/api/src/modules/<name>/` has exactly three files:
`model.ts`, `service.ts`, `index.ts`.

**Why.** Hard-line layering catches violations early. The lint rule "services never import
`@prisma/client`" is enforceable simply by grepping. Controllers stay focused on HTTP concerns
(validation, status codes, envelope), services stay focused on business rules, models stay focused
on persistence.

**Trade-off.** A trivial CRUD operation costs three files instead of one. Worth it because (a) tests
can hit the service without HTTP, (b) the model boundary is the only place we tolerate `as any`, and
(c) a new contributor finds business logic in one predictable place.

---

## ADR-006 — Deno KV behind a `CacheProvider` interface (instead of Redis)

**Decision.** Use Deno KV for caching, but route every cache call through `CacheProvider`
(`get`/`set`/`delete`/`deleteByPrefix`). No code is allowed to call `Deno.openKv()` directly.

**Why.** Deno KV is built into Deno Deploy with no extra service to provision. The interface lets us
swap to Redis or Valkey later without touching consumers — the rate limiter, taste-note cache, and
compatibility-matrix cache all see the same API.

**Trade-off.** Deno KV is per-region, eventually consistent, and limited in expressiveness compared
to Redis. We avoid relying on advanced Redis features (pub/sub, scripting) precisely so the swap
stays cheap.

---

## ADR-007 — Shared package between frontend and backend

**Decision.** A single `@brewform/shared` package holds Zod schemas, TypeScript types, constants
(brew methods, emoji tags), pure utilities (slug, conversion, soft-validation), and i18n JSONs. Both
apps depend on it; the frontend never depends on `@brewform/db`.

**Why.** The biggest source of bugs in client/server splits is schema drift. `RecipeCreateSchema` is
the single source of truth for both the API validator and the frontend form. Same for `EmojiTagKey`,
`BrewMethod`, etc.

**Trade-off.** The shared package is reachable from the browser, so it can't import anything
Deno-only or Node-only. The split between "shared (browser-safe)" and "db (server-only)" is enforced
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

**Why.** Avoids dragging a WASM image library (`@imagemagick/magick-wasm` or similar) into the Deno
runtime, which would inflate cold-start time and the Docker image. The browser already has the
original file in memory and a free `<canvas>` resize.

**Trade-off.** Non-browser clients (e.g. a future mobile app or a curl test) won't produce
thumbnails. The backend's `saveThumbnail()` falls back to the original URL in that case so
`Photo.thumbnailUrl` is never null. If a future client must upload without resizing and still
produce thumbnails, server-side generation becomes a localized change in one helper.

---

## ADR-010 — QR `?from=qr` heuristic for "not available" routing

**Decision.** QR codes embed `https://.../recipes/<slug>?from=qr`. The recipe detail page reads the
query param and, if the lookup fails or the recipe is no longer public, redirects to
`/recipes/unavailable` instead of the generic 404.

**Why.** A user scanning a printed QR on a coffee bag gets a meaningful explanation ("This recipe is
no longer public") instead of a confusing 404. The mechanism is purely client-side and
self-contained — no server-side redirect, no API change.

**Trade-off.** A user who removes the query param loses the friendlier page. Acceptable: the 404 is
still correct, and the param survives the only flow that matters (QR → camera → browser).

---

## ADR-011 — Fire-and-forget social-event notifications

**Decision.** Email notifications for new follower / like / comment / new public recipe by followee
are sent from `apps/api/src/utils/notify/index.ts` and invoked as un-awaited IIFEs in the
originating service.

**Why.** A failing SMTP server, a slow recipient, or a malformed template must not break the
underlying social action. The user follows another user → that follow must succeed even if notifying
triggers a 5xx from the SMTP host.

**Trade-off.** Delivery is best-effort: a failure logs but does not surface to the caller. We accept
this; the alternative (synchronous email) makes the API only as fast as the slowest mail server and
turns a transient SMTP outage into a user-visible failure. A retry queue would be the next step if
we ever observe meaningful drop rates in production.

---

## ADR-012 — `describeRoute` for OpenAPI without replacing `zValidator`

**Decision.** Use `hono-openapi`'s `describeRoute` for tags / summary / responses. Keep the existing
`@hono/zod-validator`-based `zValidator(...)` for request validation. Spec served at
`/api/v1/openapi.json`, viewer at `/api/v1/docs`.

**Why.** `describeRoute` is independent of validator choice — it gives us a non-empty `paths` object
derived from the routes we care about (auth, recipe, admin, health) without rewriting every
endpoint's validation. `hono-openapi`'s own `validator` would also work but would change the shape
of `c.req.valid('json')` and the lint footprint across 17 modules.

**Trade-off.** Request bodies and query params are not auto-described in the spec — only responses
are, plus whatever `zValidator` exposes via Hono's introspection. Acceptable for now: the spec is
useful for endpoint discovery and client generation; if downstream needs full I/O typing, swap
`zValidator` for `hono-openapi`'s `validator` module-by-module.

---

## ADR-013 — JSDoc on entry points only (instead of every function)

**Decision.** JSDoc lives on module entry points (`main.ts`, `routes/index.ts`, the `CacheProvider`
interface, response helpers, the auth middleware, JWT helpers). Internal functions rely on
TypeScript types and clear names.

**Why.** Per `brewform-plan.md` §16.2: comment the _why_, not the _what_. JSDoc on every getter is
noise; JSDoc on the cache interface is documentation.

**Trade-off.** Tooling that builds API docs from JSDoc (`typedoc`) would produce a sparse output. We
don't use it; the per-feature docs in this directory are the user-facing reference.
