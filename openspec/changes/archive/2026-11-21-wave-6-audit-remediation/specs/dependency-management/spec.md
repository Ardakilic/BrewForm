## RENAMED Requirements

- FROM: `### Requirement: Renovate covers the catalog pins and the CI Deno version`
- TO: `### Requirement: Renovate and the workspace test cover the catalog, Node and pnpm pins`

## MODIFIED Requirements

### Requirement: Manifest floors and the lockfile reflect the latest compatible versions
Workspace dependency `^` floors SHALL be kept current with the versions resolved in `pnpm-lock.yaml`: a member `package.json` SHALL NOT declare a `^` floor lower than the version the lockfile resolves for that dependency, and when dependencies are refreshed the floors, the `pnpm-workspace.yaml` `catalog:` pins and the lockfile SHALL be updated together (never the lockfile alone), so the manifests remain an accurate statement of the installed versions.

Catalogued dependencies (`drizzle-orm`, `bcryptjs`, `zod`, `vite`, `vitest`, `drizzle-kit`, `typescript`) SHALL stay referenced via `"catalog:"` in every member that uses them; a refresh moves only the catalog's recorded versions.

#### Scenario: A floor never lags the lockfile
- **WHEN** any member manifest is compared to `pnpm-lock.yaml`
- **THEN** every `^` floor is less than or equal to the version resolved in the lockfile
- **AND** no dependency declares a stale floor below what is actually installed

#### Scenario: Catalog references survive a refresh
- **WHEN** a dependency refresh completes
- **THEN** every member still references the catalogued packages via `"catalog:"` (including `vitest` in `apps/web/package.json`)
- **AND** the root catalog records the new versions

### Requirement: The single lockfile is refreshed and frozen-installable
The single root `pnpm-lock.yaml` (lockfile format `lockfileVersion: '9.0'` under the pinned pnpm) SHALL be regenerated to the latest in-range versions on refresh and SHALL remain installable with `pnpm install --frozen-lockfile`, resolving every workspace member, every `workspace:*` link and every `"catalog:"` reference without an out-of-date-lockfile error; `make lockfile-update` SHALL regenerate it inside Docker so the host needs no pnpm.

#### Scenario: Frozen install succeeds on the refreshed lock
- **WHEN** `pnpm install --frozen-lockfile` runs against the refreshed `pnpm-lock.yaml` with the pinned pnpm
- **THEN** it installs exactly the recorded versions and completes with no error
- **AND** it does not rewrite the lockfile (a stale lock fails fast instead)

### Requirement: The web router runs react-router v8

The web application SHALL depend on `react-router` at `^8.0.0` (or newer within v8), and `react`/`react-dom`
SHALL declare a floor satisfying react-router v8's peer requirement (`>=19.2.7`). Imports of
`RouterProvider` SHALL use the v8-preferred `react-router/dom` subpath, while routing constructors and
hooks (`createBrowserRouter`, `createMemoryRouter`, `MemoryRouter`, `useLoaderData`, `useFetcher`,
`useNavigate`, `Link`, `LoaderFunctionArgs`, etc.) SHALL continue to import from `react-router`. No
`react-router-dom` package SHALL be introduced (the app never used it).

#### Scenario: Web app builds and tests pass on react-router v8

- **WHEN** `pnpm run build:web` (web `vite build`) and the web Vitest suite (`make test-web`) run after the bump
- **THEN** the web bundle builds and every routing test (those rendering via `RouterProvider` +
  `createMemoryRouter`/`MemoryRouter`) passes
- **AND** `react`/`react-dom` resolve to a version `>=19.2.7`

#### Scenario: RouterProvider is imported from react-router/dom

- **WHEN** `apps/web/src/App.tsx` and the routing test files are inspected
- **THEN** `RouterProvider` is imported from `react-router/dom`
- **AND** routing hooks/constructors/types remain imported from `react-router`

### Requirement: drizzle-kit tracks the latest stable 0.31 line
`drizzle-kit` SHALL be kept at its latest **stable** release on the `0.31` line with a single authoritative version source: the `drizzle-kit` entry of the `pnpm-workspace.yaml` `catalog:` (consumed by `packages/db/package.json` as `"drizzle-kit": "catalog:"`), resolved by `pnpm-lock.yaml`. The `@brewform/db` scripts (`generate`, `migrate`, `push`, `studio`, `build`) SHALL invoke the bare `drizzle-kit` binary of that devDependency, and the `Makefile`, `docker-entrypoint.sh` and the `Dockerfile` builder stage SHALL call those pnpm scripts rather than carrying a second version literal.

The `1.0` line (published only under `beta`/`rc` dist-tags) SHALL NOT be adopted while it is a pre-release, because the tool runs in the deployment entrypoint; a future `1.0` adoption is a separate, coordinated change.

#### Scenario: drizzle-kit has one version source
- **WHEN** the repository is searched for drizzle-kit version literals
- **THEN** the only one is the catalog entry in `pnpm-workspace.yaml`, and `pnpm run db:generate` runs the locked `0.31.x`

#### Scenario: No pre-release adopted
- **WHEN** the catalog and lockfile are inspected
- **THEN** no `1.0.0-rc` or `1.0.0-beta` version of drizzle-kit is referenced

### Requirement: Deployment pins are decoupled from application-dependency refreshes
A routine application-dependency refresh SHALL NOT alter the versions pinned by the deployment surface — the Node base image tag (`node:26.13.0-trixie-slim` in both Dockerfiles), the pnpm version (`packageManager`, `devEngines`, the Dockerfiles' global install and the workflows' `pnpm/action-setup`), `caddy:2.11.9-alpine`, the PostgreSQL image (`postgres:18-trixie` in the compose files, `postgres:18-alpine` as the CI service), `valkey/valkey:9.1-alpine`, and the `OPENAPI_ENABLED` / `openapi.json` contract. A change to any of these SHALL be raised as (or coordinated with) a deployment-focused change that updates the Dockerfiles, compose files, CI and the deployment guide together.

#### Scenario: A dependency refresh leaves deployment pins untouched
- **WHEN** an application-dependency refresh lands
- **THEN** the Dockerfiles' `FROM` lines, the compose image tags, the CI service image and the pnpm pins are byte-unchanged
- **AND** the deployment guide still matches every pinned version

### Requirement: Dependency-currency consistency is covered by a test
The workspace-integrity test (`packages/shared/src/workspace.test.ts`) SHALL guard dependency currency: it SHALL assert that no member manifest `^` floor is lower than the version resolved in `pnpm-lock.yaml`, that the adopted majors are reflected (`react-router` floor `^8.x`, `zod-openapi` floor `^6.x`), and that every catalogued dependency is referenced via `"catalog:"`. It SHALL import `describe`/`it`/`expect` from `vitest`, resolve file paths from `import.meta.url` (root-relative), assert by major rather than exact patch so routine bumps pass, and give every helper it introduces a docblock describing its purpose, parameters and return shape.

#### Scenario: A stale floor is caught
- **WHEN** a member manifest declares a `^` floor below the version `pnpm-lock.yaml` resolves for it
- **THEN** `packages/shared/src/workspace.test.ts` fails
- **AND** the failure names the offending dependency and the two versions

#### Scenario: Test runs under the shared package suite
- **WHEN** `pnpm run test:shared` (`make test-shared`) runs
- **THEN** the workspace test is included (it lives under `packages/shared/src/`) and passes on a consistent, current workspace

### Requirement: Renovate and the workspace test cover the catalog, Node and pnpm pins
Every version pin in the repository SHALL be watched by Renovate or asserted by the workspace test: Renovate's built-in `npm` manager covers `package.json` ranges, `pnpm-lock.yaml` and the `pnpm-workspace.yaml` `catalog:`; its `nvm` manager covers `.nvmrc`; its `dockerfile` and `docker-compose` managers cover the image tags; and the pnpm literals that no built-in manager reads (the Dockerfiles' `npm install -g pnpm@<version>` and the workflows' `pnpm/action-setup` `version:` inputs) SHALL either be covered by a `customManagers` regex entry in `renovate.json` or be asserted equal to `packageManager` by `packages/shared/src/workspace.test.ts`.

`renovate.json` comments SHALL describe the current managers only.

**Reason:** A pin that no tool watches drifts silently. The runtime and package-manager pins live in five kinds of file; the workspace test makes a missed bump fail CI instead of shipping inconsistent images.

#### Scenario: A pnpm bump updates every pin or fails CI
- **WHEN** Renovate bumps `packageManager` to a new pnpm version
- **THEN** the same PR updates the Dockerfiles and workflows through the custom manager, or `workspace.test.ts` fails until they are updated

#### Scenario: Catalog bump is proposed by Renovate
- **WHEN** a new `zod`, `drizzle-orm` or `vite` version is published
- **THEN** Renovate opens a PR that edits the `pnpm-workspace.yaml` catalog entry and the lockfile

## REMOVED Requirements

### Requirement: The wave-5 safe batch moves every flagged dependency to its verified target
**Reason**: One-off, completed change history: the wave-5 batch (hono 4.12.30, vitest 4.1.10, vite 8.1.5, react-router 8.2.0, …) landed on 2026-07-27 and every listed version has since been superseded by later refreshes (#156, #162, #164). Its verification commands referred to the removed runtime's outdated-scan and task runner.
**Migration**: Future refreshes follow "Manifest floors and the lockfile reflect the latest compatible versions", "Deployment pins are decoupled from application-dependency refreshes" and the Renovate requirement; the per-batch evidence lives in each refresh PR. The historical table remains in `openspec/changes/archive/2026-07-27-wave-5-debt-clearance/`.

### Requirement: TypeScript 7 adoption is gated by a verification protocol with an explicit defer path
**Reason**: The gate has been passed: TypeScript 7 is adopted repo-wide (`typescript: 7.0.2` in the `pnpm-workspace.yaml` catalog, used by all four members' `tsc --noEmit` `check` scripts), and the protocol's steps depended on running the compiler through the removed runtime's npm-compatibility layer.
**Migration**: Future compiler majors are ordinary catalog refreshes verified by `pnpm run check` across all members; no special gate remains.
