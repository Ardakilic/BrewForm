# Tasks — d33 Dependency Refresh

> **Apply-phase directives (from the request):** use **Serena MCP** for all semantic code retrieval
> and source edits; use **Context7 MCP** to re-confirm any library API before editing; **delegate**
> independent units to sub-agents to keep context lean; **add docblocks** to every new or doc-missing
> function you touch. **Re-verify the target versions against the live registry / resolved `deno.lock`
> at apply** — the table below was frozen 2026-06-27 and a patch may have shipped since. Bump to the
> newest stable, never to a `beta`/`rc`.

## Exact target table (current floor → latest stable → new floor)

Targets confirmed against npm `latest` / JSR / upstream on 2026-06-27. "—" = already latest, leave as-is.

### Root `deno.json` `catalog`
| Dep | Current | Latest | New floor |
|---|---|---|---|
| drizzle-orm | ^0.45.0 | 0.45.2 | **^0.45.2** |
| bcryptjs | ^3.0.0 | 3.0.3 | **^3.0.3** |
| zod | ^4.0.0 | 4.4.3 | **^4.4.3** |

### Root `package.json`
| Dep | Current | Latest | New floor |
|---|---|---|---|
| @resvg/resvg-js | ^2.6.2 | 2.6.2 | — |

### `apps/api/package.json`
| Dep | Current | Latest | New floor |
|---|---|---|---|
| hono | ^4.7.0 | 4.12.27 | **^4.12.27** |
| @hono/zod-validator | ^0.8.0 | 0.8.0 | — |
| @hono/standard-validator | ^0.2.0 | 0.2.2 | **^0.2.2** |
| hono-openapi | ^1.0.0 | 1.3.0 | **^1.3.0** |
| pino | ^10.0.0 | 10.3.1 | **^10.3.1** |
| pino-pretty | ^13.0.0 | 13.1.3 | **^13.1.3** |
| qrcode | ^1.5.4 | 1.5.4 | — |
| nodemailer | ^9.0.0 | 9.0.1 | **^9.0.1** |
| mjml (dev) | ^5.0.0 | 5.3.0 | **^5.3.0** |
| @types/qrcode (dev) | ^1.5.5 | 1.5.6 | **^1.5.6** |
| @types/nodemailer (dev) | ^8.0.0 | 8.0.1 | **^8.0.1** |
| @std/testing (dev, jsr) | ^1.0.18 | 1.0.19 | **^1.0.19** |
| @std/expect (dev, jsr) | ^1.0.19 | 1.0.19 | — |
| drizzle-orm, zod, bcryptjs | catalog: | — | (via catalog) |

### `apps/web/package.json`
| Dep | Current | Latest | New floor |
|---|---|---|---|
| react | ^19.1.0 | 19.2.7 | **^19.2.7** (RR v8 peer ≥19.2.7) |
| react-dom | ^19.1.0 | 19.2.7 | **^19.2.7** |
| react-router | ^7.5.0 | 8.0.1 | **^8.0.0** (MAJOR — Decision 2) |
| @base-ui/react | ^1.0.0 | 1.6.0 | **^1.6.0** |
| vite (dev) | ^8.0.0 | 8.1.0 | **^8.1.0** |
| @deno/vite-plugin (dev) | ^2.0.0 | 2.0.2 | — |
| @vitejs/plugin-react (dev) | ^6.0.0 | 6.0.3 | **^6.0.3** |
| tailwindcss (dev) | ^4.1.0 | 4.3.1 | **^4.3.1** |
| @tailwindcss/vite (dev) | ^4.1.0 | 4.3.1 | **^4.3.1** |
| typescript (dev) | ^6.0.0 | 6.0.3 | **^6.0.3** |
| @types/react (dev) | ^19.1.0 | 19.2.17 | **^19.2.17** |
| @types/react-dom (dev) | ^19.1.0 | 19.2.3 | **^19.2.3** |
| vitest (dev) | ^4.0.0 | 4.1.9 | **^4.1.9** |
| @vitest/coverage-v8 (dev) | ^4.0.0 | 4.1.9 | **^4.1.9** |
| @testing-library/react (dev) | ^16.3.0 | 16.3.2 | **^16.3.2** |
| @testing-library/user-event (dev) | ^14.6.1 | 14.6.1 | — |
| @testing-library/jest-dom (dev) | ^6.6.3 | 6.9.1 | **^6.9.1** |
| jsdom (dev) | ^29.0.0 | 29.1.1 | **^29.1.1** |
| fast-check (dev) | ^4.0.0 | 4.8.0 | **^4.8.0** |

### `packages/shared/package.json`
| Dep | Current | Latest | New floor |
|---|---|---|---|
| zod | catalog: | — | (via catalog) |
| zod-openapi | ^5.0.0 | 6.0.0 | **^6.0.0** (MAJOR — Decision 3) |

### `packages/db/package.json`
| Dep | Current | Latest | New floor |
|---|---|---|---|
| postgres | ^3.4.5 | 3.4.9 | **^3.4.9** |
| drizzle-kit (dev) | ^0.31.0 | 0.31.10 (1.0=RC) | **^0.31.10** (stays 0.31 line) |
| @std/testing (dev, jsr) | ^1.0.18 | 1.0.19 | **^1.0.19** |
| @std/expect (dev, jsr) | ^1.0.19 | 1.0.19 | — |
| drizzle-orm, bcryptjs | catalog: | — | (via catalog) |

## 1. Refresh the lockfile and bump every floor

- [x] 1.1 From a clean tree, run `deno outdated` (root) and capture the full list as ground truth.
- [x] 1.2 Apply: `deno outdated --update --latest`. Inspect the diff — confirm it bumped manifest
      floors AND the lock, matching the table above (re-check each against live `latest`).
- [x] 1.3 Hand-edit what `deno outdated` does not touch: the root `deno.json` `catalog`
      (`drizzle-orm ^0.45.2`, `bcryptjs ^3.0.3`, `zod ^4.4.3`) and the JSR `jsr:@std/testing@^1.0.19`
      specifiers in `apps/api` / `packages/db`. Then `deno install` to re-resolve.
- [x] 1.4 Reconcile floors to the table for every member manifest + root `package.json`. Leave the
      "—" rows untouched (already latest).
- [x] 1.5 **drizzle-kit:** set `packages/db/package.json` `drizzle-kit ^0.31.0 → ^0.31.10`. Do NOT
      adopt `1.0.0-rc/beta`. Confirm the `npm:drizzle-kit@0.31` pins in `packages/db/deno.json` (5
      tasks), `Makefile` (`DRIZZLE_KIT`), `docker-entrypoint.sh`, and the Dockerfile builder are
      **unchanged** (they resolve to 0.31.10 already).
- [x] 1.6 `deno ci` from a clean tree — prove the refreshed lock is frozen-installable.

## 2. Adopt react-router v8 (apps/web)

- [x] 2.1 `react-router ^7.5.0 → ^8.0.0`; `react`/`react-dom → ^19.2.7`; `@types/react → ^19.2.17`,
      `@types/react-dom → ^19.2.3`.
- [x] 2.2 `grep -rl "RouterProvider" apps/web/src` to get the live file set. In each, split the
      import so `RouterProvider` comes from `react-router/dom` and the rest
      (`createBrowserRouter`, `createMemoryRouter`, `MemoryRouter`, hooks, `LoaderFunctionArgs`) stays
      on `react-router`. Use Serena symbol-aware edits. (At authoring: `App.tsx` + ~10 test files.)
- [x] 2.3 Confirm no source imports `json`/`defer` from `react-router`, and no `react-router-dom`
      package was introduced.
- [x] 2.4 `deno task --cwd apps/web test` + `deno task build:web` — all routing tests + Vite build
      pass on v8.

## 3. Adopt zod-openapi v6 (packages/shared)

- [x] 3.1 `zod-openapi ^5.0.0 → ^6.0.0` in `packages/shared/package.json`; `deno install`.
- [x] 3.2 Via Context7, re-verify the `zod-openapi/extend` subpath guidance still holds in v6, then
      refresh "v5" → "v6" in `packages/shared/src/schemas/response.ts` (≈L9–10),
      `packages/shared/src/schemas/responses/_shared.ts` (≈L7–9), and `AGENTS.md:71`.
- [x] 3.3 Run `apps/api/src/routes/openapi.coverage.test.ts` + `openapi.test.ts`: confirm doc still
      reports `openapi: "3.1.0"`, every path schema resolves, no `{vendor:'zod'}` stub leaks.
- [x] 3.4 Confirm `hono-openapi` was NOT bumped (it is agnostic to the zod-openapi major) — it stays
      at its latest `^1.3.0` only via the routine refresh, not because of zod-openapi.

## 4. Tests, docblocks, currency guard

- [x] 4.1 Extend `packages/shared/src/workspace.test.ts`: assert no member `^` floor is below its
      `deno.lock`-resolved version; assert `react-router` floor `^8.x` and `zod-openapi` floor `^6.x`.
      Assert by major; resolve paths from `import.meta.url`.
- [x] 4.2 Docblock any new helper added to the test (purpose/params/return), matching the existing
      `readJson` convention.
- [x] 4.3 Add docblocks to any other new or doc-missing function touched during the migration.
- [x] 4.4 `deno task test:shared` — extended workspace test passes.

## 5. Verify the deployment surface is unaffected (no edits expected)

- [x] 5.1 Confirm every deploy-pinned version is still latest and matches the codebase: Deno 2.9.0,
      `drizzle-kit@0.31` (→0.31.10), `denokv:0.14.0`, `caddy:2.11.4-alpine`, `postgres:18`,
      `--unstable-cron`/`-kv`, `OPENAPI_ENABLED`. Confirm `mjml 5.3.0` `email-build` still compiles
      templates unchanged.
- [x] 5.2 Diff-check that `coolify_deployment_plan.md`, `openspec/specs/deployment-guide/spec.md`,
      `Dockerfile`, `Dockerfile.web`, `compose.yml`, `release.yml`, `ci.yml`, `pr.yml` are
      byte-unchanged. (If a registry re-check in 5.1 surfaced a NEW infra release, that is a separate
      deployment change — do not fold it in here; note it for follow-up.)

## 6. Full gate + dev image

- [x] 6.1 `docker compose build app` — rebuild the dev image after the lock change.
- [x] 6.2 Full gate: `deno fmt --check`, `deno lint`, `deno check`, `deno task build`,
      `deno task test-coverage`, `deno task test:db`, `deno task --cwd apps/web test`. All green.
- [x] 6.3 `deno ci` once more from clean to confirm reproducibility post-edits.

## 7. Finalize

- [x] 7.1 `openspec validate d33-dependency-refresh --strict` passes.
- [x] 7.2 Update README / Serena-memory prose ONLY if it states a now-changed dependency version
      (the Deno 2.9 / drizzle-kit 0.31 / caddy 2.11.4 prose is unchanged — leave it).
- [x] 7.3 Open the PR; reference issue #8; note it closes Renovate PRs #87 (react-router v8) and #95
      (zod-openapi v6) and supersedes the per-dep lockfile PRs listed on the dashboard.
