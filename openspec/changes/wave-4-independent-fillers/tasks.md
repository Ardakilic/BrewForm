## 1. D42 — Prerequisite: Web type-check in CI

- [x] 1.1 Edit `apps/web/tsconfig.json`. Add `"allowImportingTsExtensions": true` and
      `"ignoreDeprecations": "6.0"` to `compilerOptions`. The first flag fixes 686 `TS5097` errors
      (the codebase uses explicit `.ts`/`.tsx` import extensions per AGENTS.md). The second
      silences the `baseUrl` deprecation (TypeScript 6.0 deprecated it; migrating away is out of
      scope). Verify the path aliases (`@/*`, `@brewform/shared/*`) still resolve.
- [x] 1.2 Run `cd apps/web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json` locally to
      discover the remaining ~200 real type errors (after the config fix in 1.1). Triage into three
      categories:
      - **Test-file mock errors (~145):** mostly `TS2352`/`TS2345` from mock `AuthContextType`
        objects missing `sessionError: null` and `clearSessionError: vi.fn()` (D38 added these to
        the real `AuthContextType` but test mocks weren't updated). Fix by adding the two missing
        fields to each mock object. ~67 errors are in `CommentSection.test.tsx` alone. This is a
        D38 follow-up, mechanical.
      - **Non-test shadow-type errors (~56):** mostly `TS2339`/`TS2322` in `RecipeDetailPage.tsx`
        (43 errors — the shadow-type `RecipeDetailResponse` mismatch) and `RecipeCreatePage.tsx`
        (4 errors). These are exactly the mismatches D42 fixes by deleting shadow types (task 5).
        Defer these to task 5 — do not fix them here.
      - **Other errors (~5):** `router.tsx` (2), `logger.ts` (2), `VerifyEmailPage.tsx` (1). Fix
        these individually (read the error, fix the underlying type issue, do NOT use `@ts-ignore`
        or `as any`).
- [x] 1.3 Fix the ~145 test-file mock errors by adding `sessionError: null` and
      `clearSessionError: vi.fn()` (or `clearSessionError: () => {}`) to every mock `AuthContextType`
      object. Grep for `as AuthContextType` or `AuthContext.Provider value={{` to find all mock
      sites. This is mechanical — one line per mock.
- [x] 1.4 Fix the ~5 "other" non-test errors (router.tsx, logger.ts, VerifyEmailPage.tsx) by
      reading each error and fixing the underlying type issue. Do NOT use `// @ts-ignore` or
      `as any` casts to suppress.
- [x] 1.5 Edit `apps/web/deno.json`. Change the `"check"` task to run both lint and type-check:
      `"check": "deno lint src/ && deno run -A npm:typescript/tsc --noEmit -p tsconfig.json"`.
      **Verified invocation:** `deno run -A npm:typescript/tsc` executes the TypeScript compiler via
      Deno's npm compatibility layer — no Node installation needed (the Docker `app` container is
      Deno-only). The `npm:typescript/tsc` binary export is the correct subpath (not `npm:tsc`,
      which is a stub package). The `--noEmit -p tsconfig.json` flags read the web tsconfig (with
      path aliases and strict mode). The `--ignoreDeprecations 6.0` and
      `--allowImportingTsExtensions` flags are in `tsconfig.json` (task 1.1), so the CLI doesn't
      need them.
- [x] 1.6 Verify `make check-web` now runs `tsc --noEmit` and passes with zero type errors (after
      tasks 1.1–1.4 fixes and the task 5 shadow-type fixes). **Note:** `make check-web` will not
      pass until task 5 (shadow-type deletion) is complete, because the 56 `RecipeDetailPage.tsx`
      errors are deferred to task 5. Either (a) complete task 5 before running `make check-web`, or
      (b) temporarily exclude `RecipeDetailPage.tsx` from the tsconfig `include` until task 5
      lands. **Prefer (a)** — task 5 is part of D42 and should land before the type-check gate is
      wired into CI.
- [x] 1.7 Run `make lint` and `make fmt` — must pass.

## 2. D42 — Shared schema type exports (barrel gap + missing request types)

- [x] 2.1 Edit `packages/shared/src/schemas/index.ts`. Add `export type { ... } from
      './responses/...'` re-exports for ALL response `*Output` types. Mirror how request types are
      already re-exported (lines 16, 41, 44, 46). At minimum, re-export: `RecipeDetailOutput`,
      `RecipeListItemOutput` (added in task 3.1), `RecipeVersionRow`, `RecipeRow`,
      `RecipeWithAuthorOutput`, `RecipeWithVersionsOutput`, `FeedRecipeOutput`, `BeanOutput`,
      `SetupOutput`, `EquipmentOutput`, `EquipmentRecipesResponse`,
      `EquipmentDeleteRequestResponse`, `PublicUserOutput`, `SelfUserOutput`,
      `UserPreferencesOutput`, `TasteNoteNodeOutput`, `TasteNoteOutput`,
      `FollowerListItemOutput`, `FollowingListItemOutput`, `FollowOutput`, `CommentOutput`,
      `CommentWithRepliesOutput`, `BadgeOutput`, `VendorOutput`, `PhotoOutput`,
      `CoffeeVarietyOutput`, `ReportOutput`. Verify each type is actually exported from its
      per-domain file (they should be, per Wave 2).
- [x] 2.2 Add the missing request type exports. For each, add `export type X = z.infer<typeof
      XSchema>` to the per-domain file AND `export type { X } from './<domain>.ts'` to
      `schemas/index.ts`:
      - `packages/shared/src/schemas/recipe.ts`: `RecipeCreate`, `RecipeUpdate`, `RecipeFork`,
        `RecipeRate`, `RecipeNotes` (5 types; schemas already exist, just add the `z.infer` export)
      - `packages/shared/src/schemas/user.ts`: `UserProfileUpdate`
      - `packages/shared/src/schemas/preferences.ts`: `UserPreferences` (the nested request shape —
        NOT the flat `UserPreferencesOutput`)
      - `packages/shared/src/schemas/taste.ts`: `TasteNoteCreate`, `TasteNoteUpdate`
      - `packages/shared/src/schemas/follow.ts`: `Follow`
      - `packages/shared/src/schemas/comment.ts`: `CommentCreate`
- [x] 2.3 Run `make check-shared` and `make test-shared` — must pass. The new type exports are
      additive (no runtime change); existing schema tests must pass unchanged.
- [x] 2.4 Run `make lint` and `make fmt`.

## 3. D42 — New/extended shared recipe schemas (list-item + detail overlay)

- [x] 3.1 Add `RecipeListItemOutputSchema` to `packages/shared/src/schemas/responses/recipe.ts`.
      Derive it from the ACTUAL `recipe/model.ts findMany` / `findCursor` return shape — read the
      model function to see exactly what fields it returns. Include (at minimum): `id`, `slug`,
      `title`, `author` (mini author ref), `visibility`, `currentVersion` (optional nested badge
      data), `likeCount`, `commentCount`, `forkCount`, `favouriteCount`, `avgRating`, `userLiked`,
      `userFavourited`, `featured`, `createdAt`. Export `export type RecipeListItemOutput =
      z.infer<typeof RecipeListItemOutputSchema>`. Re-export through `schemas/index.ts` (task 2.1
      already lists it).
- [x] 3.2 Extend `RecipeDetailOutputSchema` in `packages/shared/src/schemas/responses/recipe.ts`
      to include the per-request overlay fields that `recipe/model.ts findById` returns:
      `userLiked` (boolean), `userFavourited` (boolean), `avgRating` (number | null), `userRating`
      (number | null), `favouriteCount` (number), and `currentVersion` (optional
      `RecipeDetailVersionOutput` — the latest version's nested `tasteNotes[]`, `equipment[]`,
      `bean`). Read `recipe/model.ts findById` to verify the exact return shape. Keep the existing
      `versions[]` array and `forkedFrom` field.
- [x] 3.3 Add `PaginatedResponse<T>` to `packages/shared/src/schemas/response.ts`:
      ```typescript
      export type PaginatedResponse<T> = {
        success: true;
        data: T[];
        meta: { requestId: string; pagination: PaginationMeta };
      };
      ```
      Re-export through `schemas/index.ts`.
- [x] 3.4 Add unit tests for the new/extended schemas in
      `packages/shared/src/schemas/responses/recipe.test.ts` (extend the existing file): assert
      `RecipeListItemOutputSchema` parses a valid list-item shape and rejects missing required
      fields; assert `RecipeDetailOutputSchema` parses a shape with the new overlay fields. Add the
      `RecipeListItemOutputSchema` to the OpenAPI tag registry if needed (check
      `apps/api/src/routes/openapi.ts`).
- [x] 3.5 Run `make test-api` (includes `openapi.coverage.test.ts`) — must pass. The extended
      `RecipeDetailOutputSchema` must not break OpenAPI coverage. Run `make check` and `make lint`.

## 4. D42 — Replace Record<string, unknown> in api/index.ts

- [x] 4.1 Edit `apps/web/src/api/index.ts`. Replace all 28 lines containing
      `Record<string, unknown>` (some lines have 2 occurrences — a param and a return type —
      totaling ~32 individual usages across 24 API functions) with shared types, in order
      (highest-traffic first):
      - **recipes** (lines 50-63): `recipeApi.create` accepts `RecipeCreate`, returns
        `RecipeDetailOutput`; `recipeApi.update` accepts `RecipeUpdate`, returns
        `RecipeDetailOutput`; `recipeApi.fork` returns `RecipeDetailOutput`; `recipeApi.compare`
        returns the compare response type (check the API's compare route return shape);
        `recipeApi.like`/`favourite`/`feature`/`saveNotes` return their respective output types
        (check `MessageResponseSchema` or the specific route's response).
      - **users/profile** (lines 31, 33): `userApi.updateProfile` accepts `UserProfileUpdate`;
        `userApi.getProfile` returns `PublicUserOutput`.
      - **follow** (lines 138-141): `followApi.follow` returns `FollowOutput`;
        `followApi.followers` returns `FollowerListItemOutput[]`; `followApi.following` returns
        `FollowingListItemOutput[]`.
      - **setups** (lines 74-78): `setupApi.list` returns `SetupOutput[]`; `setupApi.create`
        accepts `SetupCreate`, returns `SetupOutput`; `setupApi.get` returns `SetupOutput`;
        `setupApi.update` accepts `SetupUpdate`, returns `SetupOutput`.
      - **beans** (lines 83-87): `beanApi.list` returns `BeanOutput[]`; `beanApi.get` returns
        `BeanOutput`; `beanApi.create` accepts `BeanCreate`, returns `BeanOutput`; `beanApi.update`
        accepts `BeanUpdate`, returns `BeanOutput`.
      - **equipment** (lines 93-95): `equipmentApi.create` accepts `EquipmentCreate`, returns
        `EquipmentOutput`; `equipmentApi.update` accepts `EquipmentUpdate`, returns
        `EquipmentOutput`.
      - **taste hierarchy** (line 67): `tasteApi.hierarchy` returns `TasteNoteNodeOutput[]`.
      - **getWithMeta calls** (lines 39, 45): change `api.getWithMeta<{ data: RecipeListItem[];
        meta: { pagination?: { total: number } } }>` to `api.getWithMeta<PaginatedResponse<
        RecipeListItemOutput>>`.
- [x] 4.2 Run `make check-web` (now includes `tsc --noEmit`) — must pass. Fix any type mismatches
      that surface. If a mismatch is because the shared schema is wrong (doesn't match what the API
      actually returns), fix the schema (task 3). If a mismatch is because the web page reads a
      field the schema doesn't have, fix the page (task 5).
- [x] 4.3 Run `make lint` and `make fmt`.

## 5. D42 — Delete api/types.ts and per-page shadow types

- [x] 5.1 Delete `apps/web/src/api/types.ts`. Update all 25+ import sites to import from
      `@brewform/shared/schemas` or `@brewform/shared/types` instead. Map each deleted type to its
      shared replacement: `RecipeDetailResponse` → `RecipeDetailOutput`; `RecipeListItem` →
      `RecipeListItemOutput`; `RecipeVersionResponse` → `RecipeVersionRow`;
      `PaginatedResponse<T>` → shared `PaginatedResponse<T>`; etc.
- [x] 5.2 Delete per-page shadow types and import shared types instead. For each page, delete the
      local `interface` and replace its usage with the shared `*Output` type:
      - `BeanListPage.tsx:9-17` — delete `interface Bean`, use `BeanOutput`. **Fix the
        `productName` vs `name` fallout:** check whether `BeanOutputSchema` uses `name` (it does,
        per research). If `BeanListPage` accessed `bean.productName`, change it to `bean.name`. If
        the API genuinely returns `productName`, extend `BeanOutputSchema` and update OpenAPI.
      - `SetupListPage.tsx:9-16` — delete `interface Setup`, use `SetupOutput`.
      - `EquipmentListPage.tsx:8-15` — delete `interface EquipmentItem`, use `EquipmentOutput`.
      - `EquipmentDetailPage.tsx:12-29` — delete `EquipmentDetail` and `RecipeEntry`, use
        `EquipmentOutput` and `RecipeWithAuthorOutput`.
      - `UserProfilePage.tsx:12-38` — delete `UserProfile` and `FollowRecord`, use
        `PublicUserOutput` and `FollowerListItemOutput | FollowingListItemOutput`.
      - `TasteNotesPage.tsx:11-20` — delete `interface TasteCategory`, use `TasteNoteNodeOutput`.
      - `CoffeeVarietiesPage.tsx:13` and `CoffeeVarietyDetailPage.tsx:12-35` — delete local
        interfaces, use `CoffeeVarietyOutput` and `RecipeWithAuthorOutput`.
      - `RecipeVersionsPage.tsx:12` — delete `VersionSummary`, use `RecipeVersionRow`.
      - `SettingsPage.tsx:10-22` — delete `interface Preferences`, use the nested request type
        (`UserPreferences` from shared) for PATCH and `UserPreferencesOutput` for GET.
      - All 15 admin pages: delete local interfaces (`AdminBadgesPage.Badge`,
        `AdminTasteNotesPage.TasteNote`, `AdminEquipmentPage.EquipmentItem`,
        `AdminVendorsPage.Vendor`, `AdminRecipesPage.Recipe`, `AdminAuditLogPage.AuditLogEntry`,
        `AdminCompatibilityPage.CompatibilityRule`, `AdminCoffeeVarietiesPage.CoffeeVarietyItem`,
        `AdminDashboard.DashboardStats`). For types without a shared equivalent
        (`AuditLogEntry`, `CompatibilityRule`, `DashboardStats`), either add a shared response
        schema or keep a local type documented as "no shared schema exists yet".
- [x] 5.3 Remove the 5 real `as` casts: `SetupListPage.tsx:38` (`data as Setup[]`),
      `EquipmentListPage.tsx:40` (`data as EquipmentItem[]`), `TasteNotesPage.tsx:234`
      (`(data ?? []) as TasteCategory[]`), `OnboardingWizard.tsx:26,36`
      (`as Record<string, unknown>`), `SettingsPage.tsx:75` (`as Record<string, unknown>`).
      These become unnecessary once API functions return typed payloads.
- [x] 5.4 Run `make check-web` — must pass with zero type errors. Run `make test-web` — existing
      tests must pass (the type changes are compile-time; runtime behaviour unchanged).
- [x] 5.5 Grep gate: `grep -rn "^interface Bean\b\|^interface Setup\b\|^interface EquipmentItem\b\|^interface UserProfile\b\|^interface TasteCategory\b" apps/web/src/pages/` → zero matches. `grep -n "Record<string, unknown>" apps/web/src/api/index.ts` → zero matches. `ls apps/web/src/api/types.ts` → file does not exist.

## 6. D42 — Type-level regression test

- [x] 6.1 Create `apps/web/src/api/types.regression.test.ts` (or add to an existing api test file).
      Add a `// @ts-expect-error` assertion that accessing a non-existent field on a derived
      response type fails:
      ```typescript
      import type { RecipeDetailOutput } from '@brewform/shared/schemas';

      // @ts-expect-error — nonExistentField does not exist on RecipeDetailOutput
      const _test: RecipeDetailOutput['nonExistentField'] = null;
      ```
      This is a type-level test — it runs via `tsc --noEmit`, not Vitest. If `tsc` doesn't run on
      test files, add it to a non-test file or ensure the tsconfig includes test files.
- [x] 6.2 Run `make check-web` — must pass (the `@ts-expect-error` is satisfied because the type
      error is expected).

## 7. D43 — Add createdAt to three join tables

- [x] 7.1 Edit `packages/db/src/schema.ts`. Add to `recipeTasteNotes` (line 241, after the
      `intensity` column): `createdAt: timestamp('created_at', { withTimezone: true })
      .notNull().defaultNow(),`. Add a docblock line above noting the column exists for audit
      purposes.
- [x] 7.2 Edit `packages/db/src/schema.ts`. Add the same `createdAt` column to `recipeEquipment`
      (line 263, after the `equipmentId` column) and `recipeVersionPhotos` (line 330, after the
      `sortOrder` column), with the same docblock.
- [x] 7.3 Run `make db-generate` — generates `packages/db/drizzle/0008_<codename>.sql` with three
      `ALTER TABLE ... ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL`
      statements. Review the generated SQL — must contain exactly three ALTER TABLE statements, no
      CREATE INDEX. **Do NOT manually edit the generated SQL.**
- [x] 7.4 Run `make db-migrate` — applies the migration to the dev database. Verify with psql or
      `make db-studio` that the columns exist and existing rows have non-null `createdAt`.
- [x] 7.5 Run `make check` (schema type-check) and `make test-api` (recipe relation queries must
      not break). Run `make db-seed` — seed must succeed without modification (defaultNow handles
      the new column).

## 8. D43 — Tests for the new columns

- [x] 8.1 Add a column-existence assertion to `packages/db/src/schema-indexes.test.ts` (or create
      `packages/db/src/schema-columns.test.ts`). Use `getTableConfig(table).columns` to assert
      `recipeTasteNotes`, `recipeEquipment`, `recipeVersionPhotos` each have a `createdAt` column
      with `notNull` and a `default` expression. Follow the existing `schema-indexes.test.ts`
      pattern (one describe per table).
- [x] 8.2 Edit `apps/api/src/modules/recipe/model.create.test.ts`. After the
      `createRecipeWithRelations` assertions, add a check that the inserted `recipeTasteNotes` /
      `recipeEquipment` / `recipeVersionPhotos` rows have non-null `createdAt` (select them via
      `db.select().from(...)` and assert `createdAt` is a valid Date).
- [x] 8.3 Run `make test` (DB tests + API tests) — must pass.

## 9. D35 — Delete vestigial lint directives (6 files)

- [x] 9.1 Delete line 1 (`// deno-lint-ignore-file no-explicit-any require-await`) from:
      - `packages/shared/src/schemas/compatibility.ts`
      - `packages/shared/src/schemas/report.ts`
      - `packages/shared/src/logger/index.ts`
      - `packages/shared/src/logger/types.ts`
- [x] 9.2 Delete line 1 (`// deno-lint-ignore-file require-await`) from:
      - `apps/api/src/modules/coffee-variety/model.ts`
      - `apps/api/src/modules/coffee-variety/service.ts`
- [x] 9.3 Run `make lint` — must pass (the deleted directives suppressed only excluded rules,
      so removing them changes nothing). Run `make check` — must pass.

## 10. D35 — Narrow openapi/index.ts directive

- [x] 10.1 Edit `apps/api/src/utils/openapi/index.ts`. Delete the file-level
       `// deno-lint-ignore-file no-explicit-any` on line 1. Add a line-level
       `// deno-lint-ignore no-explicit-any` immediately above the `as any` cast on line 29 (after
       the justification comment on line 28).
- [x] 10.2 Run `make lint` — must pass. The line-level directive covers exactly the `as any`
       statement.

## 11. D35 — Delete dead logger code in middleware

- [x] 11.1 Edit `apps/api/src/middleware/cors.ts`. Delete: the `import { createLogger }` line
       (line 3), the `// deno-lint-ignore no-unused-vars` directive (line 5), and the
       `const log = createLogger('cors-middleware')` line (line 6).
- [x] 11.2 Edit `apps/api/src/middleware/requestId.ts`. Delete: the `import { createLogger }` line
       (line 2), the `// deno-lint-ignore no-unused-vars` directive (line 12), and the
       `const log = createLogger('request-id-middleware')` line (line 13).
- [x] 11.3 Run `make lint` — must pass (no `no-unused-vars` violation because the unused const is
       gone). Run `make check` and `make test-api` — must pass (the middleware still works; the
       logger was never called).

## 12. D39 Tier 2 — API model tests (9 files)

- [x] 12.1 Create `apps/api/src/modules/badge/model.test.ts`. Follow the
       `equipment/model.test.ts` pattern (lint-ignore header, `test-setup.ts` first import, inline
       `crypto.randomUUID()` fixtures, `afterEach` hard-delete, `{ sanitizeOps: false,
       sanitizeResources: false }` on DB describes). Cover `findMany`/`findById`/`search`/
       `create`/`update`/`softDelete` (where they exist), prioritising soft-delete and ownership
       paths.
- [x] 12.2 Create `apps/api/src/modules/bean/model.test.ts`. Same pattern. Cover
       `findMany`/`findById`/`create`/`update`/`softDelete`.
- [x] 12.3 Create `apps/api/src/modules/comment/model.test.ts`. Same pattern. Cover
       `findMany`/`findById`/`create`/`update`/`softDelete`.
- [x] 12.4 Create `apps/api/src/modules/follow/model.test.ts`. Same pattern. Cover
       `findMany`/`create`/`delete` (follow is insert/delete, no soft-delete).
- [x] 12.5 Create `apps/api/src/modules/photo/model.test.ts`. Same pattern. Cover
       `findMany`/`findById`/`create`/`softDelete`.
- [x] 12.6 Create `apps/api/src/modules/preference/model.test.ts`. Same pattern. Cover
       `upsert`/`findById` (preference is upsert, not create/update).
- [x] 12.7 Create `apps/api/src/modules/qrcode/model.test.ts`. Same pattern. Cover
       `findById`/`create` (qrcode is a thin model).
- [x] 12.8 Create `apps/api/src/modules/report/model.test.ts`. Same pattern. Cover
       `findMany`/`findById`/`create`/`updateStatus` (report has status transitions).
- [x] 12.9 Create `apps/api/src/modules/setup/model.test.ts`. Same pattern. Cover
       `findMany`/`findById`/`create`/`update`/`softDelete`.
- [x] 12.10 Run `make test-api` — all 9 new model test files MUST pass. Run `make lint` and
        `make fmt`.

## 13. D39 Tier 2 — API route tests (9 files)

- [x] 13.1 Create `apps/api/src/modules/preference/index.test.ts`. Follow the
       `report/index.test.ts` pattern (invoke Hono app via `app.request('/api/v1/...')`, assert
       status codes + response bodies). Cover auth guards, validation, error mapping.
- [x] 13.2 Create `apps/api/src/modules/bean/index.test.ts`. Same pattern.
- [x] 13.3 Create `apps/api/src/modules/setup/index.test.ts`. Same pattern.
- [x] 13.4 Create `apps/api/src/modules/photo/index.test.ts`. Same pattern.
- [x] 13.5 Create `apps/api/src/modules/taste/index.test.ts`. Same pattern.
- [x] 13.6 Create `apps/api/src/modules/user/index.test.ts`. Same pattern.
- [x] 13.7 Create `apps/api/src/modules/badge/index.test.ts`. Same pattern.
- [x] 13.8 Create `apps/api/src/modules/qrcode/index.test.ts`. Same pattern.
- [x] 13.9 Create `apps/api/src/modules/vendor/index.test.ts`. Same pattern.
- [x] 13.10 Run `make test-api` — all 9 new route test files MUST pass.

## 14. D39 Tier 2 — API util tests (4 files)

- [x] 14.1 Create `apps/api/src/utils/jobs/cron.test.ts` (path correction: `utils/jobs/`, NOT
       `jobs/`). Assert schedule registration, job execution. Follow the
       `bodyLimit.test.ts` pattern where applicable.
- [x] 14.2 Create `apps/api/src/utils/openapi/index.test.ts`. Schema conversion smoke:
       `z.toJSONSchema` produces valid output for a test schema.
- [x] 14.3 Create `apps/api/src/utils/upload/index.test.ts`. Cover `generateFilename`,
       `generateThumbnailFilename`, `getPublicUrl`, `saveUploadedFile`, `saveThumbnail`,
       `getThumbnailSizes`, `validateImageUpload` (the last is partially covered by
       `bodyLimit.test.ts:156-165` — consolidate if appropriate).
- [x] 14.4 Create `apps/api/src/middleware/requestId.test.ts`. Follow the `bodyLimit.test.ts`
       pattern (stub Hono app + `app.request()`). Assert the `X-Request-ID` header is read or
       generated and attached to context.
- [x] 14.5 Run `make test-api` — all 4 new util test files MUST pass.

## 15. D39 Tier 3 — Web page tests (4 files)

- [x] 15.1 Create `apps/web/src/pages/auth/ForgotPasswordPage.test.tsx`. Follow the
       `model-test-coverage` spec web conventions (Vitest + testing-library, `vi.hoisted` logger
       mock, `createMemoryRouter` + `RouterProvider`). Cover: page renders, form submission calls
       the API, error display.
- [x] 15.2 Create `apps/web/src/pages/auth/ResetPasswordPage.test.tsx`. Same pattern. Cover:
       page renders, form submission, success/error paths.
- [x] 15.3 Create `apps/web/src/pages/beans/BeanListPage.test.tsx`. Same pattern. Cover: page
       renders bean list, empty state, error state. Mock `beanApi.list`.
- [x] 15.4 Create `apps/web/src/pages/setups/SetupListPage.test.tsx`. Same pattern. Cover: page
       renders setup list, empty state. Mock `setupApi.list`.
- [x] 15.5 Run `make test-web` — all 4 new web page test files MUST pass.

## 16. D39 Tier 3 — Web component tests (6 files)

- [x] 16.1 Create `apps/web/src/components/onboarding/OnboardingWizard.test.tsx`. Cover: wizard
       renders, step navigation, completion calls `api.patch('/preferences')`.
- [x] 16.2 Create `apps/web/src/components/photos/PhotoUpload.test.tsx`. Cover: file selection,
       upload call, error display.
- [x] 16.3 Create `apps/web/src/components/qrcode/RecipeQRCode.test.tsx`. Cover: renders QR code
       (mock canvas/SVG rendering if jsdom limitations).
- [x] 16.4 Create `apps/web/src/components/recipe/ScaaRadarChart.test.tsx`. Cover: renders chart
       (mock SVG if needed), receives correct props.
- [x] 16.5 Create `apps/web/src/components/recipe/StarRating.test.tsx`. Cover: renders stars,
       click callback, read-only vs interactive mode.
- [x] 16.6 Create `apps/web/src/components/recipe/StatCards.test.tsx`. Cover: renders stat cards
       with correct values from props.
- [x] 16.7 Run `make test-web` — all 6 new component test files MUST pass.

## 17. D39 Tier 3 — Web hooks/utils/contexts tests (5 files)

- [x] 17.1 Create `apps/web/src/hooks/useDebounce.test.ts`. Use `renderHook` from
       `@testing-library/react`. Cover: debounced value updates after delay, immediate value is
       initial.
- [x] 17.2 Create `apps/web/src/utils/recipe-filters.test.ts`. Cover: filter parsing,
       serialisation, URL param round-trip.
- [x] 17.3 Create `apps/web/src/utils/sessionId.test.ts`. Cover: ID generation, storage,
       retrieval.
- [x] 17.4 Create `apps/web/src/contexts/I18nContext.test.tsx`. Wrap a test consumer in
       `I18nProvider`, assert locale value, locale switch updates context.
- [x] 17.5 Create `apps/web/src/contexts/ThemeContext.test.tsx`. Wrap a test consumer in
       `ThemeProvider`, assert theme value, theme switch updates context.
- [x] 17.6 Run `make test-web` — all 5 new test files MUST pass.

## 18. D39 Tier 3 — Shared input schema tests (6 files)

- [x] 18.1 Create `packages/shared/src/schemas/bean.test.ts`. Mirror the existing
       `equipment.test.ts` pattern: assert valid inputs parse, invalid inputs fail, refinements
       fire.
- [x] 18.2 Create `packages/shared/src/schemas/comment.test.ts`. Same pattern.
- [x] 18.3 Create `packages/shared/src/schemas/follow.test.ts`. Same pattern.
- [x] 18.4 Create `packages/shared/src/schemas/photo.test.ts`. Same pattern.
- [x] 18.5 Create `packages/shared/src/schemas/setup.test.ts`. Same pattern.
- [x] 18.6 Create `packages/shared/src/schemas/vendor.test.ts`. Same pattern.
- [x] 18.7 Run `make test-shared` — all 6 new schema test files MUST pass.

## 19. Final verification

- [x] 19.1 Run `make check` — type-check all workspaces (NOW includes web `tsc --noEmit`). Must
       pass with zero type errors.
- [x] 19.2 Run `make lint` — lint all apps and packages. Must pass with no new suppressions.
- [x] 19.3 Run `make fmt` — apply `deno fmt`. Mandatory before commit/PR.
- [x] 19.4 Run `make test` — all tests via Docker with `--allow-all`. Includes: 37 new D39 test
       files, D43 column/insertion tests, D42 type-level regression test, all pre-existing tests
       (zero regressions).
- [x] 19.5 Grep gates:
       - `grep -n "Record<string, unknown>" apps/web/src/api/index.ts` → zero hits (D42)
       - `ls apps/web/src/api/types.ts` → file does not exist (D42)
       - `grep -rn "deno-lint-ignore-file" packages/shared/src apps/api/src --glob='*.ts' --glob='*.tsx' | grep -v test` → zero matches (D35)
       - `grep -rn "^interface Bean\b\|^interface Setup\b\|^interface EquipmentItem\b\|^interface UserProfile\b" apps/web/src/pages/` → zero matches (D42 shadow types deleted)
       - `grep -n "createdAt" packages/db/src/schema.ts | grep -E "recipeTasteNotes|recipeEquipment|recipeVersionPhotos"` → confirm createdAt added (D43; this grep is approximate — verify by reading the three table definitions)
- [x] 19.6 Manual verification (optional but recommended):
       - `make dev`; walk recipe list, recipe detail, profile, setups/beans/equipment pages —
         verify no render regressions from the D42 type changes.
       - Check the `BeanListPage` specifically — the `productName` → `name` fallout fix should
         render bean names correctly.
       - Run `make db-migrate` on a seeded DB — verify `createdAt` columns exist and rows are
         backfilled.
- [x] 19.7 Update `plans/ROADMAP.md` — mark D42, D43, D35, D39 (Tier 2/3) as resolved under
       "Wave 4".
- [x] 19.8 Update `plans/TECHNICAL_DEBT.md` — mark §4.6 (D42), §5.5 (D43), §2.7 (D35), §6.6
       (D39 Tier 2/3) as resolved with the date and change name `wave-4-independent-fillers`.