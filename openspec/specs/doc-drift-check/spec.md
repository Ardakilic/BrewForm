# doc-drift-check Specification

## Purpose
TBD - created by archiving change wave-6-audit-remediation. Update Purpose after archive.
## Requirements
### Requirement: A dependency-free doc-drift script guards docs and specs against removed tooling
The repository SHALL provide `scripts/doc-drift-check.ts`, runnable with plain `node scripts/doc-drift-check.ts` (Node 26 type stripping, `node:` built-ins only, no install step) and through the root `pnpm run docs:check` script, that exits non-zero and prints `file:line: token` for every case-insensitive match of the removed-tooling pattern `(?<![A-Za-z])deno(?:kv|land)?(?![A-Za-z])|jsr:` in the documentation scope.

The documentation scope SHALL be: `openspec/specs/**/*.md`, `openspec/config.yaml`, `docs/**/*.md`, `AGENTS.md`, `README.md`, every other root-level `*.md` file, `plans/ROADMAP.md`, `plans/FEATURE_SUGGESTIONS.md`, `plans/F*.md` and `.github/**/*.md`. The pattern SHALL NOT match ordinary words such as "denote" or "denominator".

#### Scenario: A spec that mandates the removed runtime fails the check
- **WHEN** any file under `openspec/specs/` contains `deno task test` or `jsr:@std/expect`
- **THEN** `node scripts/doc-drift-check.ts` exits non-zero and reports that file and line

#### Scenario: Ordinary words are not flagged
- **WHEN** a doc in scope contains "denotes" or "denominator"
- **THEN** the check does not report it

#### Scenario: The clean repository passes
- **WHEN** the check runs on `main` after wave 6 is archived
- **THEN** it exits 0

### Requirement: Allowlist entries are explicit, justified and minimal
Exemptions SHALL live in one committed file, `scripts/doc-drift-allowlist.json`, where each entry names a path glob and a non-empty `reason`, and the script SHALL fail when an entry has no reason or matches no existing file.

The initial allowlist SHALL be limited to: `docs/history/**` (superseded documents kept for history), `docs/decisions.md` (ADR history; superseded ADRs are kept verbatim), `plans/D*.md`, `plans/TECHNICAL_DEBT.md` and `plans/AUDIT-*.md` (resolved-debt history and audit evidence), `openspec/specs/node-runtime/spec.md`, `openspec/specs/doc-drift-check/spec.md` and `openspec/specs/cache-driver/spec.md` (they define absence checks — for example that `CACHE_DRIVER=deno-kv` is rejected — and must name the tokens), and the four negative-assertion test files listed by the node-runtime capability for the code-remnant scan. `openspec/changes/**` (active and archived change records) and `**/__fixtures__/**` (the script's own test fixtures) SHALL be outside the scan scope rather than allowlisted.

#### Scenario: Unjustified exemption fails
- **WHEN** an allowlist entry has an empty `reason`
- **THEN** the script exits non-zero and names the entry

#### Scenario: Stale exemption fails
- **WHEN** an allowlist glob matches no file (for example after a historical doc is deleted)
- **THEN** the script exits non-zero and asks for the entry to be removed

### Requirement: Every archived capability exists in the main specs unless retired
The script SHALL list every capability directory under `openspec/changes/archive/*/specs/` and fail for each one that has no `openspec/specs/<capability>/spec.md`, unless the capability appears in the allowlist's `retiredCapabilities` map with the name of the change or decision that retired it.

The initial `retiredCapabilities` map SHALL contain `deno-runtime`, `deno-workspace-management` and `remote-cache`, each pointing to `wave-6-audit-remediation` (replaced by `node-runtime`, `pnpm-workspace` and `cache-driver`).

#### Scenario: An unsynced archived capability is reported
- **WHEN** an archived change contains `specs/recipe-comparison/spec.md` and `openspec/specs/recipe-comparison/` does not exist
- **THEN** the script exits non-zero naming `recipe-comparison` and the archive folder it came from

#### Scenario: A retired capability is accepted
- **WHEN** `remote-cache` exists only in archived changes and is listed in `retiredCapabilities`
- **THEN** the script does not report it

### Requirement: Spec Purpose placeholders and broken relative links are rejected
The script SHALL fail when any `openspec/specs/*/spec.md` Purpose section still reads `TBD - created by archiving change …`, and when any relative Markdown link (`[text](path)` without a URL scheme, ignoring the `#anchor` part) in a doc in scope points to a file that does not exist.

#### Scenario: Placeholder Purpose fails
- **WHEN** a main spec's Purpose is `TBD - created by archiving change d32-deploy-plan-deno29-sync. Update Purpose after archive.`
- **THEN** the script exits non-zero and names the spec

#### Scenario: Broken backlog link fails
- **WHEN** `plans/FEATURE_SUGGESTIONS.md` links to `plans/F01-recipe-collections.md` (which resolves to `plans/plans/…`)
- **THEN** the script exits non-zero and reports the file, line and unresolved target

### Requirement: The doc-drift check runs in CI and locally
`.github/workflows/ci.yml` (the single CI workflow after wave 6) SHALL run a `doc-drift` job on every pull request and push to `main` that has no `needs:`, checks out the repository, sets up Node from `.nvmrc` and runs `node scripts/doc-drift-check.ts` and `node scripts/docblock-scan.ts --check` (the mode that exits non-zero on a missing docblock) without installing dependencies, and the image `publish` job SHALL list `doc-drift` in its `needs:`; `make docs-check` SHALL run the same root `docs:check` script inside the `app` container, and `make ci` and the root `ci` script SHALL include it.

The script's behaviour SHALL be covered by `packages/shared/src/doc-drift.test.ts`, which runs the script with `--root <fixture>` against passing and failing fixture trees under `packages/shared/src/__fixtures__/doc-drift/` and once against the repository root.

#### Scenario: Pull request with a stale doc fails CI
- **WHEN** a pull request adds `deno task check` to `docs/architecture.md`
- **THEN** the `doc-drift` job fails and the log shows the offending line

#### Scenario: Fixture tests pin the behaviour
- **WHEN** `make test-shared` runs
- **THEN** `doc-drift.test.ts` passes, proving the token, allowlist, retired-capability, Purpose, link and stale-idiom rules each reject their failing fixture

### Requirement: Agent instructions state the current code idioms and stale idioms are rejected
`AGENTS.md` SHALL describe the code idioms the repository actually uses, and the doc-drift script SHALL reject the stale idioms wave 6 removes, reporting each as `file:line: stale-idiom: <match>` in the documentation scope (allowlisted paths are exempt, as for the token rule).

`AGENTS.md` SHALL state:
- Soft-delete filtering with `isNull(<table>.deletedAt)`, for example `and(eq(t.id, id), isNull(t.deletedAt))`, and SHALL NOT prescribe `findUnique`.
- The Biome lint policy in place of Deno lint rule names: the recommended preset, with `suspicious/noExplicitAny`, `suspicious/useAwait` and `suspicious/noEmptyBlockStatements` at error level, and suppressions only as line-level `// biome-ignore <category>/<group>/<rule>: <justification>` comments.
- An i18n rule: every user-visible string goes through `t()`, and each new key is added to both `packages/shared/src/i18n/en.json` and `tr.json`.
- No pointer to the removed `TODO_logs.md`.

The stale idioms the script SHALL reject are:
- A soft-delete filter written as `eq(<table>.deletedAt, null)`, matched case-sensitively by `eq\(\s*[A-Za-z_][\w.]*\.deletedAt\s*,\s*null\s*\)`. It binds `= NULL`, which never matches a row.
- The Deno lint rule names `no-import-prefix` and `no-unversioned-import`.

#### Scenario: Stale soft-delete idiom is rejected
- **WHEN** a doc in scope (for example `docs/architecture.md`) contains `findFirst({ where: eq(table.deletedAt, null) })`
- **THEN** `node scripts/doc-drift-check.ts` exits non-zero and reports that file and line with rule `stale-idiom`

#### Scenario: Deno lint rule names are rejected
- **WHEN** `AGENTS.md` lists `no-import-prefix` or `no-unversioned-import` as lint exclusions
- **THEN** the script exits non-zero and reports the line

#### Scenario: AGENTS.md states the current rules
- **WHEN** `AGENTS.md` is read after wave 6
- **THEN** its "Database rules" use `isNull(t.deletedAt)` for soft deletes, its "Code style" describes the Biome policy with the three error-level rules and the line-level `biome-ignore` form, it has an i18n rule requiring keys in both `en.json` and `tr.json`, and it does not mention `TODO_logs.md`

### Requirement: The generated API reference stays in sync with the OpenAPI document
`docs/api-reference.md` SHALL be generated, never hand-edited, by `pnpm --filter @brewform/api run docs:api` (`apps/api/scripts/generate-api-reference.ts`), which builds the real route tree from `apps/api/src/routes/index.ts` with the same documentation options as `/api/v1/openapi.json`, requests the spec in-process without any DB or cache I/O, and renders one section per OpenAPI tag listing method, path, summary, auth requirement, parameters and documented response codes.

CI SHALL regenerate the file in the `quality` job of `ci.yml` and fail on any diff (`git diff --exit-code docs/api-reference.md`), and the hand-written `docs/api.md` SHALL keep only cross-cutting conventions (base URL and versioning, response envelope, error codes, authentication, offset and cursor pagination, rate-limit contract, deprecation headers) and link to `docs/api-reference.md` and to the Scalar UI at `/api/v1/docs`.

#### Scenario: A new route changes the reference
- **WHEN** a pull request adds a documented route but does not regenerate `docs/api-reference.md`
- **THEN** the CI freshness step fails with the diff

#### Scenario: Shipped feature areas appear in the reference
- **WHEN** `docs/api-reference.md` is generated on `main`
- **THEN** it contains sections for brew logs, collections, notifications, `POST /api/v1/recipes/merge`, the version diff route, the sitemap and the cursor and advanced-search query parameters

### Requirement: Pull requests declare whether docs and specs were updated
The repository SHALL provide `.github/pull_request_template.md` containing a "Docs & specs" checklist with at least these items: "Runtime, infra, config or env change: AGENTS.md, README.md, the affected docs/*.md and openspec/specs updated (or N/A)", "New or changed route: OpenAPI metadata added and `docs/api-reference.md` regenerated", "New env var: `.env.example` files and deployment guide updated", and "OpenSpec change validated with `openspec validate <change> --strict`".

#### Scenario: New pull request shows the checklist
- **WHEN** a contributor opens a pull request on GitHub
- **THEN** the description is pre-filled with the "Docs & specs" checklist

