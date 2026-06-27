# Local Development Environment

The Docker Compose dev profile is the canonical local environment (all `make` targets run Deno
inside these containers). Its Deno dependency cache must persist across container recreation, and
its image references must be pinned for parity with the published production images.

## ADDED Requirements

### Requirement: Dev containers persist the Deno cache at the image DENO_DIR

The Compose dev services (`app` and `web-dev`) SHALL mount the `deno_cache` named volume at the
path the base image uses for `DENO_DIR` (`/deno-dir`), not the upstream default `/root/.cache/deno`.
The `denoland/deno:debian` image sets `DENO_DIR=/deno-dir`, so a volume mounted anywhere else holds
no cache and dependencies are re-fetched on every container recreation. No `DENO_DIR` environment
override is introduced; the image default remains the single source of truth, matching the
`Dockerfile`/`Dockerfile.web` `COPY … /deno-dir /deno-dir` stage copies.

#### Scenario: Cache survives container recreation

- **WHEN** a developer runs `make up`/`make dev`, lets dependencies cache, then runs `make down`
  followed by `make up` again
- **THEN** the second start reuses the `deno_cache` volume contents from `/deno-dir`
- **AND** no full dependency re-fetch occurs

#### Scenario: Dev mount path matches the image DENO_DIR

- **WHEN** the `app` and `web-dev` service volume mounts in `compose.yml` are inspected
- **THEN** each mounts `deno_cache` at `/deno-dir`
- **AND** neither mounts `deno_cache` at `/root/.cache/deno`

### Requirement: Compose image references are version-pinned for reproducibility

The Compose preview `web` service SHALL pin its Caddy image to the same version the published web
image uses (`caddy:2.11.4-alpine`, matching `Dockerfile.web`), rather than a floating
`caddy:2-alpine` tag, so `make preview` exercises the same Caddy as production.

#### Scenario: Preview Caddy matches the production pin

- **WHEN** the preview `web` service image in `compose.yml` is compared with the `Dockerfile.web`
  runner base image
- **THEN** both reference `caddy:2.11.4-alpine`
- **AND** the preview service does not use a floating `caddy:2-alpine` tag

### Requirement: Compose configuration drift is covered by a test

A test SHALL assert the local-dev compose invariants so they cannot silently regress: the dev
`deno_cache` volume mounts at `/deno-dir`, the old `/root/.cache/deno` mount is absent, and the
preview Caddy image is pinned to `caddy:2.11.4-alpine`. The test SHALL be hermetic and
dependency-free (text-based assertions over the `compose.yml` contents, not a YAML parser), SHALL
resolve `compose.yml` from `import.meta.url` so it passes regardless of the test working directory,
and SHALL follow the repo's BDD convention (`jsr:@std/testing/bdd` + `jsr:@std/expect`). It SHALL
live under `packages/shared/src/` so it runs in the existing shared-package test suite.

#### Scenario: Reverting the cache mount fails the test

- **WHEN** a `compose.yml` edit restores `deno_cache:/root/.cache/deno` or floats the preview Caddy
  back to `caddy:2-alpine`
- **THEN** the compose-config test fails
- **AND** the failure message identifies the offending invariant
