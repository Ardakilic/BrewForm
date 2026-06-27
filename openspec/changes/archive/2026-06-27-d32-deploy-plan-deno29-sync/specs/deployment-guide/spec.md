# Deployment Guide

The operator deployment guide (`coolify_deployment_plan.md`) is the canonical instructions for
self-hosting BrewForm on Coolify. It must stay consistent with the build/runtime reality that `d31`
established, so an operator copy-pasting from it runs exactly what the images run.

## ADDED Requirements

### Requirement: Guide pins drizzle-kit consistently with the codebase

The deployment guide SHALL reference `npm:drizzle-kit@0.31` for the migrate and generate commands,
matching the pin used by `Makefile` (`DRIZZLE_KIT`), the `Dockerfile` builder stage, and
`docker-entrypoint.sh`. The guide SHALL NOT pin a different drizzle-kit version (e.g. `@0.31.10`)
than the one the images actually run.

#### Scenario: Operator commands match image behavior

- **WHEN** an operator copies a `drizzle-kit` migrate or generate command from the guide
- **THEN** the version pin equals the codebase pin (`npm:drizzle-kit@0.31`)
- **AND** running it reproduces the migration the image's entrypoint runs

### Requirement: Guide reflects the pinned Deno 2.9.0 runtime

The deployment guide SHALL state that the runtime is pinned to Deno **2.9.0** and that both images
build from `denoland/deno:debian-2.9.0`. The prerequisites / pre-flight section SHALL surface this
version so an operator validating the build environment knows the expected runtime.

#### Scenario: Runtime version is discoverable in the guide

- **WHEN** an operator reads the prerequisites / pre-flight section
- **THEN** the pinned Deno runtime version (2.9.0) and the `denoland/deno:debian-2.9.0` base images
  are stated

### Requirement: Guide reflects the deno ci install and the workspace layout

The deployment guide SHALL describe dependency installation in Docker `deps` stages and CI as
`deno ci` (a frozen, lockfile-strict install), not `deno install`, wherever it covers building or
rebuilding images. Where the guide describes the migrate/seed steps, it SHALL note that they run
inside the Deno workspace (root `deno.json` `workspace.members` = `apps/*`, `packages/*`) and that
the `cd packages/db && deno run -A npm:drizzle-kit@0.31 …` form is correct under that layout.

#### Scenario: Build instructions reference deno ci

- **WHEN** an operator reads the image build/rebuild or maintenance instructions
- **THEN** they describe installs as `deno ci` (frozen), consistent with the Dockerfiles and CI

#### Scenario: Migrate/seed steps acknowledge the workspace

- **WHEN** an operator reads the first-deploy migrate/seed steps
- **THEN** the guide notes the workspace layout and that the `packages/db` migrate/seed commands run
  correctly within it

### Requirement: Guide retains the required unstable runtime flags

The deployment guide SHALL continue to show `--unstable-cron` and `--unstable-kv` on the API start
command, because `Deno.cron` and Deno KV remain unstable on Deno 2.9 and require those flags (or the
`deno.json` `"unstable"` array). The guide SHALL note this so the flags are not mistakenly removed
as obsolete.

#### Scenario: Unstable flags are preserved with rationale

- **WHEN** a reader reviews the API start command in the guide
- **THEN** `--unstable-cron` and `--unstable-kv` are present
- **AND** a note explains they are still required on Deno 2.9

### Requirement: Guide reflects that shipped codebase prerequisites are implemented

The deployment guide's §2 "Codebase prerequisites" table SHALL NOT mark prerequisites that have
already shipped as "Not yet implemented". The D30 deployment infra (Dockerfiles, entrypoint,
`compose.yml` prod profile, `release.yml`, split `.env.example` files) and the D31 runtime upgrade
shipped on `main` (D30 = commit `8a07857`, D31 = `eaffcdf`), so their rows SHALL show an
implemented/done status.

#### Scenario: Shipped prerequisites are not flagged as pending

- **WHEN** an operator reads the §2 codebase-prerequisites table
- **THEN** the rows for the shipped D30/D31 infra show an implemented status
- **AND** none of them read "Not yet implemented"

### Requirement: Guide aligns the Caddy image pin

The deployment guide SHALL reference the web image's Caddy base as `caddy:2.11.4-alpine`, matching
`Dockerfile.web` and the pinned compose preview service, rather than a floating `caddy:2-alpine`
tag.

#### Scenario: Caddy reference matches the pinned base

- **WHEN** an operator reads the §2 web-Dockerfile prerequisite row
- **THEN** it references `caddy:2.11.4-alpine`
- **AND** it does not reference a floating `caddy:2-alpine` tag
