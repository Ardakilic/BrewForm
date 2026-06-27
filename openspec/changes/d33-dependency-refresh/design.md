# Design — d33 Dependency Refresh

## Context

Executes the dependency upgrade `d31` deferred (its Non-Goal: *"No dependency version upgrades… the
catalog records the EXISTING ranges"*). Goal: every workspace dependency at its latest **stable**
version, in one pass. The *what's-outdated* source is Renovate (issue #8); the *what's-latest* source
is the npm registry / JSR / upstream release pages, queried 2026-06-27 and frozen into the target
table in `tasks.md`; the *what-breaks* source is Context7 + published package artifacts. This change
is meant to be applied in a condensed fresh context, so the artifacts are deliberately self-contained
(exact versions, file paths, commands).

## Decision 1 — Float to latest stable AND bump every `^` floor

**Decision:** refresh `deno.lock` to the latest stable of every workspace dependency, AND raise each
manifest `^` floor (and the catalog ranges) to the resolved latest. Not lock-only.

**Why:** user directive — this is debt-cleaning; manifests must read as current, not just the lock. A
lock-only refresh leaves `hono ^4.7.0` while the lock sits at `4.12.27`; the manifest then lies about
what's current.

**Mechanism:** prefer `deno outdated` to discover and `deno outdated --update --latest` to apply (on
Deno 2.9 it rewrites `deno.json`/`package.json` ranges + `deno.lock` in one pass). Hand-edit any
surface it doesn't touch — the root **catalog** block (the `catalog:` indirection may be invisible to
`deno outdated`) and JSR `jsr:@std/...` specifiers — then `deno install` to re-resolve, and `deno ci`
to prove the lock is frozen-installable. **Floors are listed concretely in `tasks.md`, but verify
against the resolved lock at apply** (a patch may have shipped since 2026-06-27).

**Guard:** this *destructive* float is the deliberate inverse of d31's non-destructive lock. Re-run
the full gate (Decision 6) — a floated minor can surface a real regression even within range.

## Decision 2 — `react-router` v8 is a version bump, not a migration

**Evidence (Context7 + published `react-router@8.0.1` artifacts):**

| v8 breaking change | Affects us? | Why |
|---|---|---|
| Removes the `react-router-dom` package | No | Every import is from `react-router`; `react-router-dom` is never imported. |
| `RouterProvider` "preferred" from `react-router/dom` | Optional | Main `react-router` entry still re-exports it in 8.0.1; nothing breaks if left. |
| Removes `json()` / `defer()` | No | Zero imports of `json`/`defer` from react-router (the "14 json" were `response.json()` + `application/ld+json`). |
| `meta` `data` arg → `loaderData` | No | No react-router `meta` exports (custom SEO component). |
| `v8_middleware` always-on `RouterContextProvider` | No | No loader/action uses `context`; all use `{ params, request }`. |
| Peer `react`/`react-dom` `>=19.2.7` | **Yes** | Floor is `^19.1.0`; raise to `^19.2.7`. The one hard requirement. |
| `engines.node >=22.22.0` | Advisory | Client-bundled by Vite under Deno; at most an `EBADENGINE` warning. |

**Decision:** `react-router ^7.5.0 → ^8.0.0`; `react`/`react-dom` floor → `^19.2.7` (npm latest is
exactly 19.2.7); `@types/react → ^19.2.17`, `@types/react-dom → ^19.2.3`. Per the user's choice,
split `RouterProvider` imports to `react-router/dom`, keeping constructors/hooks/types on
`react-router`. **The file set is whatever `grep -rl "RouterProvider" apps/web/src` returns at
apply** — at authoring it was `apps/web/src/App.tsx` plus ~10 test files (`HomePage.test.tsx`,
`SettingsPage.test.tsx`, `RecipeDetailPage.test.tsx`, `StarredRecipesPage.test.tsx`,
`RecipeListPage.test.tsx`, `UserProfilePage.test.tsx`, `CommentSection.test.tsx`,
`LikeButton.test.tsx`, `FavouriteButton.test.tsx`, `FollowButton.test.tsx`).

**Risk:** core vs DOM `RouterProvider` differ only in `flushSync`/view-transition integration (unused
here); behavior is preserved. Confirm `@base-ui/react@^1.6.0` and `@testing-library/react@^16.3.2`
accept React 19.2.x (they do — 19.2 is a minor).

## Decision 3 — `zod-openapi` v6 is used transitively; OpenAPI output is unchanged

**This corrects an earlier understatement** ("not used in source"). zod-openapi **is** part of the
live OpenAPI pipeline — just never directly imported. The chain (verified in `node_modules`):

```
our plain Zod schemas
  → hono-openapi  resolver()/describeRoute()              (apps/api/src/modules/**, utils/openapi)
  → hono-openapi  toOpenAPISchema()                       (hono-openapi@1.3.0 dist/index.js:343,471)
  → @standard-community/standard-openapi@0.2.9            (loadVendor + toOpenAPISchema)
  → dynamic import('zod-openapi') → createSchema(schema)  (standard-openapi dist/zod-*.js) ← runs here
```

**Why v6 does not change our output:**
- standard-openapi calls **`createSchema()`** (per-schema converter), **not** `createDocument()`. v6's
  single runtime breaking change is `createDocument()` returning OAS 3.2.0 instead of 3.1.0 — that
  function is never called on our path.
- The document's `openapi:` version is set by **hono-openapi**, hard-coded to `"3.1.0"` — not by
  zod-openapi. So the emitted document version is invariant to the zod-openapi major.
- `createSchema()`'s OAS-3.1 per-schema output is unchanged in v6. v6's other change is dropping Zod 3
  / Node 20 (min Zod 4.0.0, Node 22.14.0) — we run Zod 4.4.3 + Deno 2.9 (which does not enforce npm
  `engines`).

**Decision:** `zod-openapi ^5.0.0 → ^6.0.0` in `packages/shared/package.json` only (no `hono-openapi`
bump — it declares no dependency on zod-openapi and is agnostic to its major). Refresh the "v5"
doc-comments in `packages/shared/src/schemas/response.ts` (≈L9–10),
`packages/shared/src/schemas/responses/_shared.ts` (≈L7–9), and `AGENTS.md:71` → "v6"; re-verify via
Context7 that the `zod-openapi/extend` guidance still holds in v6 (it should — re-word, don't delete).
Regression net: `apps/api/src/routes/openapi.coverage.test.ts` (walks every generated path, fails on
any unresolved schema or `{vendor:'zod'}` stub) + `openapi.test.ts`.

**Residual:** `@standard-community/standard-openapi@0.2.9` declares `zod-openapi: "^4"` as an
*optional* peer, so v6 widens an already-existing nominal mismatch (it tolerates `5.4.6` today). Deno
does not hard-enforce npm peer ranges; the coverage test is the real guard.

## Decision 4 — `drizzle-kit` tracks latest stable `0.31.10`; `1.0` RC excluded

**Facts (npm `dist-tags`, 2026-06-27):** `latest = 0.31.10`. The `1.0.0` line exists only as
`beta`/`rc` tags (e.g. `beta = 1.0.0-beta.22`, `rc = 1.0.0-rc.4`) — pre-release.

**Decision:** bump `drizzle-kit ^0.31.0 → ^0.31.10` in `packages/db/package.json` and refresh the
lock. **Do NOT adopt `1.0.0-rc/beta`** — a debt/stability cleanup tracks latest *stable*, and the
migration tool is deployment-critical (it runs in `docker-entrypoint.sh`). The caret on a `0.x`
version already locks the minor, so `^0.31.0` and the `npm:drizzle-kit@0.31` pins **already resolve to
`0.31.10`** — meaning drizzle-kit *does* update, with **no pin-string change** in
`packages/db/deno.json` tasks (5×), `Makefile` (`DRIZZLE_KIT`), `docker-entrypoint.sh`, the Dockerfile
builder, or the deployment guide. The `deployment-guide` spec intentionally pins the `0.31` *line*
(its requirement forbids a patch-pin like `@0.31.10`), so it stays correct and unedited.

**This directly answers the request** "if drizzle-kit is updated, reflect it on the Coolify plan":
drizzle-kit is updated to `0.31.10`, but because the plan pins the `0.31` minor line (which now
resolves to `0.31.10`), there is no plan line to change. Adopting the `1.0` RC *would* require a
coordinated multi-surface change — explicitly out of scope here.

## Decision 5 — Deployment audit: every pinned version is already latest (no edits)

Audited reference-by-reference against upstream (2026-06-27):

| Pinned in deploy surface | Current | Latest stable | Action |
|---|---|---|---|
| Deno runtime | 2.9.0 | 2.9.0 | none (owned by d31) |
| `drizzle-kit` | `@0.31` → 0.31.10 | 0.31.10 (1.0 = RC) | lockfile only; pin string unchanged |
| `denokv` | 0.14.0 | 0.14.0 | none |
| `caddy` | 2.11.4-alpine | 2.11.4 | none |
| `postgres` | 18 (trixie/alpine) | 18 (19 = beta) | none |
| `garage` (local dev) | v2.3.0 | v2.3.0 | none |
| actions/checkout | v7 | v7 | none |
| denoland/setup-deno | v2 | v2 | none |
| actions/upload-artifact | v7 | v7 | none |
| docker/setup-buildx · login · build-push | v4 · v4 · v7 | v4 · v4 · v7 | none |

**Conclusion:** `coolify_deployment_plan.md`, `openspec/specs/deployment-guide/spec.md`, the
Dockerfiles, `compose.yml`, `release.yml`, `ci.yml`, and `pr.yml` need **no** edits — not because
they're out of scope, but because every version they pin is *already* the latest stable (d30–d32
modernized the deploy surface). The `dependency-management` capability records this decoupling so a
future floor bump can't silently desync a pinned infra version. Task 5 re-verifies this at apply (a
cheap diff-check) rather than trusting the audit blindly.

## Decision 6 — Verification gate

No new runtime code beyond the import split, so the existing suites are the safety net; run all +
a frozen install:

1. `deno fmt --check` · `deno lint` · `deno check` (type-check catches RR v8 / zod-openapi v6 drift).
2. `deno task build` (API email-build + web `vite build` — proves the web bundle builds on RR v8 +
   Vite 8.1).
3. `deno task test-coverage` + `deno task test:db` + `deno task --cwd apps/web test` (the RR
   component tests and `openapi.coverage.test.ts` are the major-bump regression guards).
4. `deno ci` from a clean tree — proves the refreshed lockfile is reproducible/frozen-installable.
5. `docker compose build app` — rebuild the dev image (it goes stale after a lock change, or
   `make fmt/check/lint` runs against the old image).

## Decision 7 — Test strategy & the workspace-integrity test

The only source edit (the `react-router/dom` split) is already exercised by the test files that render
via `RouterProvider`, covering production `App.tsx`. For an explicit drift guard, **extend**
`packages/shared/src/workspace.test.ts` (the d31 BDD artifact) with: (a) no member manifest `^` floor
is below its `deno.lock`-resolved version, and (b) `react-router` floor is `^8.x` and `zod-openapi`
floor is `^6.x`. Resolve paths from `import.meta.url` (root-relative); assert by **major** (not exact
patch — survives routine bumps); docblock any new helper (purpose/params/return) per the file's
existing `readJson` convention.

## Apply-phase directives (carried from the request)

- **Use Serena MCP** for all semantic code retrieval and source edits (the `RouterProvider` split, the
  doc-comment edits, the test extension) — symbol-aware, not blind text replace.
- **Use Context7 MCP** to re-confirm any library API before editing; it is the cited source for the v8
  / v6 findings. Do not rely on memory for library behavior.
- **Delegate** independent units (lockfile refresh / web RR split / shared zod-openapi bump / test
  extension / deploy verification) to sub-agents to keep the orchestration context lean.
- **Add docblocks** to every new or doc-missing function touched during the work.
