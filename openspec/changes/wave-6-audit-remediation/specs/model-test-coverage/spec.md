## MODIFIED Requirements

### Requirement: recipe-list web components have Vitest test coverage

The following files SHALL exist in `apps/web/src/components/recipe-list/` with Vitest + Testing Library test coverage:

- `RecipeCard.test.tsx` — covers: renders recipe title (links to `/recipes/${slug}`); renders author username with a button that `stopPropagation()` and navigates to `/u/${author.username}`; renders `currentVersion.brewMethod` / `drinkType` / `rating`; renders `likeCount` / `commentCount` / `forkCount`; handles missing author (renders "unknown"); handles missing `currentVersion` (optional rendering). Uses `createMemoryRouter` + `RouterProvider` (component uses `useNavigate`). Logger mock via `vi.hoisted`.

- `FilterField.test.tsx` — covers: renders the `label` text; renders `children` passthrough. Pure presentational, no router needed.

- `ActiveFilterBadge.test.tsx` — covers: renders `label` + `value`; the ✕ button has `aria-label="Remove ${label} filter"`; clicking ✕ calls `onRemove`. No router needed.

- `PaginationControls.test.tsx` — covers: Previous button hidden on page 1; Next button hidden on last page (`page === totalPages`); clicking Previous calls `onPageChange(page - 1)`; clicking Next calls `onPageChange(page + 1)`; `pageLabel` placeholder substitution (`{page}` → page, `{total}` → total); `previousLabel` / `nextLabel` rendered verbatim. No router needed.

- `useRecipeFilters.test.tsx` — covers: default values when no search params (`page = 1`, `sortBy = 'createdAt'`, scalars `''`, `tasteNoteIds = []`); parsing each scalar filter from the URL query string; `tasteNoteIds` parsed as comma-separated and filtered through the UUID regex (non-UUID values dropped); `updateFilter(key, scalarValue)` sets the param (or deletes if empty); `updateFilter(key, arrayValue)` joins with `,`; `updateFilter(key, value)` for any filter key clears `page` (back to page 1 on a filter change), while `updateFilter('page', n)` and `setPage(n)` keep `page=n` and every filter, and `setPage(1)` omits `page` (wave 6 replaced the old test that asserted `page` is always cleared; see `recipe-list` "Recipe list pagination navigates to the selected page"); `clearAllFilters()` empties all params. Tested via a `TestConsumer` component that calls `useRecipeFilters()` and renders the return fields to `data-testid` spans. Render via `createMemoryRouter` with `initialEntries` carrying the query string (pattern from `AuthContext.test.tsx`).

- `RecipeListView.test.tsx` — covers: renders `RecipeCard`s for each recipe in `recipesResponse.data`; loading state shows skeleton (`source: 'all'`) vs text (`source: 'starred'`) based on `useNavigation().state`; empty state when `data` is empty; `hasActiveFilters` shows the Clear button; admin visibility filter only renders when `showAdminVisibilityFilter = true`; pagination hidden when `total <= PER_PAGE` (12); `ActiveFilterBadge`s render for active equipment/mainBrewer/tasteNotes/coffeeVariety filters. Uses `createMemoryRouter` + `RouterProvider`, mocks `useTranslation` (or wraps in `I18nProvider`).

Tests SHALL follow the existing Vitest convention: imports from `vitest` (`{ beforeEach, describe, expect, it, vi }`), `@testing-library/react` (`{ render, screen, waitFor }`), `@testing-library/user-event` (`userEvent`). Logger mock via `vi.hoisted` + `vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }))`. `beforeEach(() => vi.clearAllMocks())`. Components using router hooks render via `createMemoryRouter` + `RouterProvider` with `initialEntries`.

**Reason:** D11 shipped the `recipe-list/` deduplication (8 files backing both `/recipes` and `/recipes/starred`) without tests. These components are the highest-traffic untested web surface. D39 Tier 1 backfills them.

#### Scenario: RecipeCard test passes

- **WHEN** `make test-web` is executed (or `pnpm --filter @brewform/web exec vitest run src/components/recipe-list/RecipeCard.test.tsx`)
- **THEN** the `RecipeCard.test.tsx` suite passes, covering title render, author button stopPropagation, and currentVersion optional rendering

#### Scenario: useRecipeFilters test covers param parsing and updateFilter

- **WHEN** `make test-web` is executed
- **THEN** the `useRecipeFilters.test.tsx` suite passes, covering default values, scalar parsing, `tasteNoteIds` UUID filtering, `updateFilter` set/delete/array-join, page reset on filter change, page preservation on `setPage`, and `clearAllFilters`

#### Scenario: RecipeListView test covers loading and empty states

- **WHEN** `make test-web` is executed
- **THEN** the `RecipeListView.test.tsx` suite passes, covering loading skeleton (source='all'), loading text (source='starred'), empty state, hasActiveFilters Clear button, admin visibility filter conditional, and pagination visibility

#### Scenario: No pre-existing web test regresses

- **WHEN** `make test-web` is executed on a clean checkout with the new test files
- **THEN** all pre-existing web tests (`HomePage`, `LoginPage`, `AuthContext`, etc.) still pass — zero regressions

### Requirement: New test files follow existing project conventions

All new test files (API and web) SHALL follow the existing project test conventions:

**API tests (`apps/api/src/modules/equipment/model.test.ts`, `apps/api/src/modules/vendor/model.test.ts`):**
- No file-level or range lint suppressions. Where a typed fix is impractical, a line-level `// biome-ignore lint/<group>/<rule>: <justification>` comment.
- `import '../../test-setup.ts';` as the first import (sets `DATABASE_URL`/`JWT_SECRET`/`LOG_LEVEL` if missing).
- `{ afterEach, beforeEach, describe, expect, it }` (plus `vi` where spies or mocks are needed) from `vitest`.
- Real `db` from `@brewform/db`, schema tables from `@brewform/db/schema`, `* as model from './model.ts'`.
- Inline `crypto.randomUUID()` fixtures; `db.insert(users).values({ id, email: \`test-${userId}@example.com\`, username: \`testuser-${userId}\`, passwordHash: 'hash' })`.
- `afterEach` hard-deletes test rows (child tables first, then parent).
- DB-backed test files rely on `apps/api/vitest.config.ts` running files serially (`fileParallelism: false`), because they assert global table counts; `describe` calls take no test-options object.
- `'should ...'` `it` naming (matches `admin/model.test.ts`).

**Web tests (`recipe-list/*.test.tsx`, `RequireAuth.test.tsx`):**
- `{ beforeEach, describe, expect, it, vi }` from `vitest`, `{ render, screen, waitFor }` from `@testing-library/react`, `userEvent` from `@testing-library/user-event`.
- Logger mock via `vi.hoisted(() => ({ mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))` + `vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }))`.
- `beforeEach(() => vi.clearAllMocks())`.
- Components using router hooks (`useNavigate`, `useSearchParams`, `useNavigation`, `useLocation`) render via `createMemoryRouter` + `RouterProvider` with `initialEntries`.
- Hook tests (`useRecipeFilters`) use a `TestConsumer` component that renders hook return fields to `data-testid` spans (pattern from `AuthContext.test.tsx`).

**Reason:** Following existing conventions keeps the test suite consistent and avoids introducing new patterns that would need separate documentation. The existing patterns are proven by `admin/model.test.ts` (API) and `AuthContext.test.tsx` / `LikeButton.test.tsx` (web). Wave 5 reconciles this with the `lint-style` delta: the three rules are re-enabled and the ~40 no-op file-level test directives are deleted, so new API test files carry no file-level suppression header — only justified line-level `biome-ignore` comments where a typed fix is impractical.

#### Scenario: API test files import test-setup first and carry no file-level directive

- **WHEN** the new API test files are inspected
- **THEN** the first import is `import '../../test-setup.ts';` and no file-level or range suppression comment exists

#### Scenario: API DB test files run serially

- **WHEN** `apps/api/vitest.config.ts` and the new API test files are inspected
- **THEN** the config sets `fileParallelism: false` and no `describe` call passes a test-options object

#### Scenario: Web test files use vi.hoisted logger mock

- **WHEN** the new web test files are inspected
- **THEN** they use `vi.hoisted` for the logger mock and `vi.mock('@/utils/logger.ts', ...)` with `beforeEach(() => vi.clearAllMocks())`

### Requirement: Tier 2 API model tests follow the established model-test pattern
The following 9 API modules SHALL have a `model.test.ts` file at
`apps/api/src/modules/<module>/model.test.ts`:

`badge`, `bean`, `comment`, `follow`, `photo`, `preference`, `qrcode`, `report`, `setup`.

Each model test file SHALL follow the pattern established by
`apps/api/src/modules/equipment/model.test.ts` (the Tier 1 reference) and
`apps/api/src/modules/admin/model.test.ts` (the original reference):

- **No file-level or range lint suppression:** where a typed fix is impractical, use a line-level
  `// biome-ignore lint/<group>/<rule>: <justification>` comment.
- **First import:** `import '../../test-setup.ts'` — sets `DATABASE_URL` / `JWT_SECRET` /
  `LOG_LEVEL` env vars if missing so tests run in any environment.
- **Imports:** `{ afterEach, beforeEach, describe, expect, it }` from `vitest`; `db` from
  `@brewform/db`; schema tables from `@brewform/db/schema`; `* as model from './model.ts'`.
- **Structure:** One `describe('functionName', () => { ... })` block per model function. DB I/O
  isolation comes from the API Vitest config running files serially (`fileParallelism: false`),
  not from per-`describe` options.
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

**Reason:** These 9 modules had `service.test.ts` but no `model.test.ts` — the model layer (which
holds the actual DB queries and historically held the D01/D03 bugs) was untested. Wave 5 removed the
file-level suppression header from the pattern; the Node/pnpm migration moved the suites to Vitest.

#### Scenario: 9 model test files exist

- **WHEN** `ls apps/api/src/modules/{badge,bean,comment,follow,photo,preference,qrcode,report,setup}/model.test.ts` is run
- **THEN** all 9 files exist

#### Scenario: Model tests follow the established pattern

- **WHEN** each model test file is inspected
- **THEN** it carries no file-level suppression, has the `test-setup.ts` first import, imports its
  test API from `vitest`, uses inline `crypto.randomUUID()` fixtures and an `afterEach` hard-delete

#### Scenario: Model tests pass

- **WHEN** `make test-api` is run
- **THEN** all 9 model test files pass with zero failures

### Requirement: Tier 2 API route tests follow the established route-test pattern

The following 9 API modules SHALL have an `index.test.ts` file at
`apps/api/src/modules/<module>/index.test.ts`:

`preference`, `bean`, `setup`, `photo`, `taste`, `user`, `badge`, `qrcode`, `vendor`.

(`report` and `follow` already had route tests — `follow`'s was renamed from `index_test.ts` to
`index.test.ts` by D99.18 — so both are excluded from this requirement.)

Each new route test file SHALL follow the pattern established by existing route tests (e.g.
`apps/api/src/modules/report/index.test.ts`, `apps/api/src/modules/comment/index.test.ts`):
invoke the Hono app via `app.request('/api/v1/...')`, assert status codes and response bodies, mock
DB/service dependencies where appropriate. Route tests cover the HTTP layer (status codes, error
envelopes, auth guards) — they do NOT re-test model logic already covered by `model.test.ts`.

**Reason:** These 9 modules have no route-layer test. The route layer is where auth guards,
validation, and error mapping live — untested route logic is a gap.

#### Scenario: 9 new route test files exist

- **WHEN** `ls apps/api/src/modules/{preference,bean,setup,photo,taste,user,badge,qrcode,vendor}/index.test.ts` is run
- **THEN** all 9 files exist

#### Scenario: Route tests pass

- **WHEN** `make test-api` is run
- **THEN** all 9 new route test files pass with zero failures

### Requirement: No duplicate scope with Wave 3 or prior waves

D39 Tier 2/3 test files SHALL NOT re-create tests for surfaces already covered by:

- **Wave 3 (D40):** 22 tr-locale spot-check tests for converted pages, `ErrorBoundary.test.tsx`,
  `BanDialog.test.tsx`, `ErrorPage.test.tsx`.
- **D38 (Wave 1):** `AuthContext.test.tsx`.
- **D39 Tier 1 (Wave 2):** `equipment/model.test.ts`, `vendor/model.test.ts`, recipe-list component
  tests, `RequireAuth.test.tsx`.
- **D37:** `NotFoundPage` consolidated into `ErrorPage.tsx` (tested by `ErrorPage.test.tsx`).

Wave 3's tr-locale spot-check tests satisfy the D39 "has a test file" gate for the 22 pages they
cover. Deepening those spot-checks into full behavioural coverage is out of scope for Wave 4 — it's
a separate coverage-quality effort.

**Reason:** Prevents duplicate work and ensures the 37 new test files fill genuine gaps, not
re-test already-covered surfaces.

#### Scenario: No NotFoundPage test re-created

- **WHEN** `ls apps/web/src/pages/NotFoundPage.test.tsx` is run
- **THEN** the file does NOT exist (NotFoundPage is covered by `ErrorPage.test.tsx` via D37's
  consolidation)

#### Scenario: No ErrorBoundary test re-created

- **WHEN** `git diff` is inspected for `apps/web/src/components/ErrorBoundary.test.tsx`
- **THEN** no new file is created — the existing Wave 3 test is preserved unchanged

#### Scenario: follow route test not re-created (already exists as index.test.ts)

- **WHEN** `ls apps/api/src/modules/follow/index.test.ts` is run
- **THEN** the file exists (renamed from `index_test.ts` by D99.18) and is not re-created

### Requirement: Suite entry points type-check and run
`pnpm run test:db` (the `@brewform/db` `vitest run` suite) SHALL pass against a provisioned `brewform_test` database, and the `@brewform/db` `check` script (`tsc --noEmit`) SHALL type-check its test files, including `packages/db/src/schema-indexes.test.ts`, whose former TS2352 (`col as IndexedColumn`) is fixed with a correct type rather than a suppression. Because the root `test` and `ci` scripts in `package.json` (and `make test` / `make ci`) compose `test:db`, both SHALL complete without a type or runner failure before the tests execute.

**Reason:** The advertised full-suite entry points previously failed before running a single test; every "run make test" instruction in the docs depends on them being green.

#### Scenario: test:db passes and its files type-check

- **WHEN** `pnpm run check:db` and then `pnpm run test:db` run against a provisioned `brewform_test` database
- **THEN** the type-check reports zero errors and all db tests pass

#### Scenario: Root entry points are green

- **WHEN** `pnpm run test` and `pnpm run ci` (or `make test` and `make ci`) run
- **THEN** neither aborts before executing tests — the composed `test:db` step type-checks and runs

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

- **WHEN** `pnpm run test-coverage` (`make test-coverage`) runs after the rewrite
- **THEN** `apps/api/src/modules/admin/` line coverage reflects actual execution of the production
  module (up from 1,349 uncovered lines), and `make test-api` passes

### Requirement: Per-workspace coverage is CI-gated by Vitest thresholds

Each workspace SHALL hold its measured coverage at or above the thresholds declared in its
`vitest.config.ts`: `apps/api` lines 79, `packages/shared` lines/statements 97, functions 95,
branches 93, `packages/db` lines 84, and `apps/web` lines 79. Vitest SHALL enforce them natively
during `pnpm run test-coverage`, exiting non-zero when a workspace falls below a threshold. The
command is wired into `make ci` and the `test` job in `ci.yml`. Thresholds are set from the measured
number, rounded down, and are ratcheted upward only.

**Reason:** The previous custom `scripts/coverage-gate.ts` parsed the former runtime's coverage
output and was removed in the Node/pnpm migration (#135). Vitest has native `coverage.thresholds`,
so a custom gate script would only duplicate the runner's own check.

#### Scenario: Gate fails below threshold

- **WHEN** `pnpm run test-coverage` runs and a workspace's coverage is below its configured
  threshold
- **THEN** Vitest exits non-zero, failing `make ci` and the CI `test` job

#### Scenario: Gate passes at or above threshold

- **WHEN** every workspace's coverage meets its configured thresholds
- **THEN** Vitest exits zero and CI proceeds

### Requirement: A local task provisions the test database

A make target, `make test-db-provision`, SHALL provision the `brewform_test` database locally, idempotently mirroring the database provisioning steps of the `test` job in `.github/workflows/ci.yml` (create `brewform_test` in the compose Postgres, run migrations, seed). After the target runs, the DB-dependent API tests and `pnpm run test:db` SHALL pass locally without hand-provisioning.

**Reason:** 129 API tests currently require a `brewform_test` DB that no local task creates — the
suite is green in CI and unrunnable on a fresh clone, which is how the mock-mirror and pollution
problems stayed invisible.

#### Scenario: Fresh-clone test run works

- **WHEN** a developer runs `make test-db-provision` followed by `make test-api` on a machine
  with the compose Postgres up
- **THEN** the DB-dependent tests connect to `brewform_test` and pass without manual `psql` steps

#### Scenario: Provisioning matches CI

- **WHEN** the make target's steps are compared to the `test` job in `.github/workflows/ci.yml`
- **THEN** database name, migration, and seed steps match, so local green predicts CI green

### Requirement: Test suites pass in composed order without cross-suite pollution

The composed suite order SHALL be pollution-free: running the db tests AFTER the API suite on the
same database currently fails `seed.idempotent.test.ts` ("full seed twice… leaves expected
counts") because API tests mutate seeded rows — and the root `test` script order in `package.json`
(`test:api` before `test:db`) triggers exactly this. The fix SHALL either isolate the API tests from
seeded rows or re-seed between suites, such that `pnpm run test` (`make test`) passes end-to-end in
its declared order.

**Reason:** An entry point that fails only when run in its own advertised order trains developers
to run suites individually and ignore red — the exact habit that let the mock-mirrors survive.

#### Scenario: Composed order is green

- **WHEN** `pnpm run test` runs (api suite then db suite) against a provisioned test DB
- **THEN** `seed.idempotent.test.ts` passes — no failure caused by API-suite mutations

#### Scenario: Order independence

- **WHEN** the db suite runs immediately after the API suite twice in a row
- **THEN** results are identical to running the db suite alone

### Requirement: Tier 2 API util tests follow the established util-test pattern

The following 4 API utils SHALL have a co-located test file:

| Util | Test file | Pattern reference |
|---|---|---|
| `apps/api/src/utils/jobs/cron.ts` | `apps/api/src/utils/jobs/cron.test.ts` | New — assert schedule registration, job execution |
| `apps/api/src/utils/openapi/index.ts` | `apps/api/src/utils/openapi/index.test.ts` | New — schema conversion smoke (z.toJSONSchema produces valid output) |
| `apps/api/src/utils/upload/index.ts` | `apps/api/src/utils/upload/index.test.ts` | `bodyLimit.test.ts` (which exercises the photo body cap) — cover `validateImagePart`, `generateStorageKey`, `thumbnailKey`, `getPublicUrl`, `saveUploadedFile`, `saveThumbnail`, `deleteStoredFile`, `getThumbnailSizes` (wave 6 replaced `validateImageUpload`, `generateFilename` and `generateThumbnailFilename`; see `photo-upload-security`) |
| `apps/api/src/middleware/requestId.ts` | `apps/api/src/middleware/requestId.test.ts` | `bodyLimit.test.ts` pattern (stub Hono app + `app.request()`) — assert header is read/generated and attached to context |

**Path correction:** The D39 plan says `apps/api/src/jobs/cron.ts` but the actual path is
`apps/api/src/utils/jobs/cron.ts` (the `apps/api/src/jobs/` directory does not exist).

**Reason:** These 4 utils have no dedicated test. `upload/index.ts` is partially exercised by
`bodyLimit.test.ts` but most of its functions are untested. `requestId.ts` is a thin wrapper but
the plan lists it.

#### Scenario: 4 new util test files exist

- **WHEN** `ls apps/api/src/utils/jobs/cron.test.ts apps/api/src/utils/openapi/index.test.ts apps/api/src/utils/upload/index.test.ts apps/api/src/middleware/requestId.test.ts` is run
- **THEN** all 4 files exist

#### Scenario: Util tests pass

- **WHEN** `make test-api` is run
- **THEN** all 4 new util test files pass with zero failures

