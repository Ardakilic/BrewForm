# local-dev-environment Specification

## Purpose
TBD - created by archiving change d32-deploy-plan-deno29-sync. Update Purpose after archive.
## Requirements
### Requirement: Compose image references are version-pinned for reproducibility

The Compose preview `web` service SHALL pin its Caddy image to the same version the published web
image uses (`caddy:2.11.9-alpine`, matching `Dockerfile.web`), rather than a floating
`caddy:2-alpine` tag, so `make preview` exercises the same Caddy as production.

#### Scenario: Preview Caddy matches the production pin

- **WHEN** the preview `web` service image in `compose.yml` is compared with the `Dockerfile.web`
  runner base image
- **THEN** both reference `caddy:2.11.9-alpine`
- **AND** the preview service does not use a floating `caddy:2-alpine` tag

### Requirement: Compose configuration drift is covered by a test
A test SHALL assert the local-dev compose invariants so they cannot silently regress: the `app` and `web-dev` services mount the `node_modules` named volume at `/app/node_modules` and build from `target: deps`, they run the API and web dev servers through pnpm workspace filters (`@brewform/api` → `tsx --watch`, `@brewform/web` → `vite`), no artefact of a previous toolchain (cache volume, key-value sidecar, environment variables or run commands) is present, and the preview Caddy image is pinned to the same tag as `Dockerfile.web` (`caddy:2.11.9-alpine`).

The test SHALL be hermetic and dependency-free (text-based assertions over `compose.yml` and the member `package.json` files, not a YAML parser), SHALL resolve paths from `import.meta.url` so it passes regardless of the working directory, SHALL import `describe`/`it`/`expect` from `vitest`, and SHALL live at `packages/shared/src/compose-config.test.ts` so it runs in the shared-package suite.

#### Scenario: Removing the node_modules mount fails the test
- **WHEN** a `compose.yml` edit removes `node_modules:/app/node_modules` from a dev service or floats the preview Caddy back to `caddy:2-alpine`
- **THEN** the compose-config test fails
- **AND** the failure message identifies the offending invariant

### Requirement: Dev containers keep dependencies in a named node_modules volume
The Compose dev services (`app` and `web-dev`) SHALL mount the `node_modules` named volume at `/app/node_modules`, layered over the source bind mount, so the packages installed by `pnpm install --frozen-lockfile` inside the Linux container (including native bindings such as `rolldown` and `esbuild`) are never shadowed by the host checkout and survive container recreation.

No cache or dependency volume belonging to a previous toolchain SHALL remain in `compose.yml`, and the dev services SHALL build from the `deps` stage of `Dockerfile` (`target: deps`), which installs the pinned pnpm on the pinned Node image.

#### Scenario: Dependencies survive container recreation
- **WHEN** a developer runs `make dev`, stops it with `make down`, and runs `make dev` again without changing `pnpm-lock.yaml`
- **THEN** the second start reuses the `node_modules` volume and no full dependency re-install occurs

#### Scenario: Mount path is the container workspace
- **WHEN** the `app` and `web-dev` service volumes in `compose.yml` are inspected
- **THEN** each mounts `node_modules:/app/node_modules` and builds with `target: deps`

