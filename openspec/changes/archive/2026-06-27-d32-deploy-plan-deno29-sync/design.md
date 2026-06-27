# Design — d32 Deploy plan & local-dev reconciliation with Deno 2.9 / workspaces

## Context

`d31` bumped the runtime to Deno 2.9.0, swapped Docker/CI installs to `deno ci`, and added
workspace-management features. The operator guide (`coolify_deployment_plan.md`, authored by `d30`)
and a couple of local-dev compose details were not updated in lockstep. This change is a focused
reconciliation: fix one real local-dev bug (the dev Deno cache mount), pin one floating image,
update the deployment guide to match the code, and add the docblocks + a guard test the standing
project conventions require.

Inputs that shaped the decisions below: a working-tree audit of `Dockerfile`, `Dockerfile.web`,
`compose.yml`, `docker-entrypoint.sh`, `.dockerignore`, both CI workflows, the `Makefile`, and the
two prior change folders; an empirical GNU Make compatibility test; a Deno-docs confirmation that
cron/KV remain unstable on 2.9; and a line-precise extraction of `coolify_deployment_plan.md`
(captured verbatim in Appendix A).

## Decisions

### Decision 1 — Mount the dev `deno_cache` volume at `/deno-dir`

The `denoland/deno:debian` base image sets `DENO_DIR=/deno-dir`. The Dockerfiles already honor this
(`COPY --from=deps /deno-dir /deno-dir`). But the dev compose services (`app`, `web-dev`) mount the
`deno_cache` named volume at `/root/.cache/deno` — the *upstream default* Deno cache path, NOT the
path this image uses. The result: Deno caches to `/deno-dir` (the container's writable layer, lost
on recreate) while the named volume sits unused at `/root/.cache/deno`. Dependencies are re-fetched
on every `docker compose down && up`.

**Fix:** change both mounts to `deno_cache:/deno-dir`. This matches the image `DENO_DIR`, the
Dockerfile stage copies, and the previously-recorded project note. No `DENO_DIR` env override is
added — relying on the image default keeps a single source of truth.

**Verification:** confirmed the image default by the Dockerfile's own `/deno-dir` copies and the
recorded project memory; the guard test (Decision 6) asserts the corrected mount string.

### Decision 2 — Keep dash-separated Makefile targets (rename dropped)

The original ask was to rename dash targets to colon form (`serena-index` → `serena:index`) to
match the `deno.json` task convention. **Empirically tested and dropped.**

```
GNU Make 3.81 (the developer's make):
  serena:index:  →  *** target pattern contains no `%'.  Stop.   (parsed as a static pattern rule)
  serena.index:  →  works
  serena/index:  →  works
  serena\:index: →  works; invokable as `make serena:index`      (backslash-escaped)
```

A bare colon is Make's rule separator, so `name:sub:` is read as `targets: target-pattern:
prereqs` — a static pattern rule, which errors when the pattern has no `%`. This is grammar, not a
version quirk. The backslash-escaped form gives the exact `make serena:index` UX, but requires
`\:` on every target and prerequisite plus a rewrite of the `help` target's `grep`/`awk` (which
splits on the first colon and would truncate `serena:up` → `serena`). Judged not worth the noise.

**Consequence:** the existing dash targets stay. The deployment guide's `prod-up` / `images-push` /
`prod-up-build` references remain correct, so no rename-driven doc churn is needed.

### Decision 3 — Reconcile the drizzle-kit pin to `@0.31` (code is source of truth)

The codebase pins `npm:drizzle-kit@0.31` in three places (`Makefile:121` `DRIZZLE_KIT`, the
`Dockerfile` builder stage, `docker-entrypoint.sh`). The guide pins `@0.31.10` (lines ~529, ~744).
The guide is the outlier and the over-specified one (the lockfile already nails the exact patch).
Align the guide to `@0.31` so an operator copy-pasting a command from the guide runs the same
version the image does.

### Decision 4 — Pin the compose preview Caddy to `2.11.4-alpine`

`Dockerfile.web` (production web image) pins `caddy:2.11.4-alpine`; the compose preview `web`
service floats `caddy:2-alpine` (`compose.yml:216`). Pin the preview service to `2.11.4-alpine` so
`make preview` exercises the same Caddy the published image uses. Low-risk reproducibility fix. The
guide's §2 prerequisites table (line ~131) carries the same floating `caddy:2-alpine` string and is
aligned too.

### Decision 5 — Leave the unstable flags and `.dockerignore` alone (verified)

Deno docs (current, covering 2.9) confirm `Deno.cron` and Deno KV are still unstable and require
`--unstable-cron` / `--unstable-kv` (or the `deno.json` `"unstable"` array). The entrypoint flags
and the guide's references are correct — no change, but a one-line note is added to the guide so a
future reader does not "modernize" them away. `.dockerignore` still excludes `.env`/`*.env` and
re-includes `*.env.example` — `d30`'s "no secrets in images" requirement holds. Recorded so a
reviewer does not re-investigate.

### Decision 6 — Hermetic, dependency-free guard test for the compose invariants

The mount-path bug was invisible because nothing asserted it. Add a Deno test under
`packages/shared/src/` (so it runs in CI's `test-unit` job, which already grants `--allow-read`)
that reads the root `compose.yml` and asserts: the `deno_cache` volume mounts at `/deno-dir`, the
old `/root/.cache/deno` mount string is absent, and the preview Caddy image is pinned. **Text-based
assertions, not a YAML parse** — parsing would pull in `@std/yaml` (a new dependency + lockfile
churn) for no real gain. The test resolves `compose.yml` from `import.meta.url` (three levels up
from `packages/shared/src/`, mirroring `workspace.test.ts`) and follows the BDD convention. See the
turnkey sketch in Appendix B.

### Decision 7 — Doc-sync scope: live files only

Update only live, executable, or current-doc surfaces: `compose.yml` and
`coolify_deployment_plan.md`. Historical records (`openspec/changes/archive/**`, completed
`plans/*.md`) and unrelated in-flight changes (`d27`, `d29`) are left untouched — rewriting them
would muddy their diffs and falsify a historical record for no benefit.

### Decision 8 — Correct the §2 prerequisites table status column

The guide's §2 "Codebase prerequisites (implement & merge first)" table marks the D30 rows
"Not yet implemented", but those shipped (D30 = commit `8a07857`, plus D31 = `eaffcdf`). Update the
Status column so an operator is not told to implement already-shipped infra. Find with
`grep -n 'Not yet implemented' coolify_deployment_plan.md`.

## Risks

- **Dev cache mount change forces a one-time re-cache.** Existing `deno_cache` volumes hold data at
  the old path; after the change the first `make up`/`make dev` re-populates `/deno-dir`. One slow
  startup, then persistent thereafter. Acceptable and self-correcting.
- **Guard test brittleness.** Text assertions key off the exact mount/image strings; a benign
  reformat of `compose.yml` could trip them. Mitigated by asserting on stable substrings
  (`deno_cache:/deno-dir`, `caddy:2.11.4-alpine`) rather than whole lines, with a clear failure
  message.

## Open questions

None blocking. (Possible tiny follow-up, out of scope: `d31`'s `deno-workspace-management`
capability summary still mentions an "optional `deno ci --prod` runtime image" although its detailed
requirement records that `--prod` was evaluated and rejected — a cosmetic inconsistency inside
`d31`, not this change's concern.)

---

## Appendix A: Apply edit-map (verbatim) — `coolify_deployment_plan.md`

> Line numbers are authoring-time hints; match on the quoted strings. Apply top-to-bottom.

**A · drizzle-kit pin (2 replacements)**

- Line ~529 — FIND `deno run -A npm:drizzle-kit@0.31.10 migrate` → REPLACE `deno run -A npm:drizzle-kit@0.31 migrate`
- Line ~744 — FIND `cd packages/db && deno run -A npm:drizzle-kit@0.31.10 generate` → REPLACE `cd packages/db && deno run -A npm:drizzle-kit@0.31 generate`

**B · Caddy pin (1 replacement, §2 table row 3, line ~131)**

- FIND `caddy:2-alpine` (in the "Web Dockerfile: 3-stage build … serving `dist/` on port 80" row) → REPLACE `caddy:2.11.4-alpine`

**Block A1 — insert after the `## Step 0 — Pre-flight (before any Coolify work)` heading (line ~183):**

```markdown
> **Pinned runtime:** BrewForm runs on **Deno 2.9.0**. Both images build from
> `denoland/deno:debian-2.9.0` (API `Dockerfile`, web `Dockerfile.web`), and CI pins
> `deno-version: v2.9.0`. If you fork or rebuild an image, keep the base tag on `2.9.0`.
```

**Block A2 — insert near the §2 Dockerfile prerequisite rows (lines ~129–131):**

```markdown
> **Install command:** the Docker `deps` stages and CI install dependencies with `deno ci`
> (a frozen, lockfile-strict install — `rm -rf node_modules && deno install --frozen`), not
> `deno install`. `deno ci` fails fast if `deno.lock` is missing or out of date.
```

**Block A3 — insert after the `## Step 7 — First deploy: migrations & seed` heading (line ~523):**

```markdown
> **Workspace layout:** this is a native Deno workspace (root `deno.json`
> `workspace.members = ["apps/*", "packages/*"]`; not Turborepo). The migrate/seed commands below
> run from the repo root and reference `packages/db/` paths; the `cd packages/db && deno run -A
> npm:drizzle-kit@0.31 …` form is equivalent and also correct.
```

**Block A4 — insert immediately after the API-start line (line ~536, `exec deno run --unstable-cron --unstable-kv apps/api/src/main.ts`):**

```markdown
   > The `--unstable-cron` and `--unstable-kv` flags are still **required on Deno 2.9** — `Deno.cron`
   > and Deno KV remain unstable APIs. Do not remove them.
```

**C · §2 prerequisites table Status column** — `grep -n 'Not yet implemented' coolify_deployment_plan.md`; replace each `Not yet implemented` with `Done (shipped in D30/D31)`.

**Post-edit verification greps (all should return nothing):**

```
grep -n 'drizzle-kit@0.31.10' coolify_deployment_plan.md
grep -n 'caddy:2-alpine' coolify_deployment_plan.md
grep -n 'Not yet implemented' coolify_deployment_plan.md
```

---

## Appendix B: Guard-test sketch — `packages/shared/src/compose-config.test.ts`

```ts
/**
 * @module
 * Compose-config guard: asserts the local-dev Deno cache mount and pinned images in the
 * repo-root `compose.yml` so the d32 reconciliation fixes cannot silently regress.
 */
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

/**
 * Reads the repo-root `compose.yml` as raw text. This file lives at `packages/shared/src/`,
 * three levels below the workspace root, so the path is resolved from `import.meta.url`
 * (independent of the `deno test` working directory).
 * @returns The full text of `compose.yml`.
 */
async function readComposeFile(): Promise<string> {
  return await Deno.readTextFile(new URL('../../../compose.yml', import.meta.url));
}

describe('compose.yml local-dev invariants', () => {
  it('mounts the Deno cache at the image DENO_DIR (/deno-dir)', async () => {
    const compose = await readComposeFile();
    expect(compose).toContain('deno_cache:/deno-dir');
    expect(compose).not.toContain('deno_cache:/root/.cache/deno');
  });

  it('pins the preview Caddy image to match Dockerfile.web', async () => {
    const compose = await readComposeFile();
    expect(compose).toContain('caddy:2.11.4-alpine');
    expect(compose).not.toContain('image: caddy:2-alpine');
  });
});
```

Runs under `deno task test:shared` / `make test-shared` (and the CI `test-unit` job, which grants
`--allow-read`). No new dependency.

---

## Appendix C: Suggested docblocks

**`packages/db/src/seed.ts`** (top of file):

```ts
/**
 * @module
 * Idempotent database seed for BrewForm. Populates reference data (taste notes, brew-method
 * compatibility, badges, equipment + coffee-variety catalogs) plus a baseline admin user, vendors,
 * beans, recipes, and social/setup sample data. Every insert uses `onConflictDoNothing`, so it is
 * safe to re-run; invoked on first container boot (when the users table is empty) and via `make db-seed`.
 */
```

**`packages/shared/src/workspace.test.ts`** (top of file):

```ts
/**
 * @module
 * Workspace-integrity test: asserts every Deno workspace member declares a `name` and `version`,
 * the root `catalog` is internally consistent and covers every cross-member duplicated dependency,
 * and member names are unique. Guards the workspace-management configuration added in d31.
 */
```

**`scripts/generate-icons.ts`** (top of file):

```ts
/**
 * @module
 * Generates raster PNG app icons from `apps/web/public/favicon.svg` using resvg. Run via
 * `make generate-icons`; writes the sized PNGs into the web public assets directory.
 */
```

**`apps/api/scripts/build-email-templates.ts`** (before `function escapeBackticks`):

```ts
/**
 * Escapes characters significant inside a JS template literal so a raw HTML/MJML string can be
 * embedded safely between backticks: backslashes, backticks, and `$` (which would otherwise begin
 * a `${...}` interpolation).
 * @param str Raw string to escape.
 * @returns The escaped string, safe to embed in a template literal.
 */
```
