# deno-workspace-management Specification

## Purpose
TBD - created by archiving change d31-deno-29-upgrade. Update Purpose after archive.
## Requirements
### Requirement: Shared npm dependency versions are centralized in a root catalog

The root `deno.json` SHALL define a `catalog` mapping recording the existing ranges of the npm
dependencies duplicated across members:

```jsonc
"catalog": {
  "drizzle-orm": "^0.45.0",
  "bcryptjs": "^3.0.0",
  "zod": "^4.0.0"
}
```

Member `package.json` files SHALL reference the catalog via the `"catalog:"` protocol for those
dependencies:

- `apps/api/package.json` — `drizzle-orm`, `zod`, `bcryptjs` → `"catalog:"`
- `packages/db/package.json` — `drizzle-orm`, `bcryptjs` → `"catalog:"`
- `packages/shared/package.json` — `zod` → `"catalog:"`

The catalog SHALL be defined only at the workspace root (defining `catalog` in a member is
invalid). The catalog SHALL record the EXISTING ranges — it does not change any dependency
version. Dependencies that are not duplicated across members (e.g. `hono`, `postgres`,
`zod-openapi`) SHALL NOT be moved into the catalog.

#### Scenario: A single edit changes the version for all members

- **WHEN** the `drizzle-orm` range is changed once in the root `deno.json` `catalog`
- **THEN** both `apps/api` and `packages/db` (which reference `"catalog:"`) resolve to the new range
- **AND** there is no second place to edit (no per-member `drizzle-orm` version string)

#### Scenario: Catalog references resolve under frozen install

- **WHEN** `deno ci` runs against the lockfile on 2.9.0
- **THEN** every member `"catalog:"` reference resolves to its root-catalog range
- **AND** the install completes with no unresolved-catalog error

#### Scenario: JSR dependencies stay explicit

- **WHEN** the member `package.json` `devDependencies` are inspected
- **THEN** `@std/testing` and `@std/expect` retain their explicit `jsr:@std/...` specifiers
- **AND** they are NOT referenced via `"catalog:"` (which cannot carry the `jsr:` prefix)

### Requirement: Each workspace member declares a version

Each member `deno.json` SHALL declare a `version` field (initially `0.1.0`) so `deno bump-version`
can manage member versions. This applies to all four members: `apps/api`, `apps/web`,
`packages/shared`, and `packages/db`. The members are not published; the version is a
release/hygiene signal.

#### Scenario: Members carry a version

- **WHEN** any member `deno.json` is inspected
- **THEN** it has both a `name` and a `version`

### Requirement: Root tasks expose version bumping

The root `deno.json` `tasks` SHALL include version-bump tasks backed by `deno bump-version`:

- `bump:dry-run` → `deno bump-version --base=main --dry-run`
- `bump:patch` → `deno bump-version patch`
- `bump:minor` → `deno bump-version minor`

#### Scenario: Dry-run reports members without writing

- **WHEN** `deno task bump:dry-run` runs
- **THEN** it reports the workspace members and the prospective version changes
- **AND** no `version` field is modified on disk

### Requirement: CI and Docker install via `deno ci`

CI workflows and the Docker `deps` stages SHALL install dependencies with `deno ci` (a frozen,
lockfile-strict install that wipes `node_modules` and installs strictly from `deno.lock`):

- `.github/workflows/ci.yml` — `deno install` → `deno ci`
- `.github/workflows/pr.yml` — `deno install --frozen` → `deno ci` (all install sites)
- `Dockerfile` `deps` stage — `deno install --frozen` → `deno ci`
- `Dockerfile.web` `deps` stage — `deno install --frozen` → `deno ci`

The `Makefile` SHALL retain `deno install --frozen` for local development (a non-destructive
install). `deno ci` errors if `deno.lock` is missing or out of date with the config, giving CI a
hard determinism guarantee.

#### Scenario: CI install is deterministic

- **WHEN** a CI job runs `deno ci`
- **THEN** it installs exactly the versions recorded in `deno.lock`
- **AND** it fails fast if the lockfile is out of date (rather than silently updating it)

#### Scenario: Local dev install is non-destructive

- **WHEN** a contributor runs a Makefile install target
- **THEN** it uses `deno install --frozen` (does not wipe `node_modules`)

### Requirement: API runtime image boots correctly on Deno 2.9.0

The `Dockerfile` `runner` stage SHALL produce an API image that completes its full entrypoint
sequence — `drizzle-kit migrate` → first-boot seed (or skip) → `Deno.serve` start — on the
`denoland/deno:debian-2.9.0` base, with `GET /health` returning 200. A `deno ci --prod` slim MAY
replace d30's `COPY --from=builder /app .` runner ONLY if it measurably reduces the image by
excluding devDependencies from `node_modules`. On 2.9.0 `deno ci --prod` did NOT exclude
devDependencies for this hybrid Deno+npm workspace — the `--prod` image's `node_modules` stayed
~347 MB with `drizzle-kit`/`mjml`/`vite`/`vitest` present as resolvable symlinks — so the flag's
stated mechanism is a no-op here, and the runner SHALL retain d30's `COPY --from=builder /app .`
form (version-pin only). The version pin and the `deps`-stage `deno ci` swap stand independently of
this decision. The entrypoint, `EXPOSE 8000`, the `/deno-dir` cache copy, and the `ENTRYPOINT` SHALL
remain as d30 defined them.

#### Scenario: Runtime image migrates, seeds, and boots on 2.9.0

- **WHEN** the API image (d30's full-copy runner on the 2.9.0 base) is built and run against a Postgres instance
- **THEN** the entrypoint runs `drizzle-kit migrate` successfully (resolved from the `/deno-dir` cache)
- **AND** the first-boot seed runs (or is correctly skipped when the DB already has users)
- **AND** the API starts and `GET /health` returns 200 with body `{"status":"ok"}`

#### Scenario: `deno ci --prod` slim is not adopted on 2.9.0

- **WHEN** `deno ci --prod` is run for this workspace on 2.9.0
- **THEN** devDependencies (`drizzle-kit`, `mjml`, `vite`, `vitest`) remain in `node_modules` (the flag yields no size reduction)
- **AND** the runner therefore retains d30's `COPY --from=builder /app .` form (version-pin only)

### Requirement: Op and resource test sanitizers are re-enabled

The root `deno.json` `test` block SHALL set `"sanitizeOps": true` and `"sanitizeResources": true`
to opt back into the op/resource sanitizers (which default to OFF since Deno 2.8). The sanitizers
SHALL be enforced for the suites that actually run them — including the member-scoped tasks
(`deno task --cwd <member> test`), which use the member `deno.json` as the active config: if those
runs do not inherit the root `test` sanitizer settings on 2.9.0, the sanitizer fields SHALL also be
added to each member `deno.json` `test` block (or `--sanitize-ops --sanitize-resources` added to the
member `test` tasks). Individual tests MAY override these per-test for legitimate by-design leaks;
the global setting SHALL NOT be disabled to accommodate a single leaking test. If the api/db leak
surface is too large to resolve in this change, sanitizers MAY be scoped to `packages/shared` and the
api/db sanitizers deferred to a follow-up.

#### Scenario: Leaked resources fail the suite

- **WHEN** a test leaves an async op or resource (e.g. an unclosed connection) open at completion
- **THEN** the sanitizer reports the leak and the test fails
- **AND** the fix is to close the resource (or override on that specific test if the leak is by
  design), not to disable the global setting

### Requirement: Workspace integrity is covered by a test

A test (`packages/shared/src/workspace.test.ts`) SHALL assert the workspace's configuration
integrity:

- Each of the four members declares both `name` and `version` in its `deno.json`.
- The root `catalog` is internally consistent, and every member `"catalog:"` reference maps to a
  defined catalog key.
- The root `catalog` defines every dependency duplicated across members (`drizzle-orm`, `bcryptjs`,
  `zod`).
- Member `name`s are unique.

The test SHALL follow the repo's existing BDD test convention (`import { describe, it } from
'jsr:@std/testing/bdd'` and `import { expect } from 'jsr:@std/expect'`, matching
`packages/shared/src/utils/slug.test.ts`), NOT raw `Deno.test`. It SHALL resolve the workspace-root
config paths from `import.meta.url` (the file lives at `packages/shared/src/`, three levels below the
root) rather than from the process working directory, so it passes regardless of where `deno test` is
invoked. Any helper introduced by the test (e.g. a config reader) SHALL carry a docblock describing
its purpose, parameters, and return shape.

#### Scenario: Drifted member version is caught

- **WHEN** a member `deno.json` loses its `version` field or a member references an undefined
  catalog key
- **THEN** `packages/shared/src/workspace.test.ts` fails
- **AND** the failure names the offending member / catalog key

#### Scenario: Test runs under the shared package suite

- **WHEN** `deno task test:shared` runs
- **THEN** `packages/shared/src/workspace.test.ts` is included (it lives under the `test.include`
  path `packages/shared/src/`) and passes on a consistent workspace

