## REMOVED Requirements

### Requirement: Deno 2.9.0 pinned in all Docker build stages

This requirement SHALL be removed and superseded by the 2.9.3 Docker-pin requirement below (same
structure, new exact version) — version-in-name requirements are replaced, not edited, on a
runtime bump.

**Reason:** Deno 2.9.3 is current; local dev already runs 2.9.2 while CI pins v2.9.0 — the exact
drift the d31 spec existed to prevent. The pin structure is preserved verbatim; only the version
moves.

#### Scenario: Old Docker pin superseded

- **WHEN** the Dockerfiles are grepped for `denoland/deno:` after wave 5
- **THEN** no `debian-2.9.0` tag remains (all stages are on the new exact tag)

#### Scenario: Structure preserved

- **WHEN** the replacing requirement below is compared to this one
- **THEN** the same five FROM lines across `Dockerfile` and `Dockerfile.web` are governed, with
  only the version changed

### Requirement: Deno 2.9.0 pinned in all CI workflows

This requirement SHALL be removed and superseded by the 2.9.3 CI-pin requirement below (same six
pin sites, new exact version).

**Reason:** Same as above — the CI pins are the drifted surface (v2.9.0 at `ci.yml:17,76`,
`pr.yml:15,46,96,144` vs local 2.9.2 vs latest 2.9.3).

#### Scenario: Old CI pin superseded

- **WHEN** `ci.yml` and `pr.yml` are grepped for `deno-version:` after wave 5
- **THEN** no `v2.9.0` remains

#### Scenario: release.yml still exempt

- **WHEN** `.github/workflows/release.yml` is inspected
- **THEN** it still contains no `setup-deno` pin (its Deno version flows from the Docker base
  images)

## ADDED Requirements

### Requirement: Deno 2.9.3 pinned in all Docker build stages

Both Dockerfiles SHALL pin the Deno base image to the exact tag `denoland/deno:debian-2.9.3` in
every stage that uses a Deno base image:

- `Dockerfile` — the `deps`, `builder`, and `runner` stages (3 `FROM` lines).
- `Dockerfile.web` — the `deps` and `builder` stages (2 `FROM` lines). The `caddy:*` runner stage
  is unaffected.

The pin SHALL be an exact patch version (`debian-2.9.3`), never a floating tag (`debian-2.9`,
`latest`), so image builds are reproducible. No other Dockerfile content (entrypoint, `EXPOSE`,
`/deno-dir` cache copy, `--unstable-cron`/`--unstable-kv` runtime flags) changes as part of the
version pin. Per the dependency-management deployment-pin decoupling requirement, this Docker bump
is raised here as a coordinated deployment-touching change (not folded silently into a dependency
refresh).

**Reason:** 2.9.3 is the current patch release; keeping Docker on 2.9.0 while CI/local move would
recreate the CI/Docker drift the d31 spec prohibits.

#### Scenario: API image builds on Deno 2.9.3

- **WHEN** `docker build -f Dockerfile .` runs
- **THEN** all three stages use `denoland/deno:debian-2.9.3` and the built image's
  `deno --version` reports `2.9.3`

#### Scenario: No floating or stale Deno tags remain

- **WHEN** the Dockerfiles are grepped for `denoland/deno:`
- **THEN** every match is the exact tag `denoland/deno:debian-2.9.3` — no `debian-2.9.0`,
  minor-only, or `latest` tag remains

### Requirement: Deno 2.9.3 pinned in all CI workflows

Both CI workflows SHALL pin `denoland/setup-deno@v2` to `deno-version: v2.9.3` in every job that
sets up Deno:

- `.github/workflows/ci.yml` — the `quality` and `test` jobs (2 pins, currently `:17,76`).
- `.github/workflows/pr.yml` — the `check`, `test-unit`, `test-api`, and `test-web` jobs (4 pins,
  currently `:15,46,96,144`).

`.github/workflows/release.yml` SHALL NOT contain a `setup-deno` pin — it builds via the Docker
base images, so its Deno version flows from the Dockerfile pins.

**Reason:** The six CI pins are the surface that actually drifted (v2.9.0 while local dev ran
2.9.2) — Renovate never bumps the `deno-version` input (see the dependency-management renovate
requirement, which adds a customManager so this cannot silently drift again).

#### Scenario: CI runs on the same version as Docker

- **WHEN** `ci.yml` or `pr.yml` runs
- **THEN** every `setup-deno` step installs `v2.9.3`, matching the `debian-2.9.3` Docker base
  images (no CI/Docker drift)

#### Scenario: No stale CI version pins remain

- **WHEN** `ci.yml` and `pr.yml` are grepped for `deno-version:`
- **THEN** every occurrence is `v2.9.3` and no `v2.9.0` remains

### Requirement: Deno version parity across local, CI, and Docker

The Deno version SHALL be a single exact version stated identically across all pinned surfaces —
local development (`deno --version`, documented in README/tech-stack prose), both CI workflows'
`deno-version` inputs, and both Dockerfiles' base-image tags — currently `2.9.3`. Any future Deno
bump SHALL update ALL of these surfaces in one change; a partial bump (e.g. local upgraded, CI
pins stale) is a violation of this requirement, not routine drift.

**Reason:** The 2026-07-19 audit found three different versions in play at once (local 2.9.2, CI
v2.9.0, latest 2.9.3). d31 established pin parity between CI and Docker; wave 5 codifies the full
sync rule including the local/doc surface so the next drift is a spec violation with a grep-able
check, not a surprise.

#### Scenario: All surfaces state one version

- **WHEN** `deno --version` output, the six CI `deno-version` inputs, the five Docker `FROM`
  lines, and the README runtime prose are compared
- **THEN** they all state the same exact version (2.9.3 as of this change)

#### Scenario: A future bump moves everything together

- **WHEN** a later change bumps the Deno version on any one surface
- **THEN** the same change updates every other pinned surface, keeping the parity scenario green
