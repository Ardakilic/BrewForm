## Why

This is a **debt-cleaning** change: bring every workspace dependency to its latest **stable**
version. The Renovate "Dependency Dashboard" (issue #8) lists ~14 in-range refreshes plus two open
major PRs (`react-router` v7→v8 PR #87; `zod-openapi` v5→v6 PR #95). The preceding change `d31`
pinned Deno 2.9.0 and added the workspace **catalog** but deliberately deferred this — its Non-Goal:
*"No dependency version upgrades… the catalog records the EXISTING ranges."* **This change is that
deferred follow-up**, scoped to bring everything current in one pass.

Authoritative versions were confirmed against the npm registry, JSR, and upstream release pages on
2026-06-27 (see the target table in `tasks.md` and the audit in `design.md`). Three findings shape
the scope:

1. **The two majors are low-risk for this codebase** (Context7 + published artifacts):
   - **`react-router` v8** — the web app imports only from `react-router` (never `react-router-dom`),
     and uses **zero** `json()`/`defer()` helpers. v8.0.1 still re-exports `RouterProvider`,
     `createMemoryRouter`, `createBrowserRouter`, and all hooks/types from the main entry. The one
     hard requirement is React's peer floor (`>=19.2.7`). Per request, `RouterProvider` imports also
     move to the v8-preferred `react-router/dom` subpath.
   - **`zod-openapi` v6** — it **is** used, but **transitively**: our plain Zod schemas flow through
     `hono-openapi`'s `resolver()`/`describeRoute()`, which calls `toOpenAPISchema()`, which routes
     to `@standard-community/standard-openapi`, which dynamically imports `zod-openapi`'s
     `createSchema()` to convert each schema. v6's only runtime breaking change (`createDocument()` →
     OAS 3.2.0) is **never on this path** — `createDocument()` is not called, and `hono-openapi`
     hard-sets the document's `openapi: "3.1.0"`. v6 otherwise just drops Zod 3 / Node 20 (we run Zod
     4.4.3 + Deno 2.9). So the OpenAPI generation is unchanged; `openapi.coverage.test.ts` is the
     regression net.

2. **`drizzle-kit` latest stable is `0.31.10`** (the `1.0.0` line is `beta`/`rc` — pre-release, and
   excluded from a *stability* cleanup). The `@0.31` minor-line pin already resolves to `0.31.10`,
   so drizzle-kit updates via the lockfile refresh **without any pin-string change** across the
   Makefile, `packages/db/deno.json` tasks, the entrypoint, or the deployment guide. The
   `deployment-guide` spec deliberately pins the `0.31` *line* (not a patch), so it stays correct.

3. **All infrastructure is already at latest** — denokv `0.14.0`, caddy `2.11.4-alpine`,
   postgres `18`, garage `v2.3.0`, and every GitHub Action (checkout v7, setup-deno v2,
   upload-artifact v7, docker actions v4/v7) are the current stable majors (d30–d32 modernized the
   deploy surface). No infra bumps are warranted.

**Net deployment impact: none.** Every version the Coolify plan and `deployment-guide` spec pin is
already latest, so `coolify_deployment_plan.md` needs no edits — verified per-reference, not assumed
(see `design.md` §"Deployment audit").

## What Changes

- **Refresh `deno.lock`** to the latest stable of every workspace dependency, and **bump every `^`
  floor** in the member manifests and the root catalog to the resolved latest, so manifests are
  current — not just the lock. `tasks.md` carries the exact per-file `current → latest → new-floor`
  table (e.g. `hono ^4.7.0 → ^4.12.27`, `zod ^4.0.0 → ^4.4.3`, `drizzle-orm ^0.45.0 → ^0.45.2`,
  `postgres ^3.4.5 → ^3.4.9`, `mjml ^5.0.0 → ^5.3.0`, `vite ^8.0.0 → ^8.1.0`, `vitest ^4.0.0 →
  ^4.1.9`, `tailwindcss ^4.1.0 → ^4.3.1`, `fast-check ^4.0.0 → ^4.8.0`, `jsdom ^29.0.0 → ^29.1.1`,
  `@testing-library/jest-dom ^6.6.3 → ^6.9.1`, `drizzle-kit ^0.31.0 → ^0.31.10`, …). Deps already at
  latest (`qrcode`, `@hono/zod-validator`, `@deno/vite-plugin`, `@resvg/resvg-js`,
  `@testing-library/user-event`, `@std/expect`) are left unchanged.
- **Adopt `react-router` v8** — `react-router ^7.5.0 → ^8.0.0`; raise `react`/`react-dom` floor to
  `^19.2.7` (v8 peer). Split `RouterProvider` imports to `react-router/dom` in the production
  provider (`apps/web/src/App.tsx`) and every test file that imports it (re-grep at apply); hooks,
  `createBrowserRouter`, `createMemoryRouter`, `MemoryRouter`, and `LoaderFunctionArgs` stay on
  `react-router`.
- **Adopt `zod-openapi` v6** — `zod-openapi ^5.0.0 → ^6.0.0` in `packages/shared/package.json`;
  refresh the two `packages/shared/src` doc-comments and `AGENTS.md:71` that say "v5" → "v6"
  (re-verify the `zod-openapi/extend` guidance still holds in v6; re-word, don't delete).
- **`drizzle-kit` → `^0.31.10`** (latest stable, stays on the `0.31` line) — lockfile + the
  `packages/db/package.json` floor only; the `@0.31` task/Makefile/entrypoint pins already resolve
  to `0.31.10` and stay byte-identical. The `1.0.0` RC is explicitly out of scope (pre-release).
- **Extend the workspace-integrity test** (`packages/shared/src/workspace.test.ts`, the d31 artifact)
  with currency assertions (no `^` floor below its lock resolution; `react-router` floor `^8.x`,
  `zod-openapi` floor `^6.x`). Add docblocks to any new helper.
- **Run the full gate** — `deno fmt --check`, `deno lint`, `deno check`, `deno task build`,
  `deno task test-coverage`, `deno task test:db`, web `vitest`, and a frozen `deno ci`. Rebuild the
  local dev `app` image after the lock change (it goes stale after a dependency bump).
- **Verify (no edits expected)** that the deployment surface — `coolify_deployment_plan.md`,
  `deployment-guide` spec, Dockerfiles, `compose.yml`, `release.yml`, CI workflows — stays
  byte-unchanged, because every version it pins is already latest.

## Capabilities

### New Capabilities

- `dependency-management`: Workspace dependencies are kept at their latest **stable** versions —
  manifest `^` floors and the single `deno.lock` reflect each dependency's latest release; the
  lockfile is frozen-installable via `deno ci`; the web router runs `react-router` v8 (imports from
  `react-router` + `react-router/dom`); the API's OpenAPI layer runs `zod-openapi` v6 (transitively,
  via the hono-openapi → standard-openapi → `createSchema` pipeline, output unchanged at OpenAPI
  3.1.0); `drizzle-kit` tracks the latest stable `0.31` line (the `1.0` RC is excluded); the
  deployment surface's pins are audited current and decoupled from app-dependency bumps; and a
  workspace test guards manifest/catalog/lock currency.

### Modified Capabilities

None requiring a formal delta. This change **touches** files owned by d31's
`deno-workspace-management` (the catalog ranges and member manifests) — but d31's catalog requirement
governs *centralization* (members still reference `"catalog:"`), which is preserved; only the
recorded version values move forward. The `deployment-guide` spec was audited reference-by-reference
(`drizzle-kit@0.31`, Deno 2.9.0, `caddy:2.11.4-alpine`, `denokv:0.14.0`, `postgres:18`) and **every
pin is already latest**, so it needs no delta and the Coolify plan needs no edits.

## Impact

- **`deno.lock`**: refreshed to latest stable for all workspace deps (format stays `"5"`). The two
  majors' resolved entries move (`react-router@7.15.1 → 8.0.1`, `zod-openapi@5.4.6 → 6.0.0`) with
  their peer-hash lines; `drizzle-kit@0.31.x → 0.31.10`, etc.
- **Member manifests** (`apps/api`, `apps/web`, `packages/shared`, `packages/db` `package.json`) and
  **root `deno.json` catalog** + **root `package.json`**: `^` floors bumped to latest per the table.
- **`apps/web/src/App.tsx`** + the web routing test files: `RouterProvider` import → `react-router/dom`.
- **`packages/shared/src/schemas/response.ts`** (≈L9–10), **`.../responses/_shared.ts`** (≈L7–9),
  **`AGENTS.md:71`**: doc-comment "zod-openapi v5" → "v6".
- **`packages/shared/src/workspace.test.ts`**: extended with currency assertions (+ docblocks).
- **No application logic changes** — OpenAPI document stays OpenAPI 3.1.0; web build output
  (Vite → `dist/` → Caddy) unchanged.
- **No database schema changes.**
- **No deployment changes** — `coolify_deployment_plan.md`, `deployment-guide` spec, Dockerfiles,
  `compose.yml`, `release.yml`, `ci.yml`, `pr.yml` are untouched (their pins are already latest).

## Non-Goals

- **`drizzle-kit` 1.0** — the `1.0.0` line is `beta`/`rc` (pre-release). A stability/debt cleanup
  tracks latest *stable* (`0.31.10`); adopting an RC of the migration tool is explicitly excluded.
- **Infrastructure image bumps** — denokv `0.14.0`, caddy `2.11.4-alpine`, postgres `18`, garage
  `v2.3.0` were audited (2026-06-27) and are already the latest stable; `:latest` sidecars
  (mailpit/pgadmin/serena) float. Nothing to bump.
- **GitHub Actions bumps** — checkout v7, setup-deno v2, upload-artifact v7, docker actions v4/v7 are
  already the latest majors. Nothing to bump.
- **Deno runtime change** — stays 2.9.0 (owned by d31; current). This is a dependency refresh.
- **Coolify deployment-plan edits** — verified unnecessary (all pinned versions already latest). If a
  future infra bump *does* move a pinned version, that belongs to a deployment-focused change.
- **No new features, no API contract changes, no schema changes.**
