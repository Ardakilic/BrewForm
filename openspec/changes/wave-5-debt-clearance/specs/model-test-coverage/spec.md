## ADDED Requirements

### Requirement: Suite entry points type-check and run

`deno task test:db` SHALL type-check and pass: the TS2352 at
`packages/db/src/schema-indexes.test.ts:84` (the `col as IndexedColumn` cast; the task has no
`--no-check`, `packages/db/deno.json:16`) SHALL be fixed with a correct type, not by adding
`--no-check` to the task. Because the root `test` task (`deno.json:32`) and `ci` task
(`deno.json:49`) compose `test:db`, both SHALL complete without a pre-test type failure.

**Reason:** The advertised full-suite entry points fail before running a single test — every
"run make test" instruction in the repo docs is currently broken at the first composed task.

#### Scenario: test:db passes with type-checking on

- **WHEN** `deno task test:db` runs against a provisioned `brewform_test` database
- **THEN** it type-checks (no `--no-check` in the task definition) and all db tests pass

#### Scenario: Root entry points are green

- **WHEN** `deno task test` and `deno task ci` run
- **THEN** neither aborts on the TS2352 — the composed `test:db` step type-checks and executes

### Requirement: Test files exercise the production module they name

Every test file SHALL import the production module it names — a test file that re-implements the
module inline and asserts against the copy (a "mock-mirror") is prohibited. The four existing
mock-mirror files SHALL be rewritten, not patched: delete the mirrored implementations wholesale
and write tests that import the real `service.ts`/`index.ts`:

| File | Rewrite pattern |
|---|---|
| `apps/api/src/modules/admin/service.test.ts` | real imports + scratch test DB (`equipment/model.test.ts` pattern) |
| `apps/api/src/modules/admin/index.test.ts` | mount the real router on a stub Hono app, auth stubbed at the middleware seam (`bodyLimit.test.ts` pattern) |
| `apps/api/src/modules/equipment/service.test.ts` | real imports + scratch test DB |
| `apps/api/src/modules/photo/service.test.ts` | real imports + scratch test DB |

The old files' scenario lists SHALL be kept as a rewrite checklist so no behavioural intent is
lost, but no mirrored code survives. Real admin-module bugs surfaced by the rewrite are fixed in
separate commits within the track so the test diff stays reviewable.

**Reason:** These four files pass regardless of what the production module does — the admin module
alone carries 1,349 uncovered production lines behind green tests. Mirrors are worse than no tests:
they manufacture false confidence and still cost maintenance (design.md Decision 8).

#### Scenario: The four rewritten files import production code

- **WHEN** the four files are inspected after the rewrite
- **THEN** each imports the module it names (`./service.ts` or `./index.ts`) and contains no inline
  re-implementation of production functions

#### Scenario: Admin coverage becomes real

- **WHEN** `deno task test-coverage` runs after the rewrite
- **THEN** `apps/api/src/modules/admin/` line coverage reflects actual execution of the production
  module (up from 1,349 uncovered lines), and `make test-api` passes

### Requirement: Deno-scope line coverage is at least 85 percent and CI-gated

The deno scope (`apps/api/src` + `packages/shared/src`) SHALL hold ≥85% line coverage, enforced by
a gate script: `deno coverage` has no built-in threshold flag, so `scripts/coverage-gate.ts` SHALL
run after `deno task test-coverage`, parse the coverage report output, and exit non-zero when line
coverage is below 85%. The gate SHALL be wired into `make ci` and the CI workflow (which today only
uploads the report artifact, `ci.yml:104-108`). The threshold is set from the measured number,
never aspirationally.

**Reason:** Measured baseline is 72.21% lines (shared 99.42%, apps/api 65.38% — the entire gap),
with no gate anywhere; coverage can only regress silently. The path to ≥85% is measured and
concrete (admin ~+1,200 covered lines → ~80.4%, recipe +~550 → ~84.2%, auth +~250 → ~85.9%).

#### Scenario: Gate fails below threshold

- **WHEN** `scripts/coverage-gate.ts` parses a coverage report with deno-scope line coverage below
  85%
- **THEN** it exits non-zero with a message naming the measured and required percentages, failing
  `make ci` and the CI job

#### Scenario: Gate passes at or above threshold

- **WHEN** the deno-scope line coverage is ≥85%
- **THEN** the gate exits zero and CI proceeds

### Requirement: Admin, recipe, and auth modules are backfilled to reach the gate

The measured path to ≥85% SHALL be executed in order: (1) the admin mock-mirror rewrite (real
tests over ~1,200 previously-mirrored lines), (2) recipe-module backfill (+~550 covered lines over
the module's untested service/model paths), (3) auth backfill including a NEW
`apps/api/src/modules/auth/model.test.ts` (+~250 lines — `auth/model.ts` is 194 lines at 12.5%
incidental coverage with password-reset/verification-token persistence untested, and has no test
file at all). If one stage lands short of its projection, the later stages absorb the slack — the
gate threshold is only committed once the measured number reaches 85%.

**Reason:** These three modules are the measured gap. Auth is the only module with a completely
untested model layer — token persistence is exactly where silent breakage hurts most.

#### Scenario: auth/model.test.ts exists and follows the model-test pattern

- **WHEN** `ls apps/api/src/modules/auth/model.test.ts` is run after the backfill
- **THEN** the file exists, imports `* as model from './model.ts'`, and covers password-reset and
  verification-token persistence paths

#### Scenario: Measured coverage reaches the gate

- **WHEN** `deno task test-coverage` + `scripts/coverage-gate.ts` run after all three backfill
  stages
- **THEN** deno-scope line coverage is ≥85% and the gate passes

### Requirement: Web coverage counts untested files and enforces ratcheting thresholds

The web Vitest coverage configuration SHALL count untested production files: Vitest 4 includes
only loaded files by default, leaving 14 production files (1,093 physical lines) invisible —
`router.tsx` (433), the 3 collection pages, the 4 resource-route action files
(`routes/favourite.ts`, `follow.ts`, `like.ts`, `rate.ts`), `SessionRestoreBanner.tsx`,
`EmailVerificationBanner.tsx`, `layout/Layout.tsx`, `RecipeNotAvailablePage.tsx`, `App.tsx`,
`main.tsx` — inflating 75.31% to an honest ~64–68%. `vitest.config.ts` SHALL set
`coverage.include` (or the `all`-files equivalent) so these count, and SHALL set
`coverage.thresholds.lines` at the honest measured baseline after the include fix and the
collection-page tests land, rounded DOWN to the nearest whole percent.

**Ratchet rule:** whenever a PR raises measured web coverage by ≥1 point, the same PR bumps the
threshold to the new floor. The threshold only moves up.

**Reason:** A coverage number that ignores exactly the untested files is worse than no number.
Gating web at 85% immediately would be ~15 points aspirational and get disabled within a week; the
ratchet gets there monotonically without ever being red on day one (design.md Decision 7).

#### Scenario: Invisible files appear in the report

- **WHEN** the web coverage report is generated after the config change
- **THEN** all 14 previously-invisible production files appear (at their true coverage, 0% where
  untested), and the headline number reflects them

#### Scenario: Thresholds fail on regression

- **WHEN** a change drops web line coverage below the configured `coverage.thresholds.lines`
- **THEN** `deno task --cwd apps/web test -- --coverage` (and the CI web-test job) fails

#### Scenario: Ratchet moves the floor up

- **WHEN** a PR raises measured web line coverage by ≥1 point
- **THEN** the same PR raises `coverage.thresholds.lines` to the new measured floor (rounded down)

### Requirement: A local task provisions the test database

A make target SHALL provision the `brewform_test` database locally, mirroring the CI provisioning
steps at `.github/workflows/pr.yml:63-113` (create `brewform_test` in the compose Postgres, run
migrations, seed). After the target runs, the 129 DB-dependent API tests and `deno task test:db`
SHALL pass locally without hand-provisioning.

**Reason:** 129 API tests currently require a `brewform_test` DB that no local task creates — the
suite is green in CI and unrunnable on a fresh clone, which is how the mock-mirror and pollution
problems stayed invisible.

#### Scenario: Fresh-clone test run works

- **WHEN** a developer runs the new provisioning target followed by `make test-api` on a machine
  with the compose Postgres up
- **THEN** the DB-dependent tests connect to `brewform_test` and pass without manual `psql` steps

#### Scenario: Provisioning matches CI

- **WHEN** the make target's steps are compared to `.github/workflows/pr.yml:63-113`
- **THEN** database name, migration, and seed steps match, so local green predicts CI green

### Requirement: Test suites pass in composed order without cross-suite pollution

The composed suite order SHALL be pollution-free: running the db tests AFTER the API suite on the
same database currently fails `seed.idempotent.test.ts` ("full seed twice… leaves expected
counts") because API tests mutate seeded rows — and the root `test` task order (`test:api` before
`test:db`, `deno.json:32`) triggers exactly this. The fix SHALL either isolate the API tests from
seeded rows or re-seed between suites, such that `deno task test` passes end-to-end in its
declared order.

**Reason:** An entry point that fails only when run in its own advertised order trains developers
to run suites individually and ignore red — the exact habit that let the mock-mirrors survive.

#### Scenario: Composed order is green

- **WHEN** `deno task test` runs (api suite then db suite) against a provisioned test DB
- **THEN** `seed.idempotent.test.ts` passes — no failure caused by API-suite mutations

#### Scenario: Order independence

- **WHEN** the db suite runs immediately after the API suite twice in a row
- **THEN** results are identical to running the db suite alone

### Requirement: Behavioural changes ship with tests

Every wave-5 track change with a runtime surface SHALL land with tests in the same PR (T1–T7:
authz gates, cache wiring, US-9, primitives, i18n-visible behaviour, lint-driven `catch {}`
rewrites, sql-tag conversions) — new behaviour gets new assertions; changed behaviour gets its
existing assertions updated. Pure config/docs/docblock changes are exempt.

**Reason:** The coverage gate only holds if the flow of new untested lines stops; a backfill
without a ships-with-tests rule is bailing a leaking boat.

#### Scenario: Track PRs carry their tests

- **WHEN** any T1–T7 PR touching `apps/api/src` or `apps/web/src` production code is reviewed
- **THEN** the diff includes test additions/updates exercising the changed behaviour, or the PR
  description states the pure-config/docs exemption

#### Scenario: Coverage does not regress across the wave

- **WHEN** the coverage gate and web thresholds are evaluated on each track PR after T8 lands
- **THEN** they pass — no track PR ships behaviour that drops coverage below the committed floors

## MODIFIED Requirements

### Requirement: New test files follow existing project conventions

All new test files (API and web) SHALL follow the existing project test conventions:

**API tests (`apps/api/src/modules/equipment/model.test.ts`, `apps/api/src/modules/vendor/model.test.ts`):**
- No file-level lint directives. Where a typed fix is impractical, a line-level `// deno-lint-ignore <rule>` with a one-line justification comment on the preceding line.
- `import '../../test-setup.ts';` as the first import (sets `DATABASE_URL`/`JWT_SECRET`/`LOG_LEVEL` if missing).
- `{ afterEach, beforeEach, describe, it }` from `jsr:@std/testing/bdd`, `expect` from `jsr:@std/expect`.
- Real `db` from `@brewform/db`, schema tables from `@brewform/db/schema`, `* as model from './model.ts'`.
- Inline `crypto.randomUUID()` fixtures; `db.insert(users).values({ id, email: \`test-${userId}@example.com\`, username: \`testuser-${userId}\`, passwordHash: 'hash' })`.
- `afterEach` hard-deletes test rows (child tables first, then parent).
- Every `describe` gets `{ sanitizeOps: false, sanitizeResources: false }` as the second argument (required for DB I/O tests — the real connection pool leaks across the test boundary).
- `'should ...'` `it` naming (matches `admin/model.test.ts`).

**Web tests (`recipe-list/*.test.tsx`, `RequireAuth.test.tsx`):**
- `{ beforeEach, describe, expect, it, vi }` from `vitest`, `{ render, screen, waitFor }` from `@testing-library/react`, `userEvent` from `@testing-library/user-event`.
- Logger mock via `vi.hoisted(() => ({ mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))` + `vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }))`.
- `beforeEach(() => vi.clearAllMocks())`.
- Components using router hooks (`useNavigate`, `useSearchParams`, `useNavigation`, `useLocation`) render via `createMemoryRouter` + `RouterProvider` with `initialEntries`.
- Hook tests (`useRecipeFilters`) use a `TestConsumer` component that renders hook return fields to `data-testid` spans (pattern from `AuthContext.test.tsx`).

**Reason:** Following existing conventions keeps the test suite consistent and avoids introducing new patterns that would need separate documentation. The existing patterns are proven by `admin/model.test.ts` (API) and `AuthContext.test.tsx` / `LikeButton.test.tsx` (web). Wave 5 reconciles this with the `lint-style` delta: the three rules are re-enabled and the ~40 no-op file-level test directives are deleted, so new API test files carry no `// deno-lint-ignore-file` header — only justified line-level ignores where a typed fix is impractical.

#### Scenario: API test files import test-setup first and carry no file-level directive

- **WHEN** the new API test files are inspected
- **THEN** the first import is `import '../../test-setup.ts';` and no `// deno-lint-ignore-file` line exists

#### Scenario: API test describe blocks have sanitizer options

- **WHEN** the new API test files are inspected at each `describe` call
- **THEN** the second argument is `{ sanitizeOps: false, sanitizeResources: false }`

#### Scenario: Web test files use vi.hoisted logger mock

- **WHEN** the new web test files are inspected
- **THEN** they use `vi.hoisted` for the logger mock and `vi.mock('@/utils/logger.ts', ...)` with `beforeEach(() => vi.clearAllMocks())`

### Requirement: Tier 2 API model tests follow the established model-test pattern

The following 9 API modules SHALL have a `model.test.ts` file at
`apps/api/src/modules/<module>/model.test.ts`:

`badge`, `bean`, `comment`, `follow`, `photo`, `preference`, `qrcode`, `report`, `setup`.

Each new model test file SHALL follow the pattern established by
`apps/api/src/modules/equipment/model.test.ts` (the Tier 1 reference) and
`apps/api/src/modules/admin/model.test.ts` (the original reference):

- **No file-level lint directive:** with the three rules re-enabled (per the wave-5 `lint-style`
  delta), test files carry no `// deno-lint-ignore-file` header — where a typed fix is impractical,
  use a line-level `// deno-lint-ignore <rule>` with a one-line justification comment on the
  preceding line.
- **Line 1 (or first import):** `import '../../test-setup.ts'` as the FIRST import — sets
  `DATABASE_URL` / `JWT_SECRET` / `LOG_LEVEL` env vars if missing so tests run in any environment.
- **Imports:** `{ afterEach, beforeEach, describe, it }` from `jsr:@std/testing/bdd`; `expect` from
  `jsr:@std/expect`; `db` from `@brewform/db`; schema tables from `@brewform/db/schema`;
  `* as model from './model.ts'`.
- **Structure:** One `describe()` block per model function.
- **`describe` signature:** `describe('functionName', { sanitizeOps: false, sanitizeResources:
  false }, () => { ... })` — the sanitizer options are MANDATORY for DB I/O tests.
- **Fixtures:** Inline per describe block. `beforeEach` creates rows with `crypto.randomUUID()`
  IDs. `afterEach` hard-deletes test rows (child tables first, then parent) via
  `db.delete(table).where(eq(table.id, id))`.
- **`it` naming:** `'should ...'` style.
- **No shared helpers:** All fixtures inline per describe block; no `testDb` / `makeUser` /
  `makeRecipe` factory files.
- **Seed-safe assertions:** Tests that query multi-row surfaces filter to their own rows (because
  the CI DB has seed data).

Each model test SHALL cover (at minimum, where the function exists): `findMany` / `findById` /
`search`, `create` / `update`, `softDelete` (double-delete idempotency per D19's model), and any
ownership/visibility paths specific to the module. Prioritise soft-delete and ownership paths.

**Reason:** These 9 modules have `service.test.ts` but no `model.test.ts` — the model layer (which
holds the actual DB queries and historically held the D01/D03 bugs) is untested. Bug history
correlates directly with the untested model surface. Wave 5 removes the file-level
`deno-lint-ignore-file` header from the pattern, reconciling with the `lint-style` delta that
re-enables the rules and deletes the ~40 vestigial no-op test directives.

#### Scenario: 9 new model test files exist

- **WHEN** `ls apps/api/src/modules/{badge,bean,comment,follow,photo,preference,qrcode,report,setup}/model.test.ts` is run
- **THEN** all 9 files exist

#### Scenario: Model tests follow the established pattern

- **WHEN** each new model test file is inspected
- **THEN** it carries no file-level lint directive, has the `test-setup.ts` first import, `{ sanitizeOps: false,
  sanitizeResources: false }` on DB describes, inline `crypto.randomUUID()` fixtures, and
  `afterEach` hard-delete

#### Scenario: Model tests pass

- **WHEN** `make test-api` is run
- **THEN** all 9 new model test files pass with zero failures
