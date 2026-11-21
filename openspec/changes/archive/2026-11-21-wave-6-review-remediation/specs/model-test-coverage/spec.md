## MODIFIED Requirements

### Requirement: Tier 2 API util tests follow the established util-test pattern

The following 4 API utils SHALL have a co-located test file:

| Util | Test file | Pattern reference |
|---|---|---|
| `apps/api/src/utils/jobs/cron.ts` | `apps/api/src/utils/jobs/cron.test.ts` | New — assert schedule registration, job execution |
| `apps/api/src/utils/openapi/index.ts` | `apps/api/src/utils/openapi/index.test.ts` | New — schema conversion smoke (z.toJSONSchema produces valid output) |
| `apps/api/src/utils/upload/index.ts` | `apps/api/src/utils/upload/index.test.ts` | `bodyLimit.test.ts` (which exercises the photo body cap) — cover `validateImagePart`, `generateStorageKey`, `thumbnailKey`, `saveUploadedFile`, `deleteStoredFile` (wave 6 replaced `validateImageUpload`, `generateFilename` and `generateThumbnailFilename`, and the wave-6 review removed `getPublicUrl`, `saveThumbnail` and `getThumbnailSizes`; see `photo-upload-security` and `api-env-config`) |
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

The wave-6 review remediation removes the remaining mirrors the same way; each behaviour a mirror
asserted gets a test of the real function before the copy is deleted:

| File | Rewrite |
|---|---|
| `apps/api/src/modules/comment/service.test.ts` | the inline `createComment`/`deleteComment` copies are deleted; the properties run against the real functions through `deps` |
| `apps/api/src/modules/recipe/model.test.ts` | the mock Drizzle surface and the `buildRecipeFilters`/`recipeCoffeeVarietyCondition` copies are deleted; every filter branch is tested against `brewform_test` through the real `buildListRecipesWhere` (`model.cursor.test.ts`, "Recipe model — list filters (DB)"), search and dates in `model.search.test.ts` |
| `apps/api/src/modules/recipe/service.test.ts` | the inline `listRecipes_withTasteNoteFilters` copy and the inline visibility and fork-title expressions are deleted (covered by the list-filter cases, the real `canViewRecipe` tests and `service.slug.test.ts`) |
| `apps/api/src/modules/recipe/service.preservation.test.ts` | deleted: it copied a removed `listRecipes`; the real non-admin and admin visibility cases are in `model.cursor.test.ts` |
| `apps/api/src/modules/user/service.preservation.test.ts`, `user/service.exploration.test.ts` | deleted: they copied a removed `getPublicProfile`; `user/service.test.ts` tests `isFollowing` and the profile counts against the database |

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

#### Scenario: Every recipe filter branch runs against the database

- **WHEN** the recipe model tests run
- **THEN** the `brewMethod`, `drinkType`, `search`, `mainBrewer`, `author`, `dateFrom`/`dateTo`, `minRating`/`maxRating`, `coffeeVarietyId`, `equipmentId`, `tasteNoteIds` and `tasteNoteId` branches of the real `buildRecipeFilters` are each asserted by the recipes a query returns from `brewform_test`

#### Scenario: No mirror of a service or model function remains

- **WHEN** `grep -rniE "faithful (inline )?copy|inline copy|mirror any change" apps/api/src --include='*.test.ts'` runs
- **THEN** it prints nothing
