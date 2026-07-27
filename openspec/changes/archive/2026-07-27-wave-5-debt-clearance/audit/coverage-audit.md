# BrewForm Test-Coverage Audit — 2026-07-19

Audited at commit fe9aad2 (branch chore/debt-fix, clean tree). All runs executed locally; a scratch
`brewform_test` database was created in the already-running `brewform-postgres-1` container
(mirroring .github/workflows/pr.yml:63-113), used for the measured runs, and dropped afterward. Repo
left untouched (`git status` clean).

## 1. Test setup discovered

| Scope                      | Runner                                                                                                   | Task                                                                                                                             | Coverage configured?                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| apps/api + packages/shared | `deno test`                                                                                              | root `test-coverage` (deno.json:36) = `deno test --no-check --allow-all --coverage=coverage/ apps/api/src/ packages/shared/src/` | Yes (deno built-in; lcov+html auto-generated)                                                                                                                 |
| apps/web                   | Vitest 4 (`deno run -A npm:vitest run`, apps/web/deno.json:11)                                           | `deno task --cwd apps/web test`                                                                                                  | **No `coverage` block** in apps/web/vitest.config.ts:23-35; `@vitest/coverage-v8` IS installed (apps/web/package.json:21) so `--coverage` works with defaults |
| apps/web PBT/exploration   | Vitest via vitest.pbt.config.ts (separate include; excluded from default run per vitest.config.ts:28-34) | manual                                                                                                                           | No                                                                                                                                                            |
| packages/db                | `deno test --allow-all src/` (packages/db/deno.json:16) — 6 test files, needs live Postgres              | root `test:db` (deno.json:35)                                                                                                    | Not in any coverage scope                                                                                                                                     |

Key scope facts:

- Root `test-coverage` (deno.json:36) covers ONLY apps/api/src + packages/shared/src. apps/web and
  packages/db are excluded from the coverage number entirely.
- CI (.github/workflows/ci.yml:95-108) runs `deno task test-coverage`, generates lcov, uploads an
  artifact — **no threshold gate**; coverage can regress silently. Web tests run in CI without
  `--coverage` (deno.json:49). GitHub workflows never run packages/db tests (only the seed:
  ci.yml:93, pr.yml:113); root `deno task ci` (deno.json:49) does run `test:db`.
- apps/api/src/test-setup.ts:9-11 injects fake `postgresql://test:test@localhost:5432/test` when
  DATABASE_URL is unset → without a provisioned test DB, 212 unit tests pass and **129 DB-backed
  tests fail** with `PostgresError: password authentication failed for user "test"` (observed run,
  scratchpad/deno-test-full.log). CI provisions
  `postgresql://brewform:brewform@localhost:5432/brewform_test`
  - migrate + seed (pr.yml:79, 109-113); no local equivalent task/doc exists (Makefile `test`
    targets run inside compose instead, Makefile:100-117).

## 2. Measured coverage (with provisioned test DB, CI-equivalent env)

### 2a. Deno scope (apps/api + packages/shared) — the scope the 85% target is defined on

`deno task test-coverage`: **341 passed (1972 steps), 0 failed**. `deno coverage coverage/`:

- **Overall: 72.21% lines (10611/14695), 83.1% branch, 61.3% function** across 162 loaded files.
- packages/shared: **99.42% lines (1887/1898, 63 files)** — effectively done.
- apps/api: **65.38% lines (7693/11766, 97 files)** — the entire gap lives here.
- 26 prod files never loaded (mostly type-only files in packages/shared/src/types/*, plus
  apps/api/src/setup.ts (56 lines), apps/api/src/utils/jobs/index.ts (8), apps/api/src/types/hono.ts
  (22)). Total 1124 physical lines invisible to the report (type files mostly compile away).

Worst API files by uncovered line count (LH/LF from lcov):

| Uncovered | Line % | File                                                           |
| --------- | ------ | -------------------------------------------------------------- |
| 496       | 0.8%   | apps/api/src/modules/admin/service.ts                          |
| 437       | 26.1%  | apps/api/src/modules/admin/index.ts                            |
| 416       | 21.2%  | apps/api/src/modules/admin/model.ts                            |
| 350       | 49.0%  | apps/api/src/modules/recipe/model.ts                           |
| 221       | 63.1%  | apps/api/src/modules/recipe/index.ts                           |
| 212       | 47.7%  | apps/api/src/modules/recipe/service.ts                         |
| 132       | 57.1%  | apps/api/src/modules/auth/index.ts                             |
| 126       | 20.8%  | apps/api/src/modules/auth/service.ts                           |
| 125       | 21.9%  | apps/api/src/utils/notify/index.ts                             |
| 122       | 12.2%  | apps/api/src/utils/storage/s3.ts                               |
| 112       | 12.5%  | apps/api/src/modules/auth/model.ts (NO model test file exists) |
| 95        | 5.0%   | apps/api/src/modules/equipment/service.ts                      |
| 80        | 42.0%  | apps/api/src/main.ts                                           |
| 73        | 71.3%  | apps/api/src/modules/setup/index.ts                            |
| 70        | 74.1%  | apps/api/src/modules/follow/index.ts                           |
| 63        | 66.8%  | apps/api/src/modules/photo/index.ts                            |
| 59        | 69.6%  | apps/api/src/modules/comment/index.ts                          |
| 58        | 71.4%  | apps/api/src/modules/bean/index.ts                             |
| 56        | 49.5%  | apps/api/src/modules/comment/service.ts                        |

Full table: scratchpad/deno-coverage-report.txt; raw log: scratchpad/deno-test-db.log.

### ROOT CAUSE — "mock-mirror" tests that never import production code

Several API test files re-implement the module under test instead of importing it, so they pass
while exercising ~0 production lines:

- apps/api/src/modules/admin/service.test.ts (492 lines) — defines its own `MockModel` interface and
  mirror logic; **zero imports from ./service.ts** → service.ts (707 lines) is 0.8% covered.
- apps/api/src/modules/admin/index.test.ts — builds a parallel Hono app from
  `@brewform/shared/schemas`
  - zValidator (index.test.ts:4-16); never imports ./index.ts → real admin router 26.1%.
- apps/api/src/modules/equipment/service.test.ts (38 lines, no import of ./service.ts) → 5.0%.
- apps/api/src/modules/photo/service.test.ts (no import of ./service.ts) → 29.2%.
- apps/api/src/modules/auth/service.test.ts imports only `register`/`toAuthUser` (service.test.ts:5)
  → 20.8%; comment/service.test.ts imports only notification side-effects (service.test.ts:18) →
  49.5%. By contrast, admin/model.test.ts DOES import the real model
  (`import * as model from './model.ts'`, model.test.ts:16) but still leaves 416 lines uncovered.

### 2b. apps/web (Vitest 4 + v8, run with `--coverage`)

All tests passed. Summary (loaded-files-only — see caveat):

- **Statements 73.06% (2902/3972), Branches 64.98%, Functions 63.75%, Lines 75.31% (2755/3658)**,
  130 files.

**CAVEAT — number is inflated.** Vitest 4's default coverage includes only files loaded during the
run. 14 prod files (1093 physical lines) are invisible because no test imports them:
apps/web/src/router.tsx (433 lines), pages/collections/CollectionCreatePage.tsx (102),
CollectionEditPage.tsx (135), CollectionListPage.tsx (73), routes/favourite.ts (28),
routes/follow.ts (35), routes/like.ts (34), routes/rate.ts (32), components/SessionRestoreBanner.tsx
(67), components/EmailVerificationBanner.tsx (44), components/layout/Layout.tsx (44),
pages/recipes/RecipeNotAvailablePage.tsx (28), App.tsx (28), main.tsx (10). Adjusted true line
coverage ≈ **64-68%** (adding those at 0% with ~55% of physical lines executable).

Worst loaded web files by uncovered line count:

| Uncovered | Line % | File                                                                                                    |
| --------- | ------ | ------------------------------------------------------------------------------------------------------- |
| 99        | 15.4%  | apps/web/src/api/index.ts (typed API client wrappers, 318 lines)                                        |
| 68        | 37.0%  | apps/web/src/pages/admin/AdminCoffeeVarietiesPage.tsx                                                   |
| 62        | 49.2%  | apps/web/src/pages/recipes/RecipeCreatePage.tsx                                                         |
| 54        | 34.9%  | apps/web/src/pages/admin/AdminUserEditPage.tsx                                                          |
| 44        | 63.0%  | apps/web/src/pages/recipes/RecipeEditPage.tsx                                                           |
| 33        | 26.7%  | apps/web/src/pages/admin/AdminUserCreatePage.tsx                                                        |
| 28        | 37.8%  | apps/web/src/pages/admin/AdminVendorsPage.tsx                                                           |
| 27        | 30.8%  | apps/web/src/routes/comments.ts (react-router resource actions)                                         |
| 26        | 58.1%  | apps/web/src/pages/recipes/useCoffeeVarietyFilter.tsx                                                   |
| 25        | 59.7%  | apps/web/src/components/collections/AddToCollectionModal.tsx                                            |
| 24        | 7.7%   | apps/web/src/components/layout/NotificationDropdown.tsx (mocked out in NotificationBell.test.tsx:26-27) |
| 22        | 56.0%  | apps/web/src/pages/admin/AdminUsersPage.tsx                                                             |
| 20        | 48.7%  | apps/web/src/pages/beans/BeanListPage.tsx                                                               |
| 20        | 51.2%  | apps/web/src/pages/setups/SetupListPage.tsx                                                             |

pages/admin cluster overall: 51.96% statements / 56.22% lines.

### 2c. packages/db

- `deno task test:db` is **broken**: TS2352 at packages/db/src/schema-indexes.test.ts:84
  (`col as IndexedColumn` cast fails type-check; task has no `--no-check`,
  packages/db/deno.json:16). This also breaks root `deno task test` (deno.json:32) and root
  `deno task ci` (deno.json:49).
- With `--no-check` on a FRESH seeded brewform_test DB: **25 passed, 0 failed**.
- Cross-suite pollution: running db tests AFTER the API suite on the same DB fails
  `seed.idempotent.test.ts` ("full seed twice… leaves expected counts") because API tests mutate
  seeded rows. Root `test` task order (test:api before test:db, deno.json:32) triggers exactly this.
- packages/db has no coverage measurement anywhere; src/schema.ts is exercised indirectly by
  schema-columns/constraints/indexes tests; seed-coffee-varieties.ts / seed-equipment-catalog.ts /
  seed-users-recipes.ts have no direct tests (covered transitively via seed.test.ts imports).

## 3. Ledger claims verified (D99, plans/D99-debts.md)

- **D99.6 CONFIRMED**: CollectionCreatePage.tsx, CollectionEditPage.tsx, CollectionListPage.tsx have
  no test files (plans/D99-debts.md:272-289) — and are additionally invisible to vitest coverage
  (never imported), so the gap doesn't even show in the numbers.
- **RecipeFocusModePage: ledger's "untested?" is WRONG** — RecipeFocusModePage.test.tsx exists and
  the page measures 90.9% stmts / 93.75% lines. The "still useEffect-based" part is TRUE: 3
  useEffects at apps/web/src/pages/recipes/RecipeFocusModePage.tsx:25,32,40.

## 4. Additional gaps found (beyond ledger)

1. Mock-mirror API tests (section 2a root cause) — biggest single distortion; admin module alone has
   1349 uncovered lines (~33% of the entire 4084-line gap to 100%, ~72% of the gap to 85%).
2. apps/web/src/router.tsx (433 lines) + all 4 resource-route action files (routes/favourite.ts,
   follow.ts, like.ts, rate.ts — optimistic-UI actions) at 0%, invisible.
3. apps/web/src/api/index.ts — the entire typed API-call surface at 15.4%.
4. NotificationDropdown.tsx 7.7% (always mocked); notification-events.ts 50%/0% functions.
5. auth model has NO test file at all (apps/api/src/modules/auth/model.ts, 194 lines, 12.5% via
   incidental loading) — password-reset/verification-token persistence untested.
6. utils/storage/s3.ts 12.2% and utils/notify/index.ts 21.9% (email dispatch) — side-effect layers.
7. apps/api/src/main.ts 42.0% (app wiring, 183 lines) and setup.ts never loaded.
8. No coverage thresholds anywhere: CI uploads artifact only (ci.yml:104-108), vitest has no
   coverage config at all, `deno coverage` has no `--threshold`-style gate wired.
9. Vitest excludes `__tests__/*.integration.test.ts` from the default run (vitest.config.ts:33) —
   apps/web/src/pages/recipes/**tests**/recipe-coffee-dates.integration.test.ts never runs in CI.

## 5. What it takes to reach 85% (deno scope: LF=14695, need +1880 covered lines)

1. **Rewrite admin module tests against real code** (service.test.ts + index.test.ts import the real
   ./service.ts and ./index.ts; model gaps): admin to ~90% ≈ **+1200 lines → ~80.4%**. Effort: the
   mirror tests already encode expected behaviors; porting them is mechanical but service.ts is 707
   lines with DB effects — use the brewform_test DB like model tests do. (M-L)
2. **Recipe module backfill** (model.ts cursor/filter branches, index.ts route branches,
   service.ts): to ~85% ≈ **+550 lines → ~84.2%**. (M)
3. **Auth module**: new model.test.ts + widen service.test.ts beyond register/toAuthUser + index
   routes ≈ **+250 lines → ~85.9%**. (S-M) Buffer beyond 85%: equipment/service real tests (+90),
   notify (+100), s3 mock tests (+110), main.ts. Prereq for any of it locally: a documented
   `brewform_test` provisioning task (create DB + migrate + seed), else 129 tests fail (section 1).

Web (no target defined in-repo; measured 75.31% inflated): to make 85% honest first add a coverage
block to vitest.config.ts with `include: ['src/**']`-equivalent so all 144 files count, then: D99.6
collection pages (3 files), router.tsx route-config smoke + 4 action files, api/index.ts client
tests (99 lines), NotificationDropdown, AdminCoffeeVarieties/UserEdit/UserCreate/Vendors pages,
RecipeCreate/Edit submit paths, BeanList/SetupList filter branches.

Repair items regardless of target: fix schema-indexes.test.ts:84 cast (unblocks test:db, root test,
root ci), isolate db seed-idempotency from API-suite pollution (fresh DB or run order), add a CI
coverage threshold gate.

## Artifacts (scratchpad)

- deno-coverage-report.txt — full per-file deno table
- deno-test-db.log — full passing run log (DB provisioned)
- deno-test-full.log — failing run log (no test DB, 129 failures)
- api-src.txt / web-src.txt / pkg-src.txt — prod file inventories
