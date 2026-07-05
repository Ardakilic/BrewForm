# deno-runtime Specification

## Purpose
TBD - created by archiving change d31-deno-29-upgrade. Update Purpose after archive.
## Requirements
### Requirement: Deno 2.9.0 pinned in all Docker build stages

Both Dockerfiles SHALL pin the Deno base image to the exact tag `denoland/deno:debian-2.9.0` in
every stage that uses a Deno base image:

- `Dockerfile` — the `deps`, `builder`, and `runner` stages (3 `FROM` lines).
- `Dockerfile.web` — the `deps` and `builder` stages (2 `FROM` lines). The `caddy:*` runner stage
  is unaffected.

The pin SHALL be an exact patch version (`debian-2.9.0`), never a floating tag (`debian-2.9`,
`latest`), so image builds are reproducible. No other Dockerfile content (entrypoint, `EXPOSE`,
`/deno-dir` cache copy, `--unstable-cron`/`--unstable-kv` runtime flags) changes as part of the
version pin.

#### Scenario: API image builds on Deno 2.9.0

- **WHEN** `docker build -f Dockerfile .` runs
- **THEN** all three stages (`deps`, `builder`, `runner`) use `denoland/deno:debian-2.9.0`
- **AND** the built image's `deno --version` reports `2.9.0`

#### Scenario: Web image builds on Deno 2.9.0

- **WHEN** `docker build -f Dockerfile.web .` runs
- **THEN** the `deps` and `builder` stages use `denoland/deno:debian-2.9.0`
- **AND** the Vite build (`deno task --cwd apps/web build`) completes under 2.9.0
- **AND** the `caddy` runner stage is unchanged

#### Scenario: No floating Deno tags remain

- **WHEN** the Dockerfiles are grepped for `denoland/deno:`
- **THEN** every match is the exact tag `denoland/deno:debian-2.9.0`
- **AND** no `denoland/deno:debian-2.7.14`, `:debian-2.8.x`, `:debian-2.9` (minor-only), or `:latest`
  remains

### Requirement: Deno 2.9.0 pinned in all CI workflows

Both CI workflows SHALL pin `denoland/setup-deno@v2` to `deno-version: v2.9.0` in every job that
sets up Deno:

- `.github/workflows/ci.yml` — the `quality` and `test` jobs (2 pins).
- `.github/workflows/pr.yml` — the `check`, `test-unit`, `test-api`, and `test-web` jobs (4 pins).

`.github/workflows/release.yml` SHALL NOT contain a `setup-deno` pin — it builds via the Docker
base images, so its Deno version flows from the Dockerfile pins.

#### Scenario: CI runs on the same version as Docker

- **WHEN** `ci.yml` or `pr.yml` runs
- **THEN** every `setup-deno` step installs `v2.9.0`
- **AND** the version matches the `debian-2.9.0` Docker base images (no CI/Docker drift)

#### Scenario: No stale CI version pins remain

- **WHEN** `ci.yml` and `pr.yml` are grepped for `deno-version:`
- **THEN** every occurrence is `v2.9.0`
- **AND** no `v2.7.14` (the prior pin) remains

### Requirement: Lockfile regenerated and frozen-installable on 2.9.0

The single root `deno.lock` SHALL be refreshed using Deno 2.9.0 via a **non-destructive**
`deno install` (NOT `rm deno.lock && deno install`), AFTER the catalog edits, and SHALL retain
lockfile format `"version": "5"` (2.9 does not bump the format). The refreshed lockfile SHALL install
cleanly under `deno ci` (frozen, lockfile-strict) on 2.9.0. The RESOLVED npm package versions (the
`specifiers`/`npm` sections) SHALL NOT change due to the runtime bump or the catalog migration —
because the lock's `workspace` section records resolved specifiers (`npm:drizzle-orm@0.45`) that are
invariant to the `catalog:` indirection, the correct outcome is a **byte-identical lock** (zero diff).
A `rm deno.lock` regeneration is PROHIBITED here: it floats every `^`/`*` range to latest-in-range,
churning resolved versions and violating the no-dependency-upgrades non-goal. Any non-empty
resolved-version diff SHALL be investigated and reverted before commit.

#### Scenario: Frozen install succeeds on the regenerated lockfile

- **WHEN** `deno ci` runs against the regenerated `deno.lock` on Deno 2.9.0
- **THEN** it installs strictly from the lockfile with no error
- **AND** it does not report the lockfile as out of date

#### Scenario: Lockfile format is unchanged

- **WHEN** the regenerated `deno.lock` is inspected
- **THEN** its `version` field is `"5"`
- **AND** no dependency specifier's resolved version changed solely due to the runtime bump

#### Scenario: Non-destructive refresh preserves resolved versions

- **WHEN** a non-destructive `deno install` runs under Deno 2.9.0 (default `min-release-age` 24h) after the catalog edits
- **THEN** the lock is byte-identical to the pre-change lock (no resolved version floats; the catalog resolves to the same specifiers)
- **AND** `min-release-age` never applies (no fresh resolution occurs) and no `.npmrc` is required

### Requirement: Version prose updated to 2.9

Documentation and Serena memory files that state the Deno runtime version SHALL be updated to 2.9:

- `README.md` (the runtime line, currently "Deno 2.7").
- `.serena/memories/tech_stack.md` (the Deno version reference).
- `docs/requirements-audit-report.md` (currently "Deno Version: 2.7.13 (Docker)").

#### Scenario: Docs reflect the pinned runtime

- **WHEN** a contributor reads `README.md` or `.serena/memories/tech_stack.md`
- **THEN** the stated Deno runtime version is 2.9 (consistent with the Dockerfile and CI pins)
- **AND** no doc states an older Deno version as the current runtime (excluding intentionally
  historical references such as archived changes)

### Requirement: Repository formatting is reconciled with the 2.9 formatter

The repository SHALL be left in a state where `deno fmt --check` passes on Deno 2.9.0. Deno 2.9
formats HTML/XML/SVG by default and uses the `lax-css` CSS formatter, which 2.7.14 did not — so the
in-scope files newly affected by the formatter (`apps/web/index.html`, `apps/web/public/404.html`,
`apps/web/public/favicon.svg`, `apps/web/src/styles/globals.css`) MUST be reconciled: the 2.9
reformat SHALL either be applied and committed (after confirming `index.html` retains its Vite
`%VITE_*%` placeholders and `globals.css` retains its Tailwind directives) OR the affected
files/globs SHALL be added to the root `deno.json` `fmt.exclude`. The CI `deno fmt --check` step
SHALL NOT fail on 2.9.0 as a result of the runtime bump.

#### Scenario: Format check passes on 2.9.0

- **WHEN** `deno fmt --check` runs under Deno 2.9.0 in CI (`ci.yml` quality job, `pr.yml` check job)
- **THEN** it reports no formatting differences
- **AND** the newly-formatter-eligible HTML/SVG/CSS files are either already formatted to 2.9's
  output (committed) or excluded from the `fmt` scope

#### Scenario: Reformatted templates remain functional

- **WHEN** the 2.9 reformat is applied to `apps/web/index.html` and `apps/web/src/styles/globals.css`
- **THEN** `index.html` still contains its Vite placeholders (e.g. `%VITE_PUBLIC_APP_URL%`)
- **AND** `globals.css` still contains its Tailwind v4 `@import`/`@theme` directives
- **AND** the web image build (`Dockerfile.web`) still produces a working SPA

