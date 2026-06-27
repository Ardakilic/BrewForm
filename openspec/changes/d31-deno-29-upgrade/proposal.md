## Why

BrewForm pins **Deno 2.7.14** across its build surfaces (5× Docker `FROM denoland/deno:debian-2.7.14`, 6× `setup-deno deno-version: v2.7.14` in CI), while local development has drifted ahead to 2.8.3. Deno **2.9.0** shipped on 2026-06-25 (the first and currently only 2.9 release — there is no 2.9.x patch yet), ending support for the 2.8 line. We want to:

1. **Pin Deno 2.9.0** in every build surface (both Dockerfiles, both CI workflows) and regenerate the lockfile, so the runtime is current, supported, and reproducible — and so CI, Docker, and local dev finally agree on one version.
2. **Adopt the Deno workspace-management features** introduced in 2.8 and confirmed-valid in 2.9, prototyped in the (now-superseded) PR #54: a root **catalog** for the three npm dependencies duplicated across members (`drizzle-orm`, `bcryptjs`, `zod`), per-member `version` fields, `bump:*` tasks (`deno bump-version`), the `deno ci` clean-install command in CI/Docker, and re-enabled test sanitizers.

This change **supersedes PR #54** (`feat/workspace-management`, branch `feat/workspace-management`, target Deno 2.8.1). That branch predates `d28`/`d29`/`d30` and is now significantly behind `main` (d30 restructured the Docker runner with an entrypoint, added `release.yml`/GHCR publishing, and a compose `prod` profile). Rebasing it would be painful and would land an already-superseded 2.8.1; a single clean jump **2.7.14 → 2.9.0** off current `main`, folding in PR #54's good ideas, is the correct path. PR #54 should be closed once this lands.

> **Note — the workspace itself is NOT being created here.** Native Deno workspaces already exist on `main` (landed by `#27 — Migrate from Turborepo to native Deno workspaces`): the root `deno.json` has `workspace: { members: ["apps/*", "packages/*"] }`, all four members have `name`/`exports`, and there are 174 active cross-member `@brewform/*` bare imports. This change adds the workspace **management features** layered on top of that existing structure; it does not migrate the workspace.

## What Changes

- **Bump Deno to 2.9.0 in both Dockerfiles** — `Dockerfile` (3 stages: `deps`, `builder`, `runner`) and `Dockerfile.web` (2 stages: `deps`, `builder`): `FROM denoland/deno:debian-2.7.14` → `FROM denoland/deno:debian-2.9.0` (5 tags total).
- **Bump Deno to 2.9.0 in both CI workflows** — `.github/workflows/ci.yml` (2 jobs: `quality`, `test`) and `.github/workflows/pr.yml` (4 jobs: `check`, `test-unit`, `test-api`, `test-web`): `denoland/setup-deno@v2` `deno-version: v2.7.14` → `deno-version: v2.9.0` (6 pins total). This fixes the staleness PR #54 shipped (it bumped Docker to 2.8.1 but left CI on 2.7.14).
- **Refresh `deno.lock`** — a **non-destructive** `deno install` from the root on 2.9.0, AFTER the catalog edits (NOT `rm deno.lock && deno install`, which floats every `^`/`*` range to latest-in-range and would upgrade ~15 deps — a violation of the no-upgrades Non-Goal). The lockfile format stays version `"5"` (2.9 does not bump it). **Verified outcome: the lock is byte-identical to pre-d31** — the workspace section records resolved specifiers (`npm:drizzle-orm@0.45`), invariant to the `catalog:` indirection (the catalog maps to the identical range), so no resolved version changes. `deno ci` (frozen) installs cleanly from it on 2.9.0.
- **Add a root `catalog`** to `deno.json` for the three duplicated npm deps, and reference it from member `package.json` files:
  - root `deno.json`: `"catalog": { "drizzle-orm": "^0.45.0", "bcryptjs": "^3.0.0", "zod": "^4.0.0" }`
  - `apps/api/package.json`: `drizzle-orm`, `zod`, `bcryptjs` → `"catalog:"`
  - `packages/db/package.json`: `drizzle-orm`, `bcryptjs` → `"catalog:"`
  - `packages/shared/package.json`: `zod` → `"catalog:"`
  - JSR deps (`@std/testing`, `@std/expect`) stay as explicit `jsr:` specifiers — catalog cannot carry a registry prefix.
- **Add `version: "0.1.0"` to the four member `deno.json` files** (`apps/api`, `apps/web`, `packages/shared`, `packages/db`) so `deno bump-version` can manage them.
- **Add `bump:*` tasks** to root `deno.json`: `bump:dry-run` (`deno bump-version --base=main --dry-run`), `bump:patch` (`deno bump-version patch`), `bump:minor` (`deno bump-version minor`).
- **Re-enable test sanitizers** in root `deno.json`: `"test": { ..., "sanitizeOps": true, "sanitizeResources": true }`. In 2.8+ these default to OFF; the explicit block opts back in (confirmed honored in 2.9).
- **Swap `deno install[ --frozen]` → `deno ci`** in CI (`ci.yml`, `pr.yml`) and the Docker `deps` stages. The Makefile keeps `deno install --frozen` for local dev. `deno ci` is a frozen, lockfile-strict install (`rm -rf node_modules && deno install --frozen`) purpose-built for CI.
- ~~**Slim the API runner stage with `deno ci --prod`**~~ — **EVALUATED AND REJECTED during apply.** The `--prod` runner was built and boot-tested (gate passed: migrate→seed→start→`/health` 200), but `deno ci --prod` does **not** prune devDependencies for this workspace on 2.9.0 (node_modules stayed 347 MB with `drizzle-kit`/`mjml`/`vite`/`vitest` present), so its headline mechanism is a no-op while it adds Dockerfile complexity + a slower second install. (The `--prod` image was incidentally ~110 MB smaller from the selective source copy, not from `--prod`; runtime npm-egress at boot turned out to be pre-existing in d30 too, not a `--prod` regression.) **The runner is kept as d30's `COPY --from=builder /app .` form** (version-pin only). See `design.md` Decision 7 verified outcome.
- **Bump version prose** in docs and Serena memories — `README.md` ("Runtime | Deno 2.7"), `.serena/memories/tech_stack.md`, and `docs/requirements-audit-report.md` ("Deno 2.7.13") → 2.9.
- **Add a workspace-integrity test** — `packages/shared/src/workspace.test.ts` asserting every member declares `name` + `version`, the catalog is internally consistent, and cross-member bare-specifier resolution holds.

## Capabilities

### New Capabilities

- `deno-runtime`: The Deno runtime version is pinned to **2.9.0** in every build surface (both Dockerfiles, both CI workflows), the single root `deno.lock` (format `"5"`) is regenerated and frozen-installable via `deno ci`, and version prose in docs/memories reflects 2.9. CI, Docker, and the documented dev runtime agree on one version.
- `deno-workspace-management`: The hybrid Deno+npm workspace centralizes shared dependency versions via a root `catalog` (members reference `"catalog:"`), declares a `version` on each member for `deno bump-version`, exposes `bump:*` tasks, installs via `deno ci` (frozen) in CI/Docker with an optional `deno ci --prod` runtime image, and re-enables op/resource test sanitizers.

### Modified Capabilities

None as formal main specs. This change **touches** files owned by `d30`'s `container-deployment` (`Dockerfile`, `Dockerfile.web`) and `ci-image-publishing` (`ci.yml` install command; `release.yml` is unaffected — it uses Docker base images, not `setup-deno`) capabilities, but those d30 specs are not yet synced into `openspec/specs/`. The changes here are additive (version pin, install-command swap) and do not alter d30's deployment behavior, entrypoint logic, or image topology.

## Impact

- **Dockerfile**: 3× `FROM` → 2.9.0; `deps` stage `deno install --frozen` → `deno ci`. **Runner stage unchanged** (the `deno ci --prod` slim was evaluated and rejected — see above). Entrypoint, `EXPOSE`, `--unstable-cron`/`--unstable-kv` flags unchanged.
- **Dockerfile.web**: 2× `FROM` → 2.9.0; `deps` stage `deno install --frozen` → `deno ci`. Caddy runner stage unchanged.
- **.github/workflows/ci.yml**: 2× `deno-version: v2.9.0`; `deno install` → `deno ci`.
- **.github/workflows/pr.yml**: 4× `deno-version: v2.9.0`; `deno install --frozen` → `deno ci`.
- **.github/workflows/release.yml**: no change (no `setup-deno`; Deno version flows from the Docker base images).
- **deno.json (root)**: `+ catalog`, `+ bump:*` tasks, `+ test.sanitizeOps/sanitizeResources`.
- **deno.lock**: refreshed via non-destructive `deno install` on 2.9.0 (stays `"5"`; **byte-identical** — resolved specifiers unchanged by the catalog indirection).
- **apps/api/package.json, packages/db/package.json, packages/shared/package.json**: shared deps → `"catalog:"`.
- **apps/api/deno.json, apps/web/deno.json, packages/shared/deno.json, packages/db/deno.json**: `+ version: "0.1.0"` (the `deploy.install: "deno install"` blocks in the api/web configs are Deno Deploy config and are left untouched).
- **packages/shared/src/workspace.test.ts**: new workspace-integrity test.
- **README.md, .serena/memories/tech_stack.md, docs/requirements-audit-report.md**: version prose → 2.9.
- **Makefile**: unchanged (stays `deno install --frozen` for local dev; all targets run Deno inside the Docker image, so they inherit 2.9.0 from the bumped base image).
- **No application logic changes** — no source behavior changes; the only `.ts` additions are the workspace test (and docblocks on any helper it introduces).
- **No database schema changes.**

## Non-Goals

- **Creating or restructuring the workspace** — it already exists (`#27`); this only adds management features on top.
- **No `.npmrc` / `min-release-age` config** — confirmed a no-op for this migration: `deno ci` (CI + Docker) does no resolution so the age gate never applies; the one lockfile-regen step resolves only to already->24h-old stable versions. The 2.9 default (24h) stays in force and is the safe choice. (See `design.md` for the full reasoning.)
- **No `.dvmrc` / `.tool-versions`** — a third copy of the version string to keep in sync; the version lives in the two surfaces that consume it (Docker base tags, CI `setup-deno`). Local dev is upgraded by the contributor (you) to 2.9.0 by hand.
- **No dependency version upgrades** — dependency ranges are unchanged; this is a runtime bump plus workspace hygiene, not a dependency refresh. The catalog records the *existing* ranges.
- **No adoption of unrelated Deno 2.9 features** — `deno desktop`, `Deno.test.each`, `deno watch`, post-quantum WebCrypto, etc. are out of scope.
- **No change to d30's deployment story** — `release.yml`, GHCR publishing, the compose `prod` profile, the entrypoint, and the `denokv` sidecar are untouched except for the Deno base-image version and the gated runner `--prod` slim.
