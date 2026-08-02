# Tasks — f11-advanced-search

> Self-contained checklist. Each task references the design.md Implementation Reference (Rn) skeletons.
> Phases are sequential — each phase is independently runnable after the prior completes.
> Run `make fmt` after each batch of edits (symbolic edits may not match deno fmt whitespace rules).

## Phase 1: Shared schema + DB index + i18n

- [ ] **T1**: Extend `RecipeFilterSchema` in `packages/shared/src/schemas/recipe.ts` (current line ~130). Add `author` (`z.string().max(100).optional()`), `dateFrom` (`z.coerce.date().optional()`), `dateTo` (`z.coerce.date().optional()`), `minRating` (`z.coerce.number().int().min(1).max(10).optional()`), `maxRating` (`z.coerce.number().int().min(1).max(10).optional()`). Add JSDoc above each new field. Remove the `grinder` field (line ~159). Use the R1 skeleton verbatim.
- [ ] **T2**: Export the inferred `RecipeFilterCriteria` type update — update `apps/api/src/modules/recipe/model.ts:72-82` `RecipeFilterCriteria` interface to add `author?: string`, `dateFrom?: Date`, `dateTo?: Date`, `minRating?: number`, `maxRating?: number`, and remove `grinder?: string` if present (it was never on the interface, only on the schema — verify). Use the R2 skeleton.
- [ ] **T3**: Add `recipe_visibility_featured_idx` composite index to `packages/db/src/schema.ts` recipes table indexes array (after the existing `recipe_visibility_like_count_idx` at ~line 185). Use: `index('recipe_visibility_featured_idx').on(table.visibility, table.featured)`. Add a JSDoc comment above explaining the query pattern it covers. Use the R3 skeleton.
- [ ] **T4**: Run `make db-generate && make db-migrate` to generate and apply the index migration. Verify the generated SQL contains only `CREATE INDEX recipe_visibility_featured_idx`. Do NOT hand-edit the migration SQL (AGENTS.md rule). If `make db-generate` produces a stray migration (snapshot mismatch), fix the snapshot per AGENTS.md's `--custom` workaround.
- [ ] **T5**: Add i18n keys to `packages/shared/src/i18n/en.json` and `tr.json`: `recipe.filter.author`, `recipe.filter.authorPlaceholder`, `recipe.filter.dateFrom`, `recipe.filter.dateTo`, `recipe.filter.minRating`, `recipe.filter.maxRating`. Use the R4 skeleton for en values; provide Turkish translations for tr.json. Ensure bidirectional parity.
- [ ] **T6**: Add/update `packages/shared/src/schemas/recipe.test.ts` — test that `RecipeFilterSchema` accepts the 5 new fields, rejects out-of-range `minRating=0` / `maxRating=11`, coerces `dateFrom` string to Date, and silently strips `grinder` (unknown key). Use the R5 skeleton for exact `it` blocks.
- [ ] **T7**: Run `make check-shared && make test-shared` — verify schema tests pass and types compile.

## Phase 2: API model — buildRecipeFilters + ranking helper

- [ ] **T8**: Widen the `search` branch in `buildRecipeFilters` (`apps/api/src/modules/recipe/model.ts:113-128`) to include `ilike(recipeVersions.personalNotes, searchTerm)` in the existing `or()` subquery. Add a comment: `// F11: personalNotes added to search scope (weight 1)`. Use the R6 skeleton.
- [ ] **T9**: Add the `author` filter branch to `buildRecipeFilters` (after the existing `mainBrewer` branch at ~line 143). Sanitize `%`/`_`, build `inArray(recipes.authorId, db.select({ id: users.id }).from(users).where(or(ilike(users.username, '%term%'), ilike(users.displayName, '%term%'))))`. Import `users` table from `@brewform/db/schema`. Null-guard empty/sanitized-to-empty input. Add an inline comment matching the existing branch comment style (`// F11: author username/displayName substring filter`). Use the R7 skeleton.
- [ ] **T10**: Add the `dateFrom` / `dateTo` filter branches to `buildRecipeFilters` (after the `author` branch). `dateFrom` → `gte(recipes.createdAt, filters.dateFrom)`, `dateTo` → `lte(recipes.createdAt, filters.dateTo)`. Add inline comments matching the existing branch style (`// F11: date range filter on recipes.createdAt`). Use the R8 skeleton.
- [ ] **T11**: Add the `minRating` / `maxRating` filter branches to `buildRecipeFilters` (after the `dateTo` branch). Build a `inArray` subquery against `userRecipeRatings` grouped by `recipeId` with a `having` clause (`gte(avg(rating), minRating)` / `lte(avg(rating), maxRating)`). Import `userRecipeRatings` + `avg` from drizzle-orm. Add inline comments matching the existing branch style (`// F11: rating range filter via avg(userRecipeRatings.rating) subquery`). Use the R9 skeleton.
- [ ] **T12**: Add the `rankRecipes` helper function in `apps/api/src/modules/recipe/model.ts` (or `service.ts` — see design D2). Export it. Signature: `rankRecipes(recipes: RecipeWithVersion[], searchTerm: string): RecipeWithVersion[]`. Compute score = titleMatch*3 + productNameMatch*2 + personalNotesMatch*1. Stable sort (preserve DB order for equal scores). Add full JSDoc describing weights + stability guarantee. Use the R10 skeleton.
- [ ] **T13**: Add/update `apps/api/src/modules/recipe/model.test.ts` — test each new `buildRecipeFilters` branch: author (match + empty + wildcard-strip), dateFrom/dateTo (independent + both), minRating/maxRating (independent + both + unrated-excluded), search personalNotes match. Test `rankRecipes`: title > productName > personalNotes, equal scores preserve order, no search = no re-sort. Use the R11 skeleton for `it` blocks.
- [ ] **T14**: Run `make check-api && make test-api` — verify model tests pass.

## Phase 3: API service — listRecipes + offset fallback + OpenAPI

- [ ] **T15**: Update `listRecipes` in `apps/api/src/modules/recipe/service.ts` (current ~line 458). Add the search-active offset fallback: when `filters.search` (non-empty after sanitization) AND `filters.cursor` is present, fall back to offset (ignore cursor). Emit `log.debug({ search: filters.search }, 'Search active, falling back to offset pagination for ranking')`. Use the R12 skeleton.
- [ ] **T16**: Update `listRecipes` to apply `rankRecipes` when `filters.search` is active and results are returned. The ranking sort happens AFTER the DB query returns, BEFORE the route handler builds the response. When `search` is absent, no ranking (DB ordering is sole). Use the R12 skeleton.
- [ ] **T17**: Update `apps/api/src/modules/recipe/index.ts:63-85` `describeRoute` parameters array — add all missing query params: `brewMethod`, `drinkType`, `visibility`, `authorId`, `equipmentId`, `mainBrewer`, `coffeeVarietyId`, `search`, `author`, `dateFrom`, `dateTo`, `minRating`, `maxRating`. Do NOT add `grinder` (removed). Use the R13 skeleton for the full parameters array.
- [ ] **T18**: Update `apps/api/src/modules/recipe/service.test.ts` — test search-active offset fallback (search + cursor → offset, debug log emitted), ranking applied with search, ranking NOT applied without search. Use the R14 skeleton.
- [ ] **T19**: Update `apps/api/src/modules/recipe/index.test.ts` — test that the new query params are accepted and validated (author string, dateFrom/dateTo valid dates, minRating/maxRating in range, minRating=0 rejected as 400). Use the R15 skeleton.
- [ ] **T20**: Run `make check-api && make lint && make test-api` — verify all API tests + lint pass.

## Phase 4: Web — filter UI + URL params + tests

- [ ] **T21**: Update `apps/web/src/utils/recipe-filters.ts` `extractListParams` (~line 23) — add `author`, `dateFrom`, `dateTo`, `minRating`, `maxRating` to the recognized params. Pass them through to the API client URLSearchParams. Use the R16 skeleton.
- [ ] **T22**: Update `apps/web/src/components/recipe-list/useRecipeFilters.ts` (~line 44) — add the 5 new params to the URL-search-params-backed filter state. `updateFilter` for each new param resets `page` to 1 (matching existing behaviour). Use the R17 skeleton.
- [ ] **T23**: Update `apps/web/src/components/recipe-list/RecipeListView.tsx` (~line 156) — add 3 new filter sections in the sidebar: Author (text input), Date range (two `<input type="date">`), Rating range (two `<input type="number">` min=1 max=10). Use `t()` for all labels. Use native HTML inputs — no date-picker or slider library. Use the R18 skeleton.
- [ ] **T24**: Update `apps/web/src/components/recipe-list/ActiveFilterBadge.tsx` — add badge entries for `author`, `dateFrom`, `dateTo`, `minRating`, `maxRating`. Each badge shows the filter label + value and a remove (clear) action. Use the R19 skeleton.
- [ ] **T25**: Add/update `apps/web/src/components/recipe-list/RecipeListView.test.tsx` — test that the 3 new filter sections render, that typing in the author input updates the URL, that date inputs update the URL, that active filter badges render for the new filters, and that clearing a badge removes the param. Use the R20 skeleton.
- [ ] **T26**: Add/update `apps/web/src/utils/recipe-filters.test.ts` — test `extractListParams` passes the 5 new params through and drops empty values. Use the R21 skeleton.
- [ ] **T27**: Run `make check-web && make test-specific filter=apps/web` — verify web tests pass.

## Phase 5: Verification + docs + housekeeping

- [ ] **T28**: Run `make fmt` — apply deno fmt across all edited files. Verify `git status` shows no unformatted files.
- [ ] **T29**: Run `make check && make lint && make test` — full CI-mirrored verification. All three SHALL exit 0.
- [ ] **T30**: Run `make test-coverage` and verify that every new file introduced by this change has >= 85% line coverage. If any file is below 85%, add tests to close the gap.
- [ ] **T31**: Audit all functions touched by this change for missing docblocks. Any existing undocumented exported function in the modified files (`model.ts`, `service.ts`, `recipe-filters.ts`, `useRecipeFilters.ts`, `RecipeListView.tsx`) that is touched by this change SHALL receive a JSDoc docblock where missing. New functions (`rankRecipes`) and new schema fields SHALL already have docblocks from their creation tasks (T1, T12).
- [ ] **T32**: Verify `openspec validate f11-advanced-search` passes (all requirements contain SHALL/MUST, all have scenarios).
- [ ] **T33**: Update `plans/F11-advanced-search.md` — prepend a banner: `> ✅ Shipped via OpenSpec change \`f11-advanced-search\` (2026-08-02).` followed by a one-line note that the implemented shape is per the rebased spec (cursor shipped via D27, equipment facet via D12, this change adds author/date/rating filters + ranking + OpenAPI fix).
- [ ] **T34**: Update `plans/ROADMAP.md` — mark F11 as `✅ Shipped (2026-08-02)`, remove from next-candidates list, bump F02 to the #1 next candidate. Add F11 to the History section's shipped-features list.
- [ ] **T35**: Run `make fmt` one final time after all doc edits.
