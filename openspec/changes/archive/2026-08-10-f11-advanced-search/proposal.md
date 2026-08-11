## Why

D27 shipped cursor pagination and D12 deduplicated the recipe filter logic (`buildRecipeFilters`), but the F11 plan (`plans/F11-advanced-search.md`) was written before both landed — half its scope (cursor, equipment facet, three of four indexes) is already done. What remains unbuilt: **author / date-range / rating-range filters**, **relevance ranking** (title > product-name > personal-notes), and a latent **OpenAPI documentation gap** where 9 of 15 query params on `GET /recipes` are undocumented. The `grinder` filter field is also dead schema (declared, never read by `buildRecipeFilters`) — F11 either wires it or removes it.

## What Changes

1. **Extend `RecipeFilterSchema`** (`packages/shared/src/schemas/recipe.ts:130`) additively with `author` (string, username/displayName substring), `dateFrom` / `dateTo` (coerced ISO date), `minRating` / `maxRating` (1-10 integer). Do NOT replace the schema wholesale — every existing field stays.
2. **Wire the three new filters into `buildRecipeFilters`** (`apps/api/src/modules/recipe/model.ts:88`): `author` → `inArray(authorId, subquery on users ilike username/displayName)`; `dateFrom`/`dateTo` → `gte`/`lte` on `recipes.createdAt`; `minRating`/`maxRating` → `inArray(id, subquery averaging userRecipeRatings.rating)`. All via Drizzle helpers (`ilike`, `inArray`, `gte`, `lte`) — no raw SQL.
3. **Widen the `search` ilike scope** to include `recipeVersions.personalNotes` (currently only `recipes.title` + `recipeVersions.productName`). Add `personalNotes` to the existing `or()` branch in `buildRecipeFilters:113-128`.
4. **Add relevance ranking in application code**: when `search` is active, sort results in JS by a weighted score (title match = 3, productName = 2, personalNotes = 1) after fetching. **Cursor pagination SHALL fall back to offset when `search` is active** — extending the existing "cursor incompatible with sortBy" fallback rule (cursor-pagination spec, Requirement: Fallback to offset pagination). Rationale: rank ordering is non-deterministic from a `(createdAt, id)` keyset, so a keyset cursor would skip high-rank items on page 2.
5. **Remove the dead `grinder` field** from `RecipeFilterSchema` (`:159`) — it was never read by `buildRecipeFilters` or any service code. Removing it closes the gap between schema and behaviour. (If `grinder` filtering is desired later, it can be re-added with a working implementation.)
6. **Fix the OpenAPI parameter gap**: add `brewMethod`, `drinkType`, `visibility`, `authorId`, `equipmentId`, `mainBrewer`, `coffeeVarietyId`, `search` (and the new `author`, `dateFrom`, `dateTo`, `minRating`, `maxRating`) to the `describeRoute({ parameters: [...] })` array on `GET /recipes` (`apps/api/src/modules/recipe/index.ts:63`). Currently only 8 of 17 params are documented; after this change all 21 will be (17 existing − 1 grinder removed + 5 new = 21).
7. **Add one composite index** `recipe_visibility_featured_idx` on `(visibility, featured)` — the only one of the four proposed indexes not already shipped (D23 shipped the other three). Powers a future "trending/explore" page; cheap to add now while the migration for the rating subquery is being generated.
8. **Add frontend filter UI** for author (text input), date range (two `<input type="date">`), rating range (two `<input type="number">` min=1 max=10) into the existing `apps/web/src/components/recipe-list/RecipeListView.tsx` filter sidebar. Extend `useRecipeFilters.ts` and `apps/web/src/utils/recipe-filters.ts` to round-trip the new params via URL search params. Add `ActiveFilterBadge` entries for the new filters.
9. **Update affected tests** (listed in the Testing Strategy) and add docblocks to all new / modified exported functions. Coverage SHALL NOT drop below 85% on new files.
10. **Update `plans/F11-advanced-search.md`** — prepend a `> ✅ Shipped via OpenSpec change f11-advanced-search` banner pointing at the archived change (housekeeping, matches F05 convention).
11. **Update `plans/ROADMAP.md`** — mark F11 as shipped, remove from next-candidates, bump F02 to the top.

## Capabilities

### New Capabilities

- `advanced-search`: Author / date-range / rating-range recipe filters, widened text-search scope, application-level relevance ranking, and the search-active offset-fallback rule.

### Modified Capabilities

- `recipe-filter`: `buildRecipeFilters` extended with three new filter branches; `grinder` dead field removed; `search` ilike scope widened to `personalNotes`.
- `cursor-pagination`: Fallback rule extended — cursor SHALL fall back to offset when `search` is active (not just when `sortBy` is incompatible).
- `db-indexes`: One new composite index `recipe_visibility_featured_idx` on `recipes(visibility, featured)`.
- `api-type-safety`: `buildRecipeFilters` criteria type widened; no `any` introduced.
- `i18n`: New filter-label keys for author / date-from / date-to / min-rating / max-rating (en + tr parity).

## Impact

- **Shared**: `packages/shared/src/schemas/recipe.ts` (extend `RecipeFilterSchema`, remove `grinder`), `packages/shared/src/types/recipe.ts` (filter type widened), i18n `en.json` + `tr.json` (5 new keys).
- **API**: `apps/api/src/modules/recipe/model.ts` (`buildRecipeFilters` + 3 branches + `search` widen + ranking helper), `apps/api/src/modules/recipe/service.ts` (`listRecipes` ranking + offset-fallback-when-search), `apps/api/src/modules/recipe/index.ts` (OpenAPI params fix), `apps/api/src/modules/recipe/model.test.ts` + `service.test.ts` + `index.test.ts`.
- **Web**: `apps/web/src/components/recipe-list/RecipeListView.tsx` (3 new filter sections), `useRecipeFilters.ts` (3 new params), `apps/web/src/utils/recipe-filters.ts` (3 new params), `ActiveFilterBadge.tsx` (3 new badges), i18n keys.
- **DB**: one Drizzle migration adding `recipe_visibility_featured_idx` (composite index, no column changes). Generated via `make db-generate && make db-migrate`.
- **OpenAPI**: `GET /recipes` `describeRoute` parameters array extended from 8 to 21 documented params (17 existing − 1 grinder removed + 5 new).
- No new API endpoints. No deprecation period. No new external dependencies.
