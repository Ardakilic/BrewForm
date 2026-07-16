## ADDED Requirements

### Requirement: Tier 2 API model tests follow the established model-test pattern

The following 9 API modules SHALL have a `model.test.ts` file at
`apps/api/src/modules/<module>/model.test.ts`:

`badge`, `bean`, `comment`, `follow`, `photo`, `preference`, `qrcode`, `report`, `setup`.

Each new model test file SHALL follow the pattern established by
`apps/api/src/modules/equipment/model.test.ts` (the Tier 1 reference) and
`apps/api/src/modules/admin/model.test.ts` (the original reference):

- **Line 1:** `// deno-lint-ignore-file no-explicit-any require-await` (file-level lint suppressions
  for test files, per `lint-style` spec).
- **Line 3 (or first import):** `import '../../test-setup.ts'` as the FIRST import — sets
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
correlates directly with the untested model surface.

#### Scenario: 9 new model test files exist

- **WHEN** `ls apps/api/src/modules/{badge,bean,comment,follow,photo,preference,qrcode,report,setup}/model.test.ts` is run
- **THEN** all 9 files exist

#### Scenario: Model tests follow the established pattern

- **WHEN** each new model test file is inspected
- **THEN** it has the lint-ignore header, `test-setup.ts` first import, `{ sanitizeOps: false,
  sanitizeResources: false }` on DB describes, inline `crypto.randomUUID()` fixtures, and
  `afterEach` hard-delete

#### Scenario: Model tests pass

- **WHEN** `make test-api` is run
- **THEN** all 9 new model test files pass with zero failures

### Requirement: Tier 2 API route tests follow the established route-test pattern

The following 9 API modules SHALL have an `index.test.ts` file at
`apps/api/src/modules/<module>/index.test.ts`:

`preference`, `bean`, `setup`, `photo`, `taste`, `user`, `badge`, `qrcode`, `vendor`.

(`report` already has `index.test.ts`; `follow` has `index_test.ts` which Deno discovers — both are
excluded from this requirement.)

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

### Requirement: Tier 2 API util tests follow the established util-test pattern

The following 4 API utils SHALL have a co-located test file:

| Util | Test file | Pattern reference |
|---|---|---|
| `apps/api/src/utils/jobs/cron.ts` | `apps/api/src/utils/jobs/cron.test.ts` | New — assert schedule registration, job execution |
| `apps/api/src/utils/openapi/index.ts` | `apps/api/src/utils/openapi/index.test.ts` | New — schema conversion smoke (z.toJSONSchema produces valid output) |
| `apps/api/src/utils/upload/index.ts` | `apps/api/src/utils/upload/index.test.ts` | `bodyLimit.test.ts:156-165` (which already exercises `validateImageUpload`) — extend to cover `generateFilename`, `generateThumbnailFilename`, `getPublicUrl`, `saveUploadedFile`, `saveThumbnail`, `getThumbnailSizes` |
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

### Requirement: Tier 3 web pages without tests get behavioural coverage

The following 4 web pages SHALL have a co-located test file (`<PageName>.test.tsx`):

| Page | Test file |
|---|---|
| `apps/web/src/pages/auth/ForgotPasswordPage.tsx` | `apps/web/src/pages/auth/ForgotPasswordPage.test.tsx` |
| `apps/web/src/pages/auth/ResetPasswordPage.tsx` | `apps/web/src/pages/auth/ResetPasswordPage.test.tsx` |
| `apps/web/src/pages/beans/BeanListPage.tsx` | `apps/web/src/pages/beans/BeanListPage.test.tsx` |
| `apps/web/src/pages/setups/SetupListPage.tsx` | `apps/web/src/pages/setups/SetupListPage.test.tsx` |

Each test SHALL follow the `model-test-coverage` spec's web test conventions: Vitest +
`@testing-library/react` + `@testing-library/user-event`, `vi.hoisted` logger mock,
`beforeEach(() => vi.clearAllMocks())`, `createMemoryRouter` + `RouterProvider` for router hooks.
Tests SHALL cover (at minimum): page renders without crashing, primary user-visible content
appears, and any form submission / navigation paths.

**Reason:** These 4 pages have NO test file at all — they are the genuinely-untested web pages
after Wave 3 (D40) added tr-locale spot-check tests for 22 other pages.

**Do NOT re-create:** `NotFoundPage` (consolidated into `ErrorPage.tsx` by D37, tested by
`ErrorPage.test.tsx`), `ErrorBoundary` (Wave 3), `BanDialog` (D36), `AuthContext` (D38), or the 22
Wave 3 tr-locale spot-check pages.

#### Scenario: 4 new web page test files exist

- **WHEN** `ls apps/web/src/pages/auth/ForgotPasswordPage.test.tsx apps/web/src/pages/auth/ResetPasswordPage.test.tsx apps/web/src/pages/beans/BeanListPage.test.tsx apps/web/src/pages/setups/SetupListPage.test.tsx` is run
- **THEN** all 4 files exist

#### Scenario: Web page tests pass

- **WHEN** `make test-web` is run
- **THEN** all 4 new web page test files pass with zero failures

### Requirement: Tier 3 web components without tests get coverage

The following 6 web components SHALL have a co-located test file:

| Component | Test file |
|---|---|
| `apps/web/src/components/onboarding/OnboardingWizard.tsx` | `apps/web/src/components/onboarding/OnboardingWizard.test.tsx` |
| `apps/web/src/components/photos/PhotoUpload.tsx` | `apps/web/src/components/photos/PhotoUpload.test.tsx` |
| `apps/web/src/components/qrcode/RecipeQRCode.tsx` | `apps/web/src/components/qrcode/RecipeQRCode.test.tsx` |
| `apps/web/src/components/recipe/ScaaRadarChart.tsx` | `apps/web/src/components/recipe/ScaaRadarChart.test.tsx` |
| `apps/web/src/components/recipe/StarRating.tsx` | `apps/web/src/components/recipe/StarRating.test.tsx` |
| `apps/web/src/components/recipe/StatCards.tsx` | `apps/web/src/components/recipe/StatCards.test.tsx` |

Each test SHALL follow the `model-test-coverage` spec's web test conventions (Vitest +
testing-library, `vi.hoisted` logger mock). For SVG/canvas-rendering components (`ScaaRadarChart`,
`RecipeQRCode`), the test MAY mock the rendering layer and assert on component behaviour (props,
callbacks) rather than DOM SVG structure if jsdom limitations prevent full rendering.

**Note:** `apps/web/src/utils/stat-cards.ts` (the data util) already has `stat-cards.test.ts` —
this requirement covers the `StatCards` *component*, not the util.

**Reason:** These 6 components have no test file. They are leaf components with user-visible
behaviour (rating display, chart rendering, photo upload, onboarding flow).

#### Scenario: 6 new web component test files exist

- **WHEN** `ls apps/web/src/components/onboarding/OnboardingWizard.test.tsx apps/web/src/components/photos/PhotoUpload.test.tsx apps/web/src/components/qrcode/RecipeQRCode.test.tsx apps/web/src/components/recipe/ScaaRadarChart.test.tsx apps/web/src/components/recipe/StarRating.test.tsx apps/web/src/components/recipe/StatCards.test.tsx` is run
- **THEN** all 6 files exist

#### Scenario: Web component tests pass

- **WHEN** `make test-web` is run
- **THEN** all 6 new web component test files pass with zero failures

### Requirement: Tier 3 web hooks/utils/contexts without tests get coverage

The following 5 web hooks/utils/contexts SHALL have a co-located test file:

| Target | Test file |
|---|---|
| `apps/web/src/hooks/useDebounce.ts` | `apps/web/src/hooks/useDebounce.test.ts` |
| `apps/web/src/utils/recipe-filters.ts` | `apps/web/src/utils/recipe-filters.test.ts` |
| `apps/web/src/utils/sessionId.ts` | `apps/web/src/utils/sessionId.test.ts` |
| `apps/web/src/contexts/I18nContext.tsx` | `apps/web/src/contexts/I18nContext.test.tsx` |
| `apps/web/src/contexts/ThemeContext.tsx` | `apps/web/src/contexts/ThemeContext.test.tsx` |

Hook tests SHALL use `renderHook` from `@testing-library/react` (or a test harness component).
Context tests SHALL wrap a test consumer in the provider and assert context values / locale
switches / theme switches. Follow the `model-test-coverage` spec's web test conventions.

**Note:** `apps/web/src/contexts/AuthContext.tsx` already has `AuthContext.test.tsx` (added by D38,
Wave 1) — it is excluded from this requirement.

**Reason:** These 5 hooks/utils/contexts have no test. `I18nContext` and `ThemeContext` are
app-wide providers — untested provider logic is a gap.

#### Scenario: 5 new hook/util/context test files exist

- **WHEN** `ls apps/web/src/hooks/useDebounce.test.ts apps/web/src/utils/recipe-filters.test.ts apps/web/src/utils/sessionId.test.ts apps/web/src/contexts/I18nContext.test.tsx apps/web/src/contexts/ThemeContext.test.tsx` is run
- **THEN** all 5 files exist

#### Scenario: Hook/util/context tests pass

- **WHEN** `make test-web` is run
- **THEN** all 5 new test files pass with zero failures

### Requirement: Tier 3 shared input schema tests mirror the existing schema-test pattern

The following 6 shared input schema files SHALL have a co-located test file:

| Schema file | Test file |
|---|---|
| `packages/shared/src/schemas/bean.ts` | `packages/shared/src/schemas/bean.test.ts` |
| `packages/shared/src/schemas/comment.ts` | `packages/shared/src/schemas/comment.test.ts` |
| `packages/shared/src/schemas/follow.ts` | `packages/shared/src/schemas/follow.test.ts` |
| `packages/shared/src/schemas/photo.ts` | `packages/shared/src/schemas/photo.test.ts` |
| `packages/shared/src/schemas/setup.ts` | `packages/shared/src/schemas/setup.test.ts` |
| `packages/shared/src/schemas/vendor.ts` | `packages/shared/src/schemas/vendor.test.ts` |

Each test SHALL mirror the existing top-level schema test pattern (e.g.
`packages/shared/src/schemas/equipment.test.ts`, `packages/shared/src/schemas/recipe.test.ts`):
assert valid inputs parse successfully, invalid inputs (missing required fields, wrong types,
out-of-range values) fail with expected errors, and refinements (if any) fire correctly.

**Note:** The `packages/shared/src/schemas/responses/` subdirectory already has output-schema
tests for all 6 entities (`responses/bean.test.ts`, etc.). This requirement covers the INPUT
schemas (top-level), which are untested.

**Reason:** These 6 input schemas have no test. Input schemas are the validation layer — untested
validation is a gap.

#### Scenario: 6 new shared schema test files exist

- **WHEN** `ls packages/shared/src/schemas/{bean,comment,follow,photo,setup,vendor}.test.ts` is run
- **THEN** all 6 files exist

#### Scenario: Shared schema tests pass

- **WHEN** `make test-shared` is run
- **THEN** all 6 new shared schema test files pass with zero failures

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

#### Scenario: follow route test not re-created (already exists as index_test.ts)

- **WHEN** `ls apps/api/src/modules/follow/index.test.ts` is run
- **THEN** the file does NOT need to be created (follow has `index_test.ts` which Deno discovers)