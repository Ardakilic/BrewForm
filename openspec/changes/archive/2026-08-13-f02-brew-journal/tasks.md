## 1. Database schema

- [x] 1.1 Add `brewLogs` table to `packages/db/src/schema.ts` per spec (12 columns, 3 indexes,
      3 CHECKs); add docblocks to the table definition following existing table conventions
- [x] 1.2 Add `brewLogsRelations` block and `brewLogs: many(brewLogs)` lines to `usersRelations`,
      `recipesRelations`, `recipeVersionsRelations` (additive only)
- [x] 1.3 Run `make db-generate` — expect `0014_<codename>.sql`; verify it contains the table,
      indexes, CHECKs, and FKs; do NOT hand-edit the SQL
- [x] 1.4 Run `make db-generate` again — assert "No schema changes, nothing to migrate"
- [x] 1.5 Run `make db-migrate` against the dev DB
- [x] 1.6 Extend `packages/db/src/schema-indexes.test.ts` with the three `brew_log` index
      assertions (composite column order + `isUnique: false`)
- [x] 1.7 Extend `packages/db/src/schema-columns.test.ts` with `brewLogs` column assertions
      (`createdAt`/`updatedAt` notNull + default, `deletedAt` nullable, actuals/rating/notes
      nullable)
- [x] 1.8 Extend `packages/db/src/schema-constraints.test.ts` with the three CHECK constraints
- [x] 1.9 Run `make test-specific filter=schema-` until all DB schema tests pass

## 2. Shared schemas

- [x] 2.1 Create `packages/shared/src/schemas/brew-log.ts` with `BrewLogCreateSchema`,
      `BrewLogUpdateSchema` (nullable fields + at-least-one-field refine), inferred types, and
      docblocks
- [x] 2.2 Create `packages/shared/src/schemas/responses/brew-log.ts` with
      `BrewLogOutputSchema`, `BrewLogListItemOutputSchema`, `UserBrewStatsOutputSchema`,
      `RecipeBrewStatsOutputSchema` (+ inferred types, docblocks, `brewCount`/`avgBrewRating`
      naming note)
- [x] 2.3 Export from `packages/shared/src/schemas/index.ts` and
      `packages/shared/src/schemas/responses/index.ts` (explicit type re-exports in the schemas
      barrel)
- [x] 2.4 Write `packages/shared/src/schemas/brew-log.test.ts` (create/update validation incl.
      rating bounds, positive actuals, empty-update rejection, null clearing)
- [x] 2.5 Write `packages/shared/src/schemas/responses/brew-log.test.ts` (fixture parse tests)
- [x] 2.6 Run `make test-shared` and `make check` until green

## 3. API model layer

- [x] 3.1 Create `apps/api/src/modules/brew-log/model.ts` with `findById`, `findByUserId`,
      `findByRecipeIdAndUser`, `create`, `update` (sets `updatedAt`), `softDelete`,
      `getRecipeBrewStats`, `getUserBrewStats`; `isNull(deletedAt)` on every read; recipe join
      filtered by `isNull(recipes.deletedAt)`; docblocks on every exported function
- [x] 3.2 Write `apps/api/src/modules/brew-log/model.test.ts` (test-setup import first, real DB,
      fixture helpers + cleanup, `sanitizeResources/sanitizeOps: false` describe options) covering
      CRUD, ordering, soft-delete exclusion, deleted-recipe exclusion, and both stats aggregates
      (incl. null average case)
- [x] 3.3 Run `make test-specific filter=modules/brew-log/model.test.ts` until green

## 4. API service layer

- [x] 4.1 Create `apps/api/src/modules/brew-log/service.ts` with `createLogger('brew-log-service')`,
      entry/exit debug + error logging, and `createBrewLog` / `updateBrewLog` / `deleteBrewLog` /
      `listUserBrewLogs` / `listRecipeBrewLogs` / `getRecipeBrewStats` / `getUserBrewStats`
      implementing the spec's validation and ownership rules (string-error throws); docblocks on
      every exported function
- [x] 4.2 Write `apps/api/src/modules/brew-log/service.test.ts` covering: create success (public
      recipe, own private recipe), `RECIPE_NOT_FOUND` (missing/soft-deleted/other's private),
      `RECIPE_VERSION_MISMATCH`, cross-user update/delete → `BREW_LOG_NOT_FOUND`, list scoping,
      stats shapes
- [x] 4.3 Run `make test-specific filter=modules/brew-log/service.test.ts` until green

## 5. API routes + OpenAPI

- [x] 5.1 Create `apps/api/src/modules/brew-log/index.ts`: `deps` middleware proxy, 7 routes in
      the spec's order, each with `describeRoute()` (`tags: ['Brew Logs']`, `security` on guarded
      routes, `parameters`, `jsonRequestBody()` for POST/PATCH, `resolver()` envelopes incl.
      `ErrorEnvelopeSchema` for 401/404/400), `zValidator(..., zodValidationHook)`, and
      catch-block error mapping
- [x] 5.2 Register in `apps/api/src/routes/index.ts` (`routes.route('/api/v1/brew-logs', brewLog)`)
- [x] 5.3 Add the `Brew Logs` tag to `apps/api/src/routes/openapi.ts`
- [x] 5.4 Add `/api/v1/brew-logs` to `IN_SCOPE_BASE_PATHS` in
      `apps/api/src/routes/openapi.coverage.test.ts`
- [x] 5.5 Write `apps/api/src/modules/brew-log/index.test.ts` using `createTestApp(userId)`
      covering: 201 create, 401 unauthenticated (create/list/stats-user), 400 validation +
      version mismatch, 404 not-found (PATCH/DELETE, cross-owner), 200 update/delete round-trip,
      paginated list ordering + recipe scoping, user stats, public recipe stats (incl. unauth
      access and null average)
- [x] 5.6 Run `make test-api` until green (incl. OpenAPI coverage test)

## 6. Web API client + i18n

- [x] 6.1 Add `brewLogApi` to `apps/web/src/api/index.ts` typed via `z.infer` from
      `@brewform/shared/schemas` (`getWithMeta<PaginatedResponse<BrewLogListItemOutput>>` for the
      two lists, `api.get` for stats, `api.post/patch/delete` for mutations)
- [x] 6.2 Add `brewLog.*` keys to `packages/shared/src/i18n/en.json` and `tr.json` (identical key
      sets) covering list page, form labels/placeholders/validation, cards, stats, history section,
      profile tab, and empty states
- [x] 6.3 Run `make test-shared` (i18n parity) until green

## 7. Web pages + components

- [x] 7.1 Create `apps/web/src/components/brew-log/BrewLogCard.tsx` (+ test) rendering one log:
      recipe title link, `brewedAt`, actuals, rating, notes excerpt
- [x] 7.2 Create `apps/web/src/components/brew-log/BrewLogForm.tsx` (+ test) with `brewedAt`
      native datetime input, `yieldActual`/`doseActual` number inputs, `notes` textarea,
      `personalRating` 1–10 input, client constraints matching the shared schemas, create + edit
      modes
- [x] 7.3 Create `apps/web/src/pages/brew-logs/BrewLogListPage.tsx` (+ test) with loader,
      `BrewLogCard` list, `PaginationControls`, new-log link; mount/unmount logging
- [x] 7.4 Create `apps/web/src/pages/brew-logs/BrewLogFormPage.tsx` (+ test) serving
      `/brew-logs/new` (loader reads `recipeId`/`recipeVersionId` search params, fetches recipe,
      prefills actuals from version params) and `/brew-logs/:id/edit` (loader fetches log, rejects
      non-owners); submit navigates to `/brew-logs`
- [x] 7.5 Create `apps/web/src/components/brew-log/RecipeBrewStats.tsx` (+ test) showing brew
      count + average personal rating (null-average case: count only)
- [x] 7.6 Create `apps/web/src/components/brew-log/BrewHistorySection.tsx` (+ test) listing the
      viewer's recent logs for the recipe with a header action linking to the prefilled create
      form ("Brew Again")
- [x] 7.7 Add the three routes to `apps/web/src/router.tsx` (`brew-logs`, `brew-logs/new`,
      `brew-logs/:id/edit`) with `RequireAuth`, loaders, and `errorElement`; update
      `apps/web/src/router.test.tsx`
- [x] 7.8 Wire `RecipeBrewStats` (all visitors) and `BrewHistorySection` (auth only) into
      `RecipeDetailPage.tsx` main column; update `RecipeDetailPage.test.tsx`
- [x] 7.9 Add the `brews` tab to `UserProfilePage.tsx` (tab union + loader branch + button +
      render block), rendered only on the viewer's own profile; update `UserProfilePage.test.tsx`

## 8. Seed + housekeeping

- [x] 8.1 Add idempotent `seedBrewLogs` helper to `packages/db/src/seed.ts` (check-before-insert,
      called from `main()`); run `make db-seed` twice to verify idempotency
- [x] 8.2 Prepend a shipped-banner to `plans/F02-brew-journal.md` pointing at this change once
      archived (housekeeping, matches F05/F11 convention)
- [x] 8.3 Update `plans/ROADMAP.md` F02 row status once archived

## 9. Final verification

- [x] 9.1 Run `make fmt`
- [x] 9.2 Run `make check` — all workspaces green
- [x] 9.3 Run `make lint` — clean
- [x] 9.4 Run `make test` — full suite green (API incl. OpenAPI coverage, shared incl. i18n
      parity, DB schema assertions, web page/component tests)
