## Context

BrewForm is a hybrid Deno + npm monorepo using **native Deno workspaces** (already on `main` via `#27`). Verified current state:

- **Workspace** — root `deno.json` has `"workspace": { "members": ["apps/*", "packages/*"] }`; four members (`apps/api` `@brewform/api`, `apps/web` `@brewform/web`, `packages/shared` `@brewform/shared`, `packages/db` `@brewform/db`), each with `name`/`exports` in `deno.json`. **174** cross-member `@brewform/*` bare imports resolve through it — the workspace is live, not aspirational.
- **Dependency model is hybrid** — member dependencies live in member **`package.json`** files (npm-style), with `nodeModulesDir: "auto"`. The root `deno.json` has **no** `imports` map. `deno.json` carries tasks/exports/config; `package.json` carries dependencies.
- **Deno version pins** (the only two source-of-truth surfaces):
  - `Dockerfile` — 3× `FROM denoland/deno:debian-2.7.14` (`deps`, `builder`, `runner`).
  - `Dockerfile.web` — 2× `FROM denoland/deno:debian-2.7.14` (`deps`, `builder`).
  - `.github/workflows/ci.yml` — 2× `setup-deno deno-version: v2.7.14`.
  - `.github/workflows/pr.yml` — 4× `setup-deno deno-version: v2.7.14`.
  - Local dev: 2.8.3 (drifted ahead). `Makefile` has NO pin (runs Deno inside the Docker image → inherits the base tag). `compose.yml` services inherit from the Dockerfile.
- **d30 is merged** (`8a07857`). The current `Dockerfile` `runner` stage is already entrypoint-based:
  ```dockerfile
  FROM denoland/deno:debian-2.7.14 AS runner
  WORKDIR /app
  COPY --from=builder /deno-dir /deno-dir
  COPY --from=builder /app .
  COPY docker-entrypoint.sh /app/docker-entrypoint.sh
  RUN chmod +x /app/docker-entrypoint.sh
  EXPOSE 8000
  ENTRYPOINT ["/app/docker-entrypoint.sh"]
  ```
  The entrypoint (`docker-entrypoint.sh`) runs `cd /app/packages/db && deno run -A npm:drizzle-kit@0.31 migrate`, a first-boot seed check (`scripts/check-users-empty.ts`), then `exec deno run … apps/api/src/main.ts`. `drizzle-kit` is a **devDependency** of `packages/db` but is invoked at runtime via the `npm:drizzle-kit@0.31` specifier, resolved from the `/deno-dir` cache copied from the builder (line `COPY --from=builder /deno-dir /deno-dir`) — **not** from `node_modules`.

**Reference: PR #54** (`feat/workspace-management`, target 2.8.1) prototyped the workspace-management features (catalog, member versions, `bump:*` tasks, `deno ci`, runner `deno ci --prod`, sanitizers). It is now behind `main` (predates d28/d29/d30) and targets a superseded version. This change folds in its good parts off current `main` and the PR should be closed once this lands.

**Deno 2.9 facts** (verified via Context7 `/denoland/docs`, deno.com/blog/v2.9, the v2.9.0 GitHub release, endoflife.date, and the local 2.8.3 binary's `--help`):

- **2.9.0 is the only 2.9 release** (2026-06-25). "2.9.x" = `2.9.0` today. Docker tags (`debian-2.9.0` etc.) publish ~2h after release, so they exist now. `setup-deno@v2` accepts an exact `v2.9.0` pin.
- **`deno.lock` format stays `"5"`** in 2.9 (no bump). 2.9 also auto-resolves git merge conflicts in the lockfile and can seed `deno.lock` from `package-lock`/`pnpm-lock`/`yarn.lock`/`bun.lock` — **inert for us** (we have only `package.json` files, no npm/pnpm/yarn/bun lock).
- **`deno ci` and `deno ci --prod` are real** (added 2.8) — confirmed from the local 2.8.3 binary: `deno ci` = "Install dependencies in a clean, reproducible way for CI… like npm ci: requires a deno.lock, removes node_modules, installs strictly from the lockfile"; `--prod` = "Only install production dependencies (excludes devDependencies)". `deno bump-version` is also real ("Update version in the configuration file").
- **Test sanitizers** (`sanitizeOps`/`sanitizeResources`) default to **OFF** since 2.8 (PR #33250); 2.9 did not change this; the `deno.json` `test` block re-enabling them is still the honored mechanism.
- **`min-release-age`** defaults to **24h** in 2.9 (npm "minimum dependency age" supply-chain gate). It acts at **resolution time only** — it gates `deno install` / lockfile generation, **not** `deno ci` (frozen, no resolution).
- **`Deno.serve` automatic compression is OFF by default** in 2.9 (breaking change). The API calls `Deno.serve` directly at `apps/api/src/main.ts:141-142`.
- **`deno fmt` now formats HTML/XML/SVG by default** (no flag) and uses the `lax-css` CSS formatter (breaking change). The repo's `fmt` scope (`apps/`, `packages/`) contains four newly-affected files: `apps/web/index.html`, `apps/web/public/404.html`, `apps/web/public/favicon.svg`, `apps/web/src/styles/globals.css` — so `deno fmt --check` in CI will fail unless the 2.9 reformat is committed (or the files excluded).

## Goals / Non-Goals

**Goals:**
- One reproducible Deno version (2.9.0) across both Dockerfiles and both CI workflows; CI/Docker/dev aligned.
- A single regenerated root `deno.lock` that `deno ci` installs cleanly from on 2.9.0.
- Centralized versions for the three duplicated npm deps (no more drift between `apps/api` and `packages/db`/`packages/shared`).
- Member `version` fields + `bump:*` tasks wired for `deno bump-version`.
- Re-enabled op/resource test sanitizers for stricter test hygiene.
- Existing test suites (api + shared + db + web/vitest) green on 2.9.0, plus a workspace-integrity test.
- Keep d30's deployment behavior (entrypoint, GHCR publish, compose profiles, denokv) intact.

**Non-Goals:**
- Creating/restructuring the workspace (already exists via `#27`).
- `.npmrc`, `.dvmrc`/`.tool-versions` (both decided out — see Decisions 4 and 5).
- Upgrading any dependency version (ranges unchanged; catalog records existing ranges).
- Adopting unrelated 2.9 features (`deno desktop`, `Deno.test.each`, `deno watch`, PQ WebCrypto, etc.).
- Changing `release.yml`, the entrypoint, the denokv sidecar, or the compose `prod` profile (except the Deno base version and the gated runner `--prod`).

## Decisions

### 1. Supersede PR #54; single jump 2.7.14 → 2.9.0 off current `main`

**Choice:** Author this as a fresh change off `main`, fold in PR #54's good parts, and close PR #54.

**Rationale:**
- PR #54 targets 2.8.1 (already superseded by 2.9.0) and its branch predates d28/d29/d30. `main`'s `Dockerfile` has since been restructured by d30 (entrypoint runner, `/deno-dir` cache copy). Rebasing #54 would mean reconciling a stale runner design *and* landing an obsolete version.
- A single review of one clean diff (2.7.14 → 2.9.0) is simpler and lower-risk than merge-then-follow-up.

**Alternative considered:** Merge #54 (→2.8.1) then a follow-up to 2.9.0. Rejected — two reviews, and #54's stale runner would have to be un-restructured against d30 anyway.

### 2. Pin exact `2.9.0` in both surfaces; no floating tags

**Choice:** `denoland/deno:debian-2.9.0` (5 Docker tags) and `setup-deno deno-version: v2.9.0` (6 CI pins). Not `v2.9`, not `latest`.

**Rationale:**
- Reproducible builds — a floating `v2.9`/`latest` can change a patch under you between CI runs and image builds.
- Fixes the inconsistency PR #54 shipped (Docker 2.8.1 but CI left at v2.7.14). Here, every surface moves together to the same exact string.
- 2.9.0 is the only 2.9 release; when 2.9.1 appears, bumping is a deliberate one-line-per-surface change.

### 3. Catalog in root `deno.json`; members reference `"catalog:"` from `package.json`

**Choice:** Define the catalog in the **root `deno.json`** and reference it from member **`package.json`** `dependencies`.

```jsonc
// root deno.json
{
  "catalog": {
    "drizzle-orm": "^0.45.0",
    "bcryptjs": "^3.0.0",
    "zod": "^4.0.0"
  }
}
```
```jsonc
// apps/api/package.json   → "drizzle-orm": "catalog:", "zod": "catalog:", "bcryptjs": "catalog:"
// packages/db/package.json → "drizzle-orm": "catalog:", "bcryptjs": "catalog:"
// packages/shared/package.json → "zod": "catalog:"
```

**Rationale (verified via Context7 + blog v2.8/v2.9):**
- These three deps are duplicated across members today and can silently drift (`apps/api` and `packages/db` both pin `drizzle-orm ^0.45.0`; a future edit to one wouldn't update the other). A catalog is the single source of truth.
- Catalog is **root-only** — defining `catalog`/`catalogs` in a member emits a diagnostic. `deno.json` is the documented home (the `catalog:` protocol has no native home in plain npm `package.json`).
- `deno ci`/`deno install` resolve `"catalog:"` from member `package.json` correctly in 2.9 (same resolver path that freezes the root lockfile). 2.9 additionally allows `catalog:` inside `deno.json` `imports`, but we don't need that (deps live in `package.json`).
- **JSR deps stay explicit** — `@std/testing`, `@std/expect` keep their `jsr:@std/...@^1.x` specifiers; catalog cannot carry the `jsr:` prefix.

**Alternative considered:** catalog in root `package.json`. Rejected — Deno documents catalogs in `deno.json`; keeping it there matches the workspace-config home and the d30/repo convention of Deno-first config.

### 4. No `.npmrc` / `min-release-age` config — it is a no-op for this migration

**Choice:** Do not add an `.npmrc` and do not set `minimumDependencyAge`. Leave the 2.9 default (24h) in force.

**Rationale (verified via Context7 + blog v2.9):**
- `min-release-age` acts only at **resolution time**. It gates `deno install` / lockfile generation, never `deno ci` (which is frozen — `rm -rf node_modules && deno install --frozen`, no resolution). So **CI and Docker `deno ci` runs are unaffected** regardless of any `.npmrc`.
- The single place it could act is the one-time `rm deno.lock && deno install` regen. But our dependency ranges resolve to versions already older than 24h (the current lock is from 2026-06-25). Even if a brand-new patch had landed in the last 24h, the gate degrades gracefully — it picks the prior (>24h) version, which is exactly what we want.
- An `.npmrc` pinning `min-release-age=24h` would merely restate the default (no behavior change); `=0` would disable a free supply-chain safeguard to solve a problem we don't have; a stricter window would be a new, unrelated security policy (scope creep).

**Contingency:** if the regen ever actually stalls on a too-fresh dep we need, run that one command with `deno install --minimum-dependency-age=0`. That's a footnote on the regen step, not a committed file.

### 5. No `.dvmrc` / `.tool-versions`

**Choice:** Do not add a version-file. The Deno version lives in the two surfaces that consume it (Docker base tags, CI `setup-deno`), both pinned to `2.9.0`.

**Rationale:** A `.dvmrc` would be a third copy of the same string to keep in sync. `setup-deno` does not read the version from `deno.json`; it would read a `deno-version-file`, but adding one only to point it back at the same `2.9.0` is ceremony. Local dev is upgraded by the contributor by hand (you: 2.8.3 → 2.9.0). This matches PR #54's model, minus the CI staleness this change fixes.

### 6. `deno install[ --frozen]` → `deno ci` in CI and Docker; Makefile stays `--frozen`

**Choice:** Swap to `deno ci` in `ci.yml` (was `deno install`), `pr.yml` (was `deno install --frozen`), and the Docker `deps` stages (was `deno install --frozen`). The Makefile keeps `deno install --frozen` for local dev.

**Rationale:**
- `deno ci` is purpose-built for CI/containers: it requires `deno.lock`, wipes any existing `node_modules`, installs strictly from the lockfile, and errors if the lock is missing/outdated — exactly the determinism CI/Docker want.
- `min-release-age` never applies to it (Decision 4).
- Local dev keeps `deno install --frozen` because contributors iterate on `package.json`/lock and benefit from a non-destructive install (no `node_modules` wipe).

### 7. Slim the API runner with `deno ci --prod` — adopt, but gate on a prod-image boot test

**Choice:** Replace the `runner` stage's `COPY --from=builder /app .` with: copy the four members' `package.json`/`deno.json` manifests + the root `deno.json`/`deno.lock`, `RUN deno ci --prod`, then selectively `COPY --from=builder` only `apps/api/src`, `apps/api/scripts`, and `packages/` (sources + migration SQL + compiled email templates). Keep d30's `/deno-dir` cache copy, `docker-entrypoint.sh`, `chmod`, `EXPOSE 8000`, and `ENTRYPOINT`. **Adopt only if the boot gate passes.**

**Rationale:**
- `--prod` drops devDependencies (`mjml`, `drizzle-kit`, `@types/*`, `@std/testing`, `@std/expect`) from the runtime `node_modules`, producing a leaner image. `mjml` is build-time only (email templates are compiled in the builder and copied), so dropping it is correct.
- **The sharp edge:** the entrypoint runs `npm:drizzle-kit@0.31 migrate` at container start, and `drizzle-kit` is a devDependency. This works *only because* the entrypoint invokes it via the `npm:` specifier resolved from the `/deno-dir` cache (copied from the builder), **not** from `node_modules`. So `--prod` excluding it from `node_modules` should be harmless — but "should be" must be **proven** by building the prod image and running an actual migration + seed + boot (the `make`/compose `prod` targets exist for exactly this).

**Fallback:** if the boot gate reveals any runtime resolution failure (drizzle-kit, seed, or `--unstable-cron`/`--unstable-kv`), keep d30's current `COPY --from=builder /app .` runner (no `--prod`) and take the version bump + install-command swap only. The image is larger but unquestionably correct. The `--prod` slim is the only optional, riskiest piece — everything else stands without it.

**VERIFIED OUTCOME (during apply): fallback taken — d30's runner retained.** The `--prod` runner was built and boot-tested on 2.9.0 and the boot gate **passed** (migrate → seed-skip(7 users) → start → `GET /health` 200; `drizzle-kit migrate` resolved from the `/deno-dir` cache exactly as predicted). **But `--prod`'s stated mechanism is a no-op here:** `deno ci --prod` did **not** prune devDependencies for this hybrid Deno+npm workspace — the `--prod` image's `node_modules` was still **347M** with `drizzle-kit`, `mjml`, `vite`, `vitest`, `@vitest/*`, and `@types/*` present as resolvable symlinks. The `--prod` image was modestly smaller overall (**1.18 GB vs 1.29 GB**), but that ~110 MB came **incidentally** from the selective source `COPY` (excluding `apps/web` build output etc.), NOT from `--prod` dropping devDeps. **Correction to an in-flight hypothesis:** booting the **d30-form** image showed it ALSO re-downloads npm packages at first boot (12 `registry.npmjs.org` hits), so the runtime-egress is **pre-existing in d30, not a `--prod` regression** — offline boot is a separate pre-existing gap (out of scope). Net: `--prod` adds Dockerfile complexity + a slower second install while its headline mechanism (devDep exclusion) does nothing on 2.9.0; the incidental ~110 MB is better obtained via `.dockerignore`/not copying `apps/web` into the API runner as a separate change. So d30's `COPY --from=builder /app .` runner (version-pin only) is kept. Revisit if a future Deno makes `deno ci --prod` actually exclude workspace devDeps.

**Alternative considered:** copy `drizzle-kit` explicitly into the runner. Rejected — the `/deno-dir` cache already carries it; adding a copy is redundant if the gate passes and pointless if it doesn't.

### 8. Re-enable test sanitizers (with an enforcement-scope check and a scoped fallback)

**Choice:** Add `"sanitizeOps": true, "sanitizeResources": true` to the root `deno.json` `test`
block. Verify enforcement scope, and fall back to scoping if the api/db leak surface is large.

**Rationale:** Default is OFF since 2.8 (confirmed unchanged in 2.9). Re-enabling restores detection
of leaked async ops and resources (unclosed files/sockets/timers) — stricter hygiene that catches
real teardown bugs.

**Two nuances that must be handled (not assumptions):**
1. **Enforcement scope.** The root `test` block governs root-invoked runs (e.g. `test-coverage` =
   `deno test … apps/api/src/ packages/shared/src/`, run from the root). But the per-member tasks
   the repo actually uses — `test:api`/`test:shared`/`test:db` = `deno task --cwd <member> test` —
   execute with the **member** `deno.json` as the active config, and the members have **no** `test`
   block. Whether they inherit the root `test` sanitizer settings on 2.9.0 is **unverified** — the
   apply step must check empirically. If they do not inherit, add the sanitizer fields to each
   member `deno.json` `test` block (or append `--sanitize-ops --sanitize-resources` to the member
   `test` tasks) so sanitizers are enforced everywhere, not only in the root coverage run.
2. **Leak surface.** The api and db suites open real Postgres connections (`postgres`/drizzle) and
   may hold unclosed clients/timers, so enabling sanitizers could surface a non-trivial number of
   pre-existing leaks. Triage: close clients in `afterAll`/`afterEach`; override per-test only for
   genuine by-design leaks; never disable the global setting to silence one test.

**Scoped fallback:** if the api/db leak-fixing proves too large for this change, scope sanitizers to
`packages/shared` (pure functions, no I/O — safe) by putting the `test` sanitizer block in
`packages/shared/deno.json` only, and defer api/db sanitizers to a follow-up. This keeps the change
shippable without coupling a runtime bump to a broad test-hygiene refactor. (Accept the known
false-positive trade-off around `setTimeout`/`node:http` cleanup — the reason Deno flipped the
default — when enabling broadly.)

**VERIFIED OUTCOME (during apply, on 2.9.0):** Nuance 1 resolved — member-scoped runs (`deno task
--cwd <member> test`) **DO** inherit the root `test` sanitizer settings (a deliberate op+resource
leak probe failed under both member-scoped and root invocations). Nuance 2 resolved — the FULL suite
(db 17/17, api 89/89, shared 105/105, web/vitest 814/814) ran **green with zero sanitizer leaks**.
The `packages/db/src/index.ts` module-level singleton `postgres(…, { max: 10 })` client does NOT
trip the sanitizer: it is constructed at import time (outside any `Deno.test` case), so postgres-js's
lazy pool is never attributed to an individual test. **Global sanitizers were enabled cleanly; the
scoped fallback and any per-member blocks were NOT needed.**

### 9. Member `version` fields + `bump:*` tasks

**Choice:** Add `"version": "0.1.0"` to all four member `deno.json` files (right after `name`, NOT
touching the `deploy` blocks); add root tasks `bump:dry-run`/`bump:patch`/`bump:minor`
(`deno bump-version …`).

**Rationale:** `deno bump-version` updates the `version` field in workspace member configs; it needs
a `version` to bump. These members are not published (`deno publish`), so the versions are
workspace-hygiene/release signals, not functional necessities — but they're cheap, they make
`deno bump-version` usable, and they mirror PR #54's intent. Kept per the explicit scope decision.

**Nuance — two `deno bump-version` modes** (from the binary's help): with an explicit increment
(`bump:patch`/`bump:minor`) it applies that increment to every workspace member at the root. Without
an increment (`bump:dry-run` = `--base=main --dry-run`) it runs in **conventional-commits mode**: it
derives per-package bumps from commit messages between the latest git tag (`git describe --tags
--abbrev=0`) and the branch, and would prepend a note to `Releases.md` (suppressed by `--dry-run`).
Consequence: `bump:dry-run` **requires a git tag to exist** and will error in a tagless repo — this
is benign (the tasks are config-only) and must not be treated as a gate. `deno bump-version` also
rewrites `jsr:` refs in the root import map, but the root has none, so that is moot here.

**Carve-out:** `apps/api/deno.json` and `apps/web/deno.json` contain a `deploy` block with
`"install": "deno install"` (Deno Deploy config). That is intentionally left untouched — Deno
Deploy is a separate target (a non-goal), and its install command is not part of this change.

### 10. Workspace-integrity test + docblocks

**Choice:** Add `packages/shared/src/workspace.test.ts` asserting: (a) each of the four members declares both `name` and `version` in its `deno.json`; (b) the root `catalog` keys are internally consistent and every member `"catalog:"` reference maps to a defined catalog key; (c) the `@brewform/*` member names are unique and resolvable. Docblock any helper the test introduces (e.g. a config-reader).

**Rationale:** A runtime version bump produces ~no new application code, so feature tests would be invented. The honest, valuable coverage is a config-integrity guard that fails loudly if a future edit drifts a member version, breaks the catalog mapping, or renames a member out from under the 174 bare imports. The existing suites (run green on 2.9.0) are the de-facto regression gate for the version bump itself.

### 11. `Deno.serve` compression breaking change — verify, don't assume

**Choice:** Confirm the API does not rely on `Deno.serve`'s (now-off-by-default) automatic compression at `apps/api/src/main.ts:141-142`; no code change expected.

**Rationale:** Hono manages its own compression middleware and the call sites pass only `app.fetch` (+ `{ port }`) — they never set `automaticCompression`, so they almost certainly never depended on the runtime default. This is a one-line confirmation during implementation, not a planned edit. If (unexpectedly) responses were relying on the runtime default, opt back in with `Deno.serve({ ..., automaticCompression: true }, app.fetch)`.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| **`deno ci --prod` runner drops `drizzle-kit` (devDep) needed by the entrypoint migration.** | Verified mechanism: the entrypoint resolves `npm:drizzle-kit@0.31` from the `/deno-dir` cache copied from the builder, not `node_modules` — so `--prod` is harmless. **Gate it:** build the prod image and run a real migration + seed + boot before adopting. Fallback to d30's `COPY /app .` runner if the gate fails (Decision 7). |
| **`min-release-age` (24h) stalls the lockfile regen** on a too-fresh dep. | Near-impossible (ranges resolve to >24h-old versions; the lock is from 2026-06-25), and the gate degrades gracefully to the prior version. Contingency: `deno install --minimum-dependency-age=0` for that one command (Decision 4). |
| **Catalog `"catalog:"` from `package.json` fails to resolve under `deno ci`.** | Confirmed valid in 2.9 (same resolver path that freezes the root lock). The workspace-integrity test + a clean `deno ci` after regen catch any mismatch before merge. |
| **Re-enabled sanitizers surface pre-existing leaks** — most likely in the api/db suites (real Postgres clients/timers), potentially many. | Run the FULL suite early after enabling. Fix real leaks (close clients in `afterAll`); override per-test only for by-design leaks; never disable globally. **Fallback (Decision 8):** if the leak surface is too large, scope sanitizers to `packages/shared` and defer api/db to a follow-up — keeps the runtime bump shippable. |
| **Sanitizers may not be enforced on member-scoped test runs** (`deno task --cwd <member> test` uses the member `deno.json`, which has no `test` block). | Verify inheritance empirically on 2.9.0; if absent, add the sanitizer fields to each member `deno.json` `test` block or `--sanitize-ops --sanitize-resources` to the member tasks (Decision 8, nuance 1). |
| **`Deno.serve` compression now off by default** changes response encoding. | Hono handles compression; call sites never set the flag. Confirm during implementation (Decision 11). One-line opt-in if ever needed. |
| **2.9 formatter reformats HTML/SVG/CSS that 2.7.14 ignored → `deno fmt --check` fails in CI.** | 2.9 formats HTML/XML/SVG by default and uses `lax-css`. Four in-scope files are affected: `apps/web/index.html`, `apps/web/public/404.html`, `apps/web/public/favicon.svg`, `apps/web/src/styles/globals.css`. Run `deno fmt` on 2.9.0, review (preserve `index.html` Vite placeholders + `globals.css` Tailwind directives), and **commit the reformat** so `--check` passes (task 13.1a). Escape hatch: add the files/globs to `fmt.exclude`. |
| **Lockfile regen diff misread as "broken".** | The diff is NOT empty: the catalog migration changes `workspace.members[*].packageJson.dependencies` (the `drizzle-orm`/`bcryptjs`/`zod` entries change form to reflect `catalog:`). That is EXPECTED. What must NOT change is the RESOLVED versions in the `specifiers`/`npm` sections — churn there signals an unintended upgrade. Format stays `"5"`. If the regen looks wrong, `git checkout deno.lock` and confirm the existing lock still `deno ci`-installs on 2.9.0. |
| **2.9.1 ships mid-implementation**, making `2.9.0` momentarily not-latest. | Harmless — we pin exact `2.9.0` deliberately. Re-pin to 2.9.1 later as a trivial follow-up if desired. |
| **PR #54 left open** causes confusion (two competing upgrades). | Close PR #54 once this lands; the proposal documents the supersession explicitly. |
| **Local dev still on 2.8.3** while CI/Docker move to 2.9.0. | The contributor upgrades locally to 2.9.0 (documented in tasks). Behavior parity is otherwise enforced by the pinned surfaces. |

## Open Questions

- **Should the `denokv` sidecar (`0.14.0`) and the `@v2` `setup-deno` action also be bumped?** **Decision: no, out of scope.** `denokv` is a separate component on its own release cadence (d30 owns it); `setup-deno@v2` is a major-pinned action that resolves the latest v2 minor — bumping the action major is unrelated to the Deno runtime version. Both can be separate follow-ups.
- **Adopt `deno ci --prod` or keep d30's `COPY /app .` runner?** **Decision: adopt, gated** (Decision 7). The boot gate is the deciding test; fallback is documented.
- **Sanitizers global vs per-critical-suite?** **Decision: global** (root `deno.json` `test` block), with per-test overrides for legitimate exceptions. Matches PR #54 and is the documented mechanism.
- **Does the lockfile regen need to run on 2.9.0 specifically (vs local 2.8.3)?** **Decision: yes — regen with 2.9.0.** Upgrade local Deno to 2.9.0 first, then `rm deno.lock && deno install`, so the lock is produced by the same runtime CI/Docker use. (The format is `"5"` in both, but regenerating on the target version avoids any subtle resolver differences.)
