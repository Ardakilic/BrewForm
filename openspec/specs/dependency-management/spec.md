# dependency-management Specification

## Purpose
TBD - created by archiving change d33-dependency-refresh. Update Purpose after archive.
## Requirements
### Requirement: Manifest floors and the lockfile reflect the latest compatible versions

Workspace dependency `^` floors SHALL be kept current with the resolved `deno.lock` versions: a
member `package.json` (or the root `deno.json` `catalog`) SHALL NOT declare a `^` floor lower than the
version `deno.lock` actually resolves for that dependency. When dependencies are refreshed, both the
floors and the lockfile SHALL be updated together (not the lockfile alone), so the manifests remain an
accurate statement of the current versions. The refresh SHALL preserve the d31 catalog: shared deps
(`drizzle-orm`, `bcryptjs`, `zod`) stay referenced via `"catalog:"`, and only the catalog's recorded
ranges move forward.

#### Scenario: A floor never lags the lockfile

- **WHEN** any member manifest or the root catalog is compared to `deno.lock`
- **THEN** every `^` floor is less-than-or-equal to the version resolved in the lockfile
- **AND** no dependency declares a stale floor below what is actually installed

#### Scenario: Catalog references survive the refresh

- **WHEN** the dependency refresh completes
- **THEN** `apps/api`, `packages/db`, and `packages/shared` still reference `drizzle-orm`/`bcryptjs`/`zod`
  via `"catalog:"`
- **AND** the root catalog records the new (current) ranges, not the pre-refresh ones

### Requirement: The single lockfile is refreshed and frozen-installable

The single root `deno.lock` SHALL be regenerated to the latest in-range versions and SHALL remain
installable under `deno ci` (a frozen, lockfile-strict install) without error. The lockfile format
SHALL stay version `"5"` (Deno 2.9 does not bump it). After the refresh, `deno ci` SHALL resolve every
workspace member and every `"catalog:"` reference with no unresolved-dependency or out-of-date-lock
error.

#### Scenario: Frozen install succeeds on the refreshed lock

- **WHEN** `deno ci` runs against the refreshed `deno.lock` on Deno 2.9.0
- **THEN** it installs exactly the recorded versions and completes with no error
- **AND** it does not silently rewrite the lockfile (a stale lock would fail fast instead)

### Requirement: The web router runs react-router v8

The web application SHALL depend on `react-router` at `^8.0.0` (or newer within v8), and `react`/`react-dom`
SHALL declare a floor satisfying react-router v8's peer requirement (`>=19.2.7`). Imports of
`RouterProvider` SHALL use the v8-preferred `react-router/dom` subpath, while routing constructors and
hooks (`createBrowserRouter`, `createMemoryRouter`, `MemoryRouter`, `useLoaderData`, `useFetcher`,
`useNavigate`, `Link`, `LoaderFunctionArgs`, etc.) SHALL continue to import from `react-router`. No
`react-router-dom` package SHALL be introduced (the app never used it).

#### Scenario: Web app builds and tests pass on react-router v8

- **WHEN** `deno task build` (web `vite build`) and the web `vitest` suite run after the bump
- **THEN** the web bundle builds and every routing test (those rendering via `RouterProvider` +
  `createMemoryRouter`/`MemoryRouter`) passes
- **AND** `react`/`react-dom` resolve to a version `>=19.2.7`

#### Scenario: RouterProvider is imported from react-router/dom

- **WHEN** `apps/web/src/App.tsx` and the routing test files are inspected
- **THEN** `RouterProvider` is imported from `react-router/dom`
- **AND** routing hooks/constructors/types remain imported from `react-router`

### Requirement: The API OpenAPI layer runs zod-openapi v6

The shared package SHALL depend on `zod-openapi` at `^6.0.0` (or newer within v6). `zod-openapi` is
consumed **transitively** — our plain Zod schemas flow through `hono-openapi`'s
`resolver()`/`describeRoute()`, which calls `toOpenAPISchema()`, which routes to
`@standard-community/standard-openapi`, which dynamically imports `zod-openapi`'s `createSchema()` to
convert each schema — so no source file imports `zod-openapi` directly, and no `hono-openapi` bump is
required (it declares no dependency on `zod-openapi`). The generated OpenAPI document SHALL remain
OpenAPI **3.1.0**: the version field is set by `hono-openapi`, not by `zod-openapi`, and v6's only
runtime breaking change (`createDocument()` emitting OAS 3.2.0) is never on this path because
`standard-openapi` calls `createSchema()`, not `createDocument()`. The `OPENAPI_ENABLED` gating of
`GET /api/v1/openapi.json` SHALL be unchanged. Documentation that referenced "zod-openapi v5" (the two
`packages/shared/src` schema doc-comments and `AGENTS.md`) SHALL be updated to v6, preserving the
still-valid `zod-openapi/extend` guidance.

#### Scenario: OpenAPI generation is unchanged under v6

- **WHEN** `apps/api/src/routes/openapi.coverage.test.ts` runs after the bump
- **THEN** the generated document still reports `openapi: "3.1.0"` and every path schema resolves
- **AND** no unresolved `{ vendor: 'zod' }` stub appears in the output

#### Scenario: zod-openapi is exercised through the hono-openapi pipeline

- **WHEN** the OpenAPI document is generated for a route whose response uses a `resolver()`-wrapped Zod schema
- **THEN** `zod-openapi`'s `createSchema()` (v6) converts the schema to OpenAPI JSON Schema via standard-openapi
- **AND** the resolved schema appears in the document with no `{ vendor: 'zod' }` placeholder

#### Scenario: v5 references are refreshed

- **WHEN** the shared schema doc-comments and `AGENTS.md` are inspected
- **THEN** they reference `zod-openapi` v6 (not v5)
- **AND** the guidance not to `import 'zod-openapi/extend'` is retained (re-verified for v6)

### Requirement: drizzle-kit tracks the latest stable 0.31 line

`drizzle-kit` SHALL be kept current at its latest **stable** release on the `0.31` line
(`0.31.10` as of 2026-06-27): `packages/db/package.json` SHALL declare `^0.31.10`, and the lockfile
SHALL resolve `drizzle-kit` to that version. The `drizzle-kit` `1.0.0` line (published only as
`beta`/`rc` dist-tags) SHALL NOT be adopted — it is a pre-release, and the tool runs in the deployment
entrypoint. Because the `@0.31` minor-line pins (`packages/db/deno.json` tasks, `Makefile`
`DRIZZLE_KIT`, `docker-entrypoint.sh`, the Dockerfile builder, and the deployment guide) already
resolve to the latest `0.31.x`, those pin strings SHALL remain unchanged. A future `1.0` adoption is a
separate, coordinated change that must update all pinned surfaces together.

#### Scenario: drizzle-kit is current but the pin strings are stable

- **WHEN** the drizzle-kit version is compared across `packages/db/package.json`, the deno.json tasks,
  `Makefile`, `docker-entrypoint.sh`, and the deployment guide
- **THEN** `packages/db/package.json` declares `^0.31.10` and the lock resolves `0.31.10`
- **AND** the `@0.31` minor-line pins are unchanged (they already resolve to `0.31.10`)
- **AND** no `1.0.0-rc`/`1.0.0-beta` pre-release pin has been introduced anywhere

### Requirement: Deployment pins are decoupled from application-dependency refreshes

A routine application-dependency refresh SHALL NOT alter the versions pinned by the deployment surface —
the Deno runtime (2.9.0), `drizzle-kit@0.31`, `denokv:0.14.0`, `caddy:2.11.4-alpine`, `postgres:18`, the
`--unstable-cron`/`--unstable-kv` flags, and the `OPENAPI_ENABLED`/`openapi.json` contract. Consequently
this change SHALL make no edits to `coolify_deployment_plan.md` or the `deployment-guide` spec. Any future
refresh that *does* need to touch a deployment-pinned version SHALL be raised as (or coordinated with) a
deployment-focused change, not folded silently into a dependency bump.

#### Scenario: The deployment plan is unchanged by the refresh

- **WHEN** the dependency refresh lands
- **THEN** `coolify_deployment_plan.md` and the `deployment-guide` spec are byte-unchanged
- **AND** every version they pin still matches the codebase (Deno 2.9.0, `drizzle-kit@0.31`,
  `denokv:0.14.0`, `caddy:2.11.4-alpine`, `postgres:18`)

### Requirement: Dependency-currency consistency is covered by a test

The workspace-integrity test (`packages/shared/src/workspace.test.ts`, established by d31) SHALL be
extended to guard dependency currency: it SHALL assert that no member manifest `^` floor is lower than
the version resolved in `deno.lock`, and that the two adopted majors are reflected (`react-router` floor
`^8.x`, `zod-openapi` floor `^6.x`). The test SHALL keep the repo's BDD convention (`jsr:@std/testing/bdd`
+ `jsr:@std/expect`), resolve config/lock paths from `import.meta.url` (root-relative), assert by major
(not exact patch, to survive routine bumps), and any new helper it introduces SHALL carry a docblock
describing its purpose, parameters, and return shape.

#### Scenario: A stale floor is caught

- **WHEN** a member manifest declares a `^` floor below the version `deno.lock` resolves for it
- **THEN** `packages/shared/src/workspace.test.ts` fails
- **AND** the failure names the offending dependency and the two versions

#### Scenario: Test runs under the shared package suite

- **WHEN** `deno task test:shared` runs
- **THEN** the extended `workspace.test.ts` is included (it lives under the `test.include` path
  `packages/shared/src/`) and passes on a consistent, current workspace

