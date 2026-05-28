# Deno 2.7.14 → 2.8.1 Upgrade Plan

## Overview

Upgrade BrewForm from Deno 2.7.14 to 2.8.1 across all environments (Docker, CI, local),
then adopt new workspace management features (`catalog:` protocol, `deno ci`, etc.).

**Release dates:** 2.8.0 (2026-05-22) → 2.8.1 (2026-05-27, bugfix).
Always target **2.8.1**.

**Package manager status:** The lockfile issues with devDependencies that existed in
early Deno 2.x (inconsistent resolution depending on which directory you ran `deno install`
from) were resolved upstream before 2.8. Proof: the 2.8 release includes
`fix(install): regenerate lockfile with --force on global install (#33970)` and
`fix(workspace): clamp CLI include paths to member folder (#33949)`. Run `deno install`
from the **workspace root** to regenerate the lockfile once after upgrade — this ensures
a clean, consistent resolution across all members.

**Verified prerequisites:**
- Docker tag exists: `denoland/deno:debian-2.8.1` ✓ (confirmed via Docker Hub API)
- GitHub Action: `denoland/setup-deno@v2` supports `deno-version: v2.x` ✓
- All 4 workspace members are authenticated: `apps/api`, `apps/web`, `packages/db`, `packages/shared`

---

## Phase 0 — Pre-Upgrade Snapshot

### 0.1 Capture baseline

Run these before any changes and save the output:

```bash
deno --version > /tmp/deno-before.txt

# Lockfile checksum (used for rollback verification)
sha256sum deno.lock > /tmp/deno-lock-before.sha256

# Build times (for performance comparison)
docker compose build 2>&1 | ts '[%Y-%m-%d %H:%M:%S]'

# Test suite baseline
docker compose run --rm app deno task test 2>&1 | tee /tmp/tests-before.log

# Current dependency tree snapshot
docker compose run --rm --no-deps app deno info --json > /tmp/deno-info-before.json
```

### 0.2 Run pre-audit checks

```bash
# How many deno install commands (and which flags) are in CI/Docker?
rg -n "deno install" .github/ Dockerfile Makefile compose.yml
# Expected output:
#   .github/workflows/ci.yml:20:        run: deno install
#   .github/workflows/ci.yml:79:        run: deno install
#   .github/workflows/pr.yml:18:      - run: deno install --frozen
#   .github/workflows/pr.yml:49:      - run: deno install --frozen
#   .github/workflows/pr.yml:99:      - run: deno install --frozen
#   .github/workflows/pr.yml:147:      - run: deno install --frozen
#   Dockerfile:20:RUN deno install --frozen
#   Makefile:47:	docker compose run --rm --no-deps app deno install --frozen
#   Makefile:51:	docker compose run --rm --no-deps app deno install

# Check for /// <reference types="node" /> (now redundant)
rg -n '/// <reference types="node"' apps/ packages/
# Expected: no matches (lib.node included by default in 2.8)

# Check for any deprecated APIs
rg -n "Deno\.(close|fstat|read|write|seek|shutdown|resources|serveHttp|isatty)\b" \
  apps/ packages/
# Expected: no matches (or matches need migration)
```

---

## Phase 1 — Runtime Upgrade (2.7.14 → 2.8.1)

### 1.1 Update Docker image tags

**File:** `Dockerfile`

Three lines to change. Use exact find-and-replace:

```bash
# Replace all 3 occurrences at once
sed -i '' 's/denoland\/deno:debian-2\.7\.14/denoland\/deno:debian-2.8.1/g' Dockerfile

# Verify the replacements
rg "debian-2\.7\.14" Dockerfile    # should return nothing
rg "debian-2\.8\.1" Dockerfile     # should return 3 matches (lines 13, 24, 34)
```

### 1.2 Update CI runner version

**Files:** `.github/workflows/ci.yml` (2 jobs) and `.github/workflows/pr.yml` (3 jobs)

Keep `deno-version: v2.x` — `setup-deno@v2` resolves this to the latest v2 minor.
No changes needed here. After verifying 2.8 works in a test branch, the auto-resolution
is safe.

> **Alternative:** Pin to `deno-version: v2.8` if you prefer explicit versioning.
> The `setup-deno@v2` action supports semver ranges including `v2.8.x`,
> `v2.8`, `v2.x`, and `latest`.

### 1.3 Regenerate lockfile

Regenerate from the workspace root using the project's standard Docker-based workflow:

```bash
# Regenerate deno.lock inside Docker (NOT locally to avoid macOS/Linux differences)
make lockfile-update
# Equivalent: docker compose run --rm --no-deps app deno install

# Verify the lockfile changed (should show new format with workspace members section)
git diff deno.lock | head -100

# Verify the lockfile is consistent
docker compose run --rm --no-deps app deno ci 2>&1
# Should succeed — if it fails with "lockfile is out of date", run lockfile-update again
```

**What to expect in the diff:** The 2.8 lockfile format may include a `"workspace"` section
with per-member dependency listings (see Context7 examples showing
`"workspace": { "members": { "package_a": { "dependencies": [...] } } }`).
This is the new format — commit it.

### 1.4 Breaking changes — audit checklist

| Change | Verified? | Action |
|---|---|---|
| TypeScript 6.0.3 bundled | ☐ | `docker compose run --rm --no-deps app deno task check` — fix any new errors |
| `lib.node` included by default | ☐ | `/// <reference types="node" />` not found (pre-audit) — no action |
| Test sanitizers OFF by default | ☐ | Tests pass but may be masking leaks — see §3.1 |
| `no-process-global` / `no-node-globals` lint rules off by default | ☐ | Now off; re-enable if targeting browser+Deno |
| `setTimeout`/`setInterval` use Node.js timers | ☐ | `NodeJS.Timeout` type instead of `number` — audit timer code |
| V8 14.9 | ☐ | Run `deno task test` — no expected breakage |
| `npm:` prefix no longer required at CLI | ☐ | No code change; CLI convenience only |
| `compilerOptions.lib` no longer needs `"node"` | ☐ | Root `deno.json:45` — `"lib"` does NOT include `"node"` — no action |

**Warning:** The Docker builder stage runs `deno check apps/api/src/main.ts` (Dockerfile:30).
If TypeScript 6.0.3 introduces new errors, the Docker build will break. Run
`deno task check` inside Docker **before** proceeding to the Dockerfile changes
in Phase 2.

### 1.5 Deprecation audit

Search for deprecated APIs (pre-audit step 0.2 already runs this):

```bash
rg -n "Deno\.(close|fstat|read|write|seek|shutdown|resources|serveHttp|isatty)\b" \
  apps/ packages/
```

If any matches are found, migrate to the replacement APIs:

| Deprecated | Replacement |
|---|---|
| `Deno.close()` | — (GC-managed, no explicit close needed) |
| `Deno.fstat()` / `Deno.fstatSync()` | `Deno.FsFile.stat()` / `Deno.FsFile.statSync()` |
| `Deno.read()` / `Deno.readSync()` | `Deno.FsFile.read()` |
| `Deno.write()` / `Deno.writeSync()` | `Deno.FsFile.write()` |
| `Deno.seek()` / `Deno.seekSync()` | `Deno.FsFile.seek()` |
| `Deno.shutdown()` | — |
| `Deno.resources()` | — |
| `Deno.serveHttp` | `Deno.serve` |
| `Deno.isatty()` | `Deno.stdin.isTerminal()` (or `.stdout`, `.stderr`) |
| `Deno.FsFile.rid` / `Deno.Conn.rid` | — (`.rid` removed) |
| `window` global | `globalThis` |

Also audit: `import.meta.filename` and `import.meta.dirname` were **stabilized**
(in Deno 2.8, PR #33823's release notes confirm this). If the codebase currently
uses `import.meta.url`-based path hacks, evaluate migrating to these.

### 1.6 Phase 1 verification

```bash
deno --version | head -1
# Expected: deno 2.8.1

# Inside Docker:
docker compose run --rm --no-deps app deno --version

# Formatting
docker compose run --rm --no-deps app deno fmt --check

# Lint
docker compose run --rm --no-deps app deno lint apps/ packages/

# Type check (TS 6.0.3 — catch errors here, not in Docker build)
docker compose run --rm --no-deps app deno task check

# Build
docker compose run --rm --no-deps app deno task build

# Tests (sanitizers now off — see §3.1)
docker compose run --rm app deno task test
```

**Note on sanitizer behavior:** If tests pass without errors, they are passing
correctly but sanitizers are no longer catching leaked ops/resources.
Re-enabling is covered in §3.1.

---

## Phase 2 — Workspace Management Migration

### 2.1 Replace `deno install --frozen` with `deno ci` (CI + Docker only)

`deno ci` is equivalent to `rm -rf node_modules && deno install --frozen`.
It is designed for CI/CD and Docker builds. **Do not use for local development.**

#### Fact check — where `deno install` appears today:

```bash
# CI uses bare install (no --frozen):
ci.yml:20:        run: deno install               # quality job
ci.yml:79:        run: deno install               # test job

# PR uses --frozen:
pr.yml:18:      - run: deno install --frozen       # check job
pr.yml:49:      - run: deno install --frozen       # test-unit job
pr.yml:99:      - run: deno install --frozen       # test-api job
pr.yml:147:      - run: deno install --frozen      # test-web job

# Docker uses --frozen:
Dockerfile:20:RUN deno install --frozen            # deps stage

# Makefile uses --frozen for dev, bare for lockfile regen:
Makefile:47:	docker compose run ... deno install --frozen     # install target
Makefile:51:	docker compose run ... deno install              # lockfile-update target
```

#### Changes:

**A. `.github/workflows/ci.yml`** — 2 occurrences (lines 20, 79):
```bash
sed -i '' 's/run: deno install$/run: deno ci/' .github/workflows/ci.yml
# Note: ci.yml uses 'deno install' WITHOUT --frozen.
# Switching to 'deno ci' adds frozen semantics. This is the intended behavior.
```

**B. `.github/workflows/pr.yml`** — 4 occurrences (lines 18, 49, 99, 147):
```bash
sed -i '' 's/run: deno install --frozen/run: deno ci/' .github/workflows/pr.yml
```

**C. `Dockerfile`** — 1 occurrence (line 20):
```bash
sed -i '' 's/RUN deno install --frozen/RUN deno ci/' Dockerfile
```

**D. `Makefile`** — Do NOT change. Keep `deno install --frozen` for local development
(`make install` at line 47). The `make lockfile-update` target (line 51) uses bare
`deno install` for regenerating the lockfile — also keep as-is.

**Why not change `make install`?** `deno ci` wipes `node_modules` and errors on
non-frozen lockfiles. For local development where dependencies change frequently,
this is counterproductive. The CI environments (GitHub Actions, Docker builds) are
the correct places for `deno ci`.

### 2.2 Restructure Docker runner stage with `--prod`

**File:** `Dockerfile`, lines 32–39

Current runner stage:
```dockerfile
FROM denoland/deno:debian-2.8.1 AS runner
WORKDIR /app
COPY --from=builder /root/.cache/deno /root/.cache/deno
COPY --from=builder /app .
EXPOSE 8000
CMD ["deno", "run", "--allow-read", "--allow-write", "--allow-net", "--allow-env", "--allow-sys", "--unstable-cron", "apps/api/src/main.ts"]
```

Replace with:
```dockerfile
FROM denoland/deno:debian-2.8.1 AS runner
WORKDIR /app
# Copy manifest files from build context first (matches official deno ci Dockerfile pattern)
COPY deno.json deno.lock package.json ./
COPY apps/api/package.json apps/api/deno.json ./apps/api/
COPY apps/web/package.json apps/web/deno.json ./apps/web/
COPY packages/shared/package.json packages/shared/deno.json ./packages/shared/
COPY packages/db/package.json packages/db/deno.json ./packages/db/
# Install production deps only — skips devDependencies and @types/*
RUN deno ci --prod
# Copy application source and build artifacts from builder
COPY --from=builder /app/apps/api/src ./apps/api/src
COPY --from=builder /app/apps/api/scripts ./apps/api/scripts
COPY --from=builder /app/packages ./packages
EXPOSE 8000
CMD ["deno", "run", "--allow-read", "--allow-write", "--allow-net", "--allow-env", "--allow-sys", "--unstable-cron", "apps/api/src/main.ts"]
```

**Why copy `apps/web` manifests?** Even though the runner only serves the API,
all 4 workspace members' `deno.json` + `package.json` must be present at build
time so Deno can discover the full workspace during `deno ci`. Without them,
the workspace resolver may error.

**Why copy apps/web source is not needed:** The runner doesn't serve the web
frontend — that's handled by the `web` Caddy service in `compose.yml:193-204`
which mounts `./apps/web/dist` directly. The API runner only needs its own
source and the shared packages.

**Root `package.json` devDependencies:** `@resvg/resvg-js@^2.6.2` is in
`devDependencies` — correctly skipped by `--prod`.

**Compose integration:** The `app-preview` service (compose.yml:99) uses
`target: runner`. After this change, rebuild and test:
```bash
make build-web              # build SPA first
docker compose build runner # rebuild runner image
make preview                # test app-preview + caddy
```

### 2.3 Adopt `catalog:` protocol for shared npm dependencies

**Background:** The `catalog:` protocol (new in Deno 2.8, `#32947`) lets the
workspace root declare dependency versions once, and members reference them by
name. Catalog values are plain semver ranges — they substitute directly into
`package.json` dependency values.

**Restriction:** Catalog works for **npm packages only**. JSR packages need
`jsr:` prefix in `package.json` which the catalog cannot preserve (it substitutes
just the version range, losing the registry prefix). Per the
[workspaces docs](https://docs.deno.com/runtime/fundamentals/workspaces/#centralized-dependency-versions-with-catalog%3A):
"When several workspace members depend on the same **npm package**..."

#### Duplicated npm dependencies:

```text
apps/api/package.json:        drizzle-orm ^0.45.0   bcryptjs ^3.0.0   zod ^4.0.0
packages/db/package.json:     drizzle-orm ^0.45.0   bcryptjs ^3.0.0   ——————
packages/shared/package.json: ————————————————       ——————————————    zod ^4.0.0
```

All 3 are npm packages and candidates for catalog.

#### Step A: Add catalog to root `deno.json`

Insert after the `"workspace"` block (after line 5):

```json
"workspace": {
  "members": ["apps/*", "packages/*"]
},
"catalog": {
  "drizzle-orm": "^0.45.0",
  "bcryptjs": "^3.0.0",
  "zod": "^4.0.0"
},
```

Full context — the top of `deno.json` should become:
```json
{
  "unstable": ["cron", "kv"],
  "workspace": {
    "members": ["apps/*", "packages/*"]
  },
  "catalog": {
    "drizzle-orm": "^0.45.0",
    "bcryptjs": "^3.0.0",
    "zod": "^4.0.0"
  },
  "nodeModulesDir": "auto",
  ...
}
```

#### Step B: Update `apps/api/package.json`

Change 3 `dependencies` entries:

**Before (lines 6-8, 14):**
```json
"dependencies": {
    "drizzle-orm": "^0.45.0",
    "zod": "^4.0.0",
    ...
    "bcryptjs": "^3.0.0",
```

**After:**
```json
"dependencies": {
    "drizzle-orm": "catalog:",
    "zod": "catalog:",
    ...
    "bcryptjs": "catalog:",
```

`sed` command (run from repo root, verify first with git diff):
```bash
# apps/api
sed -i '' 's/"drizzle-orm": "\^0.45.0"/"drizzle-orm": "catalog:"/' apps/api/package.json
sed -i '' 's/"zod": "\^4.0.0"/"zod": "catalog:"/' apps/api/package.json
sed -i '' 's/"bcryptjs": "\^3.0.0"/"bcryptjs": "catalog:"/' apps/api/package.json
```

#### Step C: Update `packages/db/package.json`

**Before (lines 16, 18):**
```json
"dependencies": {
    "drizzle-orm": "^0.45.0",
    ...
    "bcryptjs": "^3.0.0"
```

**After:**
```json
"dependencies": {
    "drizzle-orm": "catalog:",
    ...
    "bcryptjs": "catalog:"
```

```bash
sed -i '' 's/"drizzle-orm": "\^0.45.0"/"drizzle-orm": "catalog:"/' packages/db/package.json
sed -i '' 's/"bcryptjs": "\^3.0.0"/"bcryptjs": "catalog:"/' packages/db/package.json
```

#### Step D: Update `packages/shared/package.json`

**Before (line 12):**
```json
"dependencies": {
    "zod": "^4.0.0"
```

**After:**
```json
"dependencies": {
    "zod": "catalog:"
```

```bash
sed -i '' 's/"zod": "\^4.0.0"/"zod": "catalog:"/' packages/shared/package.json
```

#### Step E: Not cataloging JSR packages

The following are JSR packages using `jsr:` prefix — catalog cannot replace them:
- `"@std/testing": "jsr:@std/testing@^1.0.18"` (in `apps/api` devDeps, `packages/db` devDeps)
- `"@std/expect": "jsr:@std/expect@^1.0.19"` (in `apps/api` devDeps, `packages/db` devDeps)

These keep their explicit `jsr:` specifiers. If they need version bumps in the
future, edit both files manually (only 2 files, both devDependencies — acceptable).

#### Step F: Regenerate lockfile

```bash
make lockfile-update
# Verify the lockfile diff shows catalog resolution
git diff deno.lock | head -80
```

### 2.4 Add `--package-json` flag awareness

Deno 2.8 adds `--package-json` to target `package.json` instead of `deno.json`.
Since this codebase has both, document the convention:

```bash
# Default: adds to deno.json
deno add hono

# Explicit: adds to package.json
deno add --package-json hono
```

**Recommendation:** Keep the convention that npm dependencies live in `package.json`
and Deno-specific config (tasks, fmt, lint, exports) in `deno.json`. Use
`--package-json` when adding new npm deps to keep manifests consistent.

### 2.5 Add `deno bump-version` tasks

`deno bump-version` is **experimental** in 2.8. In workspace mode it bumps
every member's version and rewrites `jsr:` cross-references.

**Prerequisite:** None of the 4 workspace members have a `version` field.
Add `"version": "0.1.0"` to each member's `deno.json`:

```bash
# Add version to each member (using jq — if not available, edit manually)
for f in apps/api/deno.json apps/web/deno.json packages/db/deno.json packages/shared/deno.json; do
  # Insert "version": "0.1.0" after the "name" line
  # This is safe because every member has a "name" field
  sed -i '' '/"name"/a\
  "version": "0.1.0",
' "$f"
done

# Verify
rg '"version"' apps/*/deno.json packages/*/deno.json
```

Then add tasks to root `deno.json`:

```json
"tasks": {
    ...
    "bump:dry-run": "deno bump-version --base=main --dry-run",
    "bump:patch": "deno bump-version patch",
    "bump:minor": "deno bump-version minor"
}
```

> **Note:** Conventional-commits-based bumping (`deno bump-version --base=main`)
> requires the repo to follow Conventional Commits. If not, use manual
> `bump:patch` / `bump:minor` / `bump:major` instead.

### 2.6 Verify Deno Deploy post-upgrade

`apps/api/deno.json` has a `deploy` configuration (lines 12–20). After upgrade,
Deno Deploy will resolve `deno install` and `deno task` using 2.8 semantics.

```bash
# Test deploy pipeline locally (if deployctl is available)
# The deploy config uses:
#   "install": "deno install"
#   "build": "deno task --cwd ../../packages/db generate && deno task email-build"
```

No changes expected — `deno install` in the deploy context works the same.
The migrate + email-build pipeline is unaffected.

### 2.7 `deno why` for dependency debugging

New in 2.8:
```bash
docker compose run --rm --no-deps app deno why drizzle-orm
docker compose run --rm --no-deps app deno why zod
```

Use after catalog migration to verify resolution paths.

---

## Phase 3 — Post-Upgrade Cleanup

### 3.1 Re-enable test sanitizers globally

Sanitizers are **OFF by default** in 2.8. To maintain pre-2.8 strictness,
add `sanitizeOps` and `sanitizeResources` to the root `deno.json` test config.

**Current test config (lines 76–87):**
```json
"test": {
    "include": [
      "apps/api/src/",
      "packages/shared/src/",
      "packages/db/src/"
    ],
    "exclude": [
      "src/generated/",
      "node_modules/",
      "packages/db/drizzle/"
    ]
}
```

**Replace with:**
```json
"test": {
    "sanitizeOps": true,
    "sanitizeResources": true,
    "include": [
      "apps/api/src/",
      "packages/shared/src/",
      "packages/db/src/"
    ],
    "exclude": [
      "src/generated/",
      "node_modules/",
      "packages/db/drizzle/"
    ]
}
```

If any tests intentionally leak ops/resources, opt them out individually:
```ts
Deno.test("leaks a timer", { sanitizeOps: false, sanitizeResources: false }, () => {
  setTimeout(() => {}, 10000);
});
```

### 3.2 Remove stale config

- `/// <reference types="node" />` — pre-audit confirmed none found. No action.
- `compilerOptions.lib` (line 45) — does NOT include `"node"`. No action.
- `no-process-global` / `no-node-globals` lint rules — now off by default.
  If targeting browser+Deno environments, add to `lint.rules.include`.
  Current config has `rules.tags: ["recommended"]` with `rules.exclude` entries
  — neither of these rules is present. No action needed unless cross-runtime
  targeting is required.

### 3.3 New features — adoption checklist

| Feature | Priority | Action |
|---|---|---|
| `import defer` | Low | Evaluate for conditionally-loaded heavy modules |
| Per-test `timeout` | Medium | Add to DB-dependent and network tests |
| `deno audit fix` | Medium | Run periodically: `docker compose run app deno audit` |
| `--watch` on `deno check` | Low | Dev convenience (`deno check --watch`) |
| `nodeModulesLinker` | None | Default `"isolated"` is correct; `"hoisted"` only for legacy npm projects |
| Cross-platform installs (`--os`/`--arch`) | None | Not needed for current Docker Linux-only build |
| CPU profiling (`--cpu-prof`) | Low | For performance debugging |
| Delta updates (`deno upgrade --no-delta`) | Info | Auto-enabled; use `--no-delta` for air-gapped envs |

---

## Summary of all file changes

| # | File | Line(s) | Change | Command |
|---|---|---|---|---|
| 1 | `Dockerfile` | 13, 24, 34 | `debian-2.7.14` → `debian-2.8.1` | `sed -i '' 's/denoland\/deno:debian-2\.7\.14/denoland\/deno:debian-2.8.1/g' Dockerfile` |
| 2 | `Dockerfile` | 20 | `deno install --frozen` → `deno ci` | `sed -i '' 's/RUN deno install --frozen/RUN deno ci/' Dockerfile` |
| 3 | `Dockerfile` | 34–39 | Restructure runner with `--prod` | Manual edit (multi-line) |
| 4 | `deno.json` | after 5 | Add `"catalog": { ... }` | Manual insert |
| 5 | `deno.json` | 76–87 | Add `sanitizeOps`, `sanitizeResources` to test | Manual edit |
| 6 | `deno.json` | 7–41 | Add `bump:dry-run`, `bump:patch`, `bump:minor` tasks | Manual edit |
| 7 | `apps/api/deno.json` | after "name" | Add `"version": "0.1.0"` | sed (see §2.5) |
| 8 | `apps/web/deno.json` | after "name" | Add `"version": "0.1.0"` | sed (see §2.5) |
| 9 | `packages/db/deno.json` | after "name" | Add `"version": "0.1.0"` | sed (see §2.5) |
| 10 | `packages/shared/deno.json` | after "name" | Add `"version": "0.1.0"` | sed (see §2.5) |
| 11 | `apps/api/package.json` | 6, 7, 14 | `drizzle-orm`, `zod`, `bcryptjs` → `"catalog:"` | sed (see §2.3 step B) |
| 12 | `packages/db/package.json` | 16, 18 | `drizzle-orm`, `bcryptjs` → `"catalog:"` | sed (see §2.3 step C) |
| 13 | `packages/shared/package.json` | 12 | `zod` → `"catalog:"` | sed (see §2.3 step D) |
| 14 | `.github/workflows/ci.yml` | 20, 79 | `deno install` → `deno ci` | `sed -i '' 's/run: deno install$/run: deno ci/' .github/workflows/ci.yml` |
| 15 | `.github/workflows/pr.yml` | 18, 49, 99, 147 | `deno install --frozen` → `deno ci` | `sed -i '' 's/run: deno install --frozen/run: deno ci/' .github/workflows/pr.yml` |
| 16 | `deno.lock` | (full) | Regenerate with 2.8.1 | `make lockfile-update` |

**Files NOT changed:**
- `apps/web/package.json` — no shared npm deps to catalog
- `Makefile` — keep `deno install --frozen` for local dev
- `package.json` (root) — no changes needed
- `compose.yml` — Dockerfile targets by name, no changes needed

## Execution order
```text
  1. Capture baseline (Phase 0)
  2. Run pre-audit checks (Phase 0.2 — verify search results match expectations)
  3. Run deno task check inside Docker (catch TS 6.0.3 errors BEFORE touching Dockerfile)
  4. Update Dockerfile image tags (3 sed replacements)
  5. Change Dockerfile deps stage command (1 sed replacement)
  6. Regenerate deno.lock: make lockfile-update
  7. Run full verification inside Docker (fmt, lint, check, build, test)
  8. Add catalog section to root deno.json
  9. Update apps/api/package.json (3 sed commands)
 10. Update packages/db/package.json (2 sed commands)
 11. Update packages/shared/package.json (1 sed command)
 12. Regenerate deno.lock (catalog changes): make lockfile-update
 13. Run full verification inside Docker
 14. Change CI workflows: ci.yml (2 sed) and pr.yml (4 sed)
 15. Restructure Dockerfile runner stage (manual edit + docker compose build)
 16. Test compose profiles: make dev, make preview
 17. Add version fields to 4 workspace member deno.json files (4 sed commands)
 18. Re-enable test sanitizers globally in root deno.json
 19. Add bump-version tasks to root deno.json
 20. Run final verification + git diff --stat + commit
```

## Rollback plan

### If Docker image tag is wrong or unavailable:
```bash
# Check available tags
curl -s "https://hub.docker.com/v2/repositories/denoland/deno/tags?page_size=5&name=debian-2.8" \
  | python3 -c "import sys,json; [print(t['name']) for t in json.load(sys.stdin)['results']]"

# Revert to 2.7.14 if needed
sed -i '' 's/denoland\/deno:debian-2\.8\.1/denoland\/deno:debian-2.7.14/g' Dockerfile
sed -i '' 's/RUN deno ci/RUN deno install --frozen/' Dockerfile
```

### If CI fails after upgrade:
```bash
# Revert CI workflows
sed -i '' 's/run: deno ci$/run: deno install/' .github/workflows/ci.yml
sed -i '' 's/run: deno ci/run: deno install --frozen/' .github/workflows/pr.yml
# Pin runtime to 2.7.x
# Change deno-version: v2.x → deno-version: v2.7.x in both CI files
```

### If catalog: protocol causes resolution issues:
```bash
# Revert package.json files (replace "catalog:" back to explicit versions)
sed -i '' 's/"catalog:"/"^0.45.0"/' apps/api/package.json packages/db/package.json
sed -i '' 's/"catalog:"/"^3.0.0"/' apps/api/package.json packages/db/package.json
# zod is at ^4.0.0 in both — use git diff to see which were changed
# Remove catalog block from deno.json
# Regenerate lockfile: make lockfile-update
```
