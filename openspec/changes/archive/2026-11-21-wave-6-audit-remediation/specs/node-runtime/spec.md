## ADDED Requirements

### Requirement: Node 26 LTS is pinned consistently on every runtime surface
The API, workspace scripts, CI jobs and container images SHALL run on Node 26 LTS, pinned consistently: `.nvmrc` contains `26`, the root `package.json` declares `engines.node` and `devEngines.runtime.version` as `^26.13.0`, every stage of `Dockerfile` and `Dockerfile.web` that runs Node uses the exact tag `node:26.13.0-trixie-slim` (never a floating `node:26` or `node:lts` tag), and every `actions/setup-node` step in `.github/workflows/*.yml` reads `node-version-file: '.nvmrc'` instead of a literal version.

A runtime upgrade SHALL move all of these pins in one change, and the workspace-integrity test SHALL fail when they disagree.

#### Scenario: Runtime pins agree
- **WHEN** `packages/shared/src/workspace.test.ts` runs
- **THEN** it asserts `.nvmrc` pins major 26, `engines.node` and `devEngines.runtime.version` share that major, and both Dockerfiles build from a `node:26.<minor>.<patch>-trixie-slim` tag
- **AND** it fails, naming the offending file, when any one of them drifts

#### Scenario: CI derives the Node version from .nvmrc
- **WHEN** every `actions/setup-node` step under `.github/workflows/` is inspected
- **THEN** each uses `node-version-file: '.nvmrc'` and none declares a `node-version:` literal

### Requirement: TypeScript runs directly from source with erasable syntax only
The API and every workspace script (dev server, container entrypoint, seed, email-template build, `scripts/*`) SHALL execute TypeScript sources directly, with no compile-to-`dist` step — in development through `tsx` (`tsx --watch src/main.ts` for `pnpm --filter @brewform/api run dev`), in the container through the Node invocation defined by the container-deployment capability (Node 26 native type stripping, with `node --import tsx` as the documented fallback), and for seed and email-template builds through `tsx` — and all source SHALL be restricted to erasable TypeScript syntax by the root `tsconfig.json` (`erasableSyntaxOnly: true`, `verbatimModuleSyntax: true`, `rewriteRelativeImportExtensions: true`, `noEmit: true`, `strict: true`).

Relative imports SHALL carry explicit `.ts`/`.tsx` extensions. Dependency-free repository tooling under `scripts/` SHALL run with plain `node <file>.ts` (native type stripping, `node:` built-ins only) so CI can run it without installing dependencies.

#### Scenario: Non-erasable syntax is rejected by the type-check
- **WHEN** a production file introduces a TypeScript `enum`, a `namespace` with runtime code, or a constructor parameter property
- **THEN** `pnpm run check` (`make check`) fails with an `erasableSyntaxOnly` diagnostic

#### Scenario: API dev server starts through tsx
- **WHEN** `make dev-api` starts the `app` compose service
- **THEN** the container runs `pnpm --filter @brewform/api run dev`, which executes `tsx --watch src/main.ts`, and the server answers `GET /health` on port 8000

### Requirement: The Hono app boots on @hono/node-server behind an import guard
The API SHALL serve the Hono app with `@hono/node-server` (`serve({ fetch: app.fetch, port: config.APP_PORT })`), SHALL export `app` from `apps/api/src/main.ts`, and SHALL only call the startup routine inside an `if (import.meta.main)` guard, so tests and tooling can import the app or the route tree without opening a port.

On `SIGTERM` or `SIGINT` the process SHALL first mark itself as shutting down (so `GET /ready` returns `503`, as defined by the production-operations capability), then close the HTTP server, end the postgres-js client, close the email transporter and close the active cache provider (when it exposes `close`), log each step, and exit with code 0. A second signal received during shutdown SHALL be ignored.

#### Scenario: Importing the app does not listen
- **WHEN** a Vitest file imports `app` from `apps/api/src/main.ts` and calls `app.request('/health')`
- **THEN** a response is returned and no TCP listener is opened

#### Scenario: Graceful shutdown closes every resource
- **WHEN** the running API receives `SIGTERM`
- **THEN** readiness reports `shuttingDown: true` before the HTTP server closes, and the logs show the HTTP server, database connection, email transporter and cache connection closing, in that order
- **AND** the process exits with code 0, and a second `SIGTERM` during shutdown does not run the sequence again

### Requirement: Configuration comes from process.env validated by Zod
The API SHALL load configuration from `process.env` (populated by `import 'dotenv/config'` in local development and by the container environment in production) and SHALL validate it once at startup with the Zod schema in `apps/api/src/config/env.ts`; an invalid or missing required variable SHALL terminate the process with a non-zero exit code and a descriptive error that never prints secret values.

#### Scenario: Missing JWT secret aborts startup
- **WHEN** the API starts without `JWT_SECRET`
- **THEN** startup fails with a validation error naming `JWT_SECRET`
- **AND** the process exits non-zero before opening a port

### Requirement: Background jobs run in-process on node-cron
Scheduled work SHALL run in-process through `node-cron`: hourly badge evaluation is registered as `cron.schedule('0 * * * *', …, { name: 'evaluate-badges' })` in `apps/api/src/utils/jobs/cron.ts`, which `main.ts` imports, and every job handler SHALL catch and log its own errors so a failing run never tears down the scheduler.

Because the scheduler runs inside every API process, `docs/architecture.md` and the deployment guide SHALL state that each replica fires every job; a job whose side effects must happen exactly once SHALL take a shared lock (for example `SET key value NX PX` on the Redis-protocol store when `CACHE_DRIVER=redis`) or the deployment SHALL run a single API replica.

#### Scenario: Hourly badge job fires once per process
- **WHEN** the scheduler ticks at minute 0
- **THEN** `evaluateAllBadges` runs once in that process and its failure is logged at error level without stopping later ticks

#### Scenario: Replica behaviour is documented
- **WHEN** `docs/architecture.md` "Background Jobs" and the deployment guide's scaling notes are read
- **THEN** both state that in-process jobs fire in every replica and name the exactly-once options

### Requirement: No artefacts of the removed Deno runtime remain in code or configuration
The repository SHALL contain no artefacts of the removed Deno runtime outside the doc-drift allowlist: no `deno.json`, `deno.jsonc`, `deno.lock` or `.deno-version` files; no `Deno.*` API calls; no `jsr:` or `npm:` import specifiers; no `deno-lint-ignore` directives; no `denoland/` images; no `DENO_*` environment variables; no `--unstable-*` runtime flags; and no comments describing the Deno toolchain as current, across `apps/`, `packages/`, `scripts/`, `Dockerfile*`, `compose*.yml`, `.github/`, `Makefile`, `.githooks/`, `pnpm-workspace.yaml`, `renovate.json`, `docker-*.sh` and the `.env*.example` files.

Test files whose purpose is to assert the absence of these artefacts (`packages/shared/src/workspace.test.ts`, `packages/shared/src/compose-config.test.ts`, `apps/api/src/config/env.test.ts`, `apps/api/src/utils/cache/cache.test.ts`) are the only permitted code-side mentions and SHALL be listed in the doc-drift allowlist with that justification.

#### Scenario: Remnant scan is clean
- **WHEN** `node scripts/doc-drift-check.ts` runs its code-remnant scan over the paths above
- **THEN** it reports zero matches outside the allowlisted negative-assertion tests

#### Scenario: Deno-era files stay deleted
- **WHEN** `packages/shared/src/workspace.test.ts` runs
- **THEN** its "no Deno-era files remain" assertion passes (no `deno.json`, `deno.lock` or `.deno-version` at the root or in any workspace)
