# advanced-search Specification

## Purpose

Extends the recipe listing with author / date-range / rating-range faceted filters, widened text-search scope (title + productName + personalNotes), and application-level relevance ranking. Introduces the search-active offset-fallback rule: cursor pagination SHALL fall back to offset when `search` is active, because rank ordering is non-deterministic from a `(createdAt, id)` keyset.

## ADDED Requirements

### Requirement: Author filter by username substring

The `RecipeFilterSchema` SHALL include an optional `author` string field (max 100 chars). When provided, `buildRecipeFilters` SHALL generate a condition matching recipes whose author's `username` OR `displayName` contains the search term case-insensitively, via a Drizzle `inArray(recipes.authorId, db.select({ id: users.id }).from(users).where(or(ilike(users.username, '%term%'), ilike(users.displayName, '%term%'))))` subquery.

- The `author` filter input SHALL be sanitized by stripping `%` and `_` wildcard characters before building the `ilike` pattern, matching the existing `search` and `mainBrewer` sanitization pattern.
- An empty `author` string, OR an `author` string that becomes empty after stripping `%` and `_`, SHALL generate no condition.
- The `author` filter is a substring match, NOT an exact username or UUID match. The existing `authorId` UUID filter (used by profile pages) SHALL remain unchanged and independent.

#### Scenario: Author filter matches username substring

- Given a user with username `coffeeLover` has authored 3 public recipes
- When the client sends `GET /api/v1/recipes?author=coffee`
- Then the response contains those 3 recipes and no recipes by other authors

#### Scenario: Author filter matches displayName substring

- Given a user with username `alice` and displayName `Alice the Coffee Lover` has authored 2 public recipes
- When the client sends `GET /api/v1/recipes?author=Alice`
- Then the response contains those 2 recipes

#### Scenario: Author filter is case-insensitive

- Given a user with username `BobBrews` has authored recipes
- When the client sends `GET /api/v1/recipes?author=bobbrews`
- Then the response contains Bob's recipes (ilike is case-insensitive)

#### Scenario: Empty author filter is ignored

- When the client sends `GET /api/v1/recipes?author=`
- Then no author subquery condition is generated and all public recipes are returned

#### Scenario: Author filter with wildcards stripped

- When the client sends `GET /api/v1/recipes?author=%coffee%`
- Then the sanitized term is `coffee` (wildcards stripped) and the ilike pattern is `%coffee%`

### Requirement: Date range filter

The `RecipeFilterSchema` SHALL include optional `dateFrom` and `dateTo` fields, each a coerced ISO 8601 date string (`z.coerce.date().optional()`). When `dateFrom` is provided, `buildRecipeFilters` SHALL generate `gte(recipes.createdAt, dateFrom)`. When `dateTo` is provided, `buildRecipeFilters` SHALL generate `lte(recipes.createdAt, dateTo)`.

- `dateFrom` and `dateTo` SHALL be usable independently — either, both, or neither may be provided.
- When both are provided, the range SHALL be inclusive on both ends (`>= dateFrom AND <= dateTo`).
- The filter operates on `recipes.createdAt` (the recipe creation timestamp), NOT on recipe-version creation timestamps.

#### Scenario: dateFrom filters to recent recipes only

- Given recipes exist with createdAt values spanning 2025-01-01 to 2025-12-01
- When the client sends `GET /api/v1/recipes?dateFrom=2025-06-01`
- Then only recipes created on or after 2025-06-01 are returned

#### Scenario: dateTo filters to older recipes only

- Given the same recipe set
- When the client sends `GET /api/v1/recipes?dateTo=2025-06-01`
- Then only recipes created on or before 2025-06-01 are returned

#### Scenario: Both dateFrom and dateTo define an inclusive range

- When the client sends `GET /api/v1/recipes?dateFrom=2025-03-01&dateTo=2025-09-01`
- Then only recipes created between 2025-03-01 and 2025-09-01 (inclusive) are returned

#### Scenario: Invalid date string is rejected by Zod

- When the client sends `GET /api/v1/recipes?dateFrom=not-a-date`
- Then the response is a 400 validation error (Zod coerce-date rejects non-date strings)

### Requirement: Rating range filter

The `RecipeFilterSchema` SHALL include optional `minRating` and `maxRating` fields, each a coerced integer (`z.coerce.number().int().min(1).max(10).optional()`). When either is provided, `buildRecipeFilters` SHALL generate a condition filtering recipes whose average rating on `userRecipeRatings` falls within the range, via a Drizzle `inArray` subquery: `inArray(recipes.id, db.select({ recipeId: userRecipeRatings.recipeId }).from(userRecipeRatings).groupBy(userRecipeRatings.recipeId).having(gte(avg(userRecipeRatings.rating), minRating)))`.

- `minRating` and `maxRating` SHALL be usable independently.
- When both are provided, the range SHALL be inclusive on both ends.
- Recipes with zero ratings (no rows in `userRecipeRatings`) SHALL NOT appear in rating-filtered results — an average of zero rows is NULL, which fails both `gte` and `lte` comparisons.
- The rating is the average of all `userRecipeRatings.rating` values for the recipe (1-10 scale, per the CHECK constraint at `schema.ts:713`).

#### Scenario: minRating filters to highly-rated recipes

- Given recipe A has average rating 8.5 and recipe B has average rating 5.0
- When the client sends `GET /api/v1/recipes?minRating=7`
- Then only recipe A is returned

#### Scenario: maxRating filters to lower-rated recipes

- Given the same recipes
- When the client sends `GET /api/v1/recipes?maxRating=6`
- Then only recipe B is returned

#### Scenario: Both minRating and maxRating define a range

- When the client sends `GET /api/v1/recipes?minRating=5&maxRating=9`
- Then only recipes with average rating between 5 and 9 (inclusive) are returned

#### Scenario: Unrated recipes excluded from rating-filtered results

- Given recipe C has zero ratings
- When the client sends `GET /api/v1/recipes?minRating=1`
- Then recipe C is NOT returned (no rating rows = NULL average = fails gte)

#### Scenario: Rating value out of range is rejected

- When the client sends `GET /api/v1/recipes?minRating=0`
- Then the response is a 400 validation error (minRating must be >= 1)

### Requirement: Widened search scope includes personalNotes

The `search` filter in `buildRecipeFilters` SHALL match against three columns: `recipes.title` (weight 3), `recipeVersions.productName` (weight 2), AND `recipeVersions.personalNotes` (weight 1). The current implementation matches only `title` and `productName`; `personalNotes` is added by this change.

- The `ilike` pattern SHALL be `%<sanitized term>%` (case-insensitive substring), matching the existing pattern.
- Sanitization (stripping `%` and `_`) SHALL apply identically to all three columns.
- The three-way `or()` SHALL be null-guarded before pushing to the conditions array, matching the existing pattern (D12 spec: Requirement: Type safety on the conditions array).

#### Scenario: Search matches title

- Given a recipe with title `Espresso Martini` and a version with productName `Generic Beans` and personalNotes `nothing special`
- When the client sends `GET /api/v1/recipes?search=espresso`
- Then the recipe is returned (title match)

#### Scenario: Search matches productName

- Given a recipe with title `Untitled` and a version with productName `Ethiopia Yirgacheffe`
- When the client sends `GET /api/v1/recipes?search=yirgacheffe`
- Then the recipe is returned (productName match)

#### Scenario: Search matches personalNotes

- Given a recipe with title `Untitled` and a version with productName `Generic` and personalNotes `Try with V60 dripper`
- When the client sends `GET /api/v1/recipes?search=V60`
- Then the recipe is returned (personalNotes match — NEW in F11)

### Requirement: Application-level relevance ranking

When `search` is active and results are returned, the service layer SHALL sort the results in JavaScript by a weighted relevance score BEFORE returning them to the route handler.

- The score SHALL be computed as: `titleMatch * 3 + productNameMatch * 2 + personalNotesMatch * 1`, where each match is a boolean (1 or 0) determined by whether the lowercase search term appears in the lowercase field value.
- Title match is checked against `recipe.title`.
- ProductName and personalNotes matches are checked against the recipe's CURRENT version's fields. The current version SHALL be fetched via the `currentVersionId` relation or an explicit join — NOT via `recipe.currentVersion?.productName` (no such relation exists in `recipesRelations`).
- When two recipes have the same rank score, the existing sort order (from the DB query: `sortBy` / `sortOrder`) SHALL be preserved as a stable secondary sort (i.e., the ranking sort SHALL be stable and not re-shuffle equally-ranked items).
- Ranking SHALL NOT be applied when `search` is absent — the DB-level `sortBy` / `sortOrder` ordering is the sole ordering in that case.

#### Scenario: Title match ranks higher than productName match

- Given recipe A has title `Espresso` (no productName match) and recipe B has title `Untitled` with productName `Espresso Blend`
- When the client sends `GET /api/v1/recipes?search=espresso`
- Then recipe A (score 3) appears before recipe B (score 2) in the results

#### Scenario: Equal scores preserve DB order

- Given recipe A and recipe B both match only on title, and the DB query returns A before B (by createdAt DESC)
- When the client sends `GET /api/v1/recipes?search=match`
- Then A still appears before B (stable sort preserves DB order for equal ranks)

#### Scenario: No search = no ranking

- When the client sends `GET /api/v1/recipes?sortBy=createdAt` (no `search` param)
- Then the results are ordered by createdAt DESC (no JS-level re-sorting)

### Requirement: Search-active offset fallback for cursor pagination

When `search` is active AND `cursor` is provided, the system SHALL fall back to offset-based pagination using `page` and `perPage`. This extends the existing cursor-fallback rule (which currently falls back when `sortBy` is not `createdAt`).

- The system SHALL log a debug-level message: `log.debug({ search: filters.search }, 'Search active, falling back to offset pagination for ranking')`.
- When `search` is active and `cursor` is absent, offset pagination SHALL be used (the default).
- When `search` is absent, cursor pagination SHALL be used if `cursor` is provided and `sortBy` is `createdAt` (unchanged from D27).
- The response SHALL use `meta.pagination` (not `meta.cursor`) when the fallback is active.

#### Scenario: Search + cursor falls back to offset

- When the client sends `GET /api/v1/recipes?search=espresso&cursor=eyJ...`
- Then the response uses offset pagination with `meta.pagination` (not `meta.cursor`)
- And a debug log is emitted

#### Scenario: Search without cursor uses offset normally

- When the client sends `GET /api/v1/recipes?search=espresso`
- Then the response uses offset pagination with `meta.pagination`

#### Scenario: No search + cursor uses cursor pagination

- When the client sends `GET /api/v1/recipes?cursor=eyJ...&sortBy=createdAt`
- Then the response uses cursor pagination with `meta.cursor` (unchanged from D27)

### Requirement: Dead grinder field removed from schema

The `grinder` field SHALL be removed from `RecipeFilterSchema` in `packages/shared/src/schemas/recipe.ts`. The field was declared but never read by `buildRecipeFilters` or any service code — it is dead schema. Removing it closes the gap between the schema contract and the actual behaviour.

- Removing the field SHALL NOT break any existing request — `grinder` was never consumed, so no query behaviour changes.
- The field SHALL NOT be reintroduced without a working filter implementation.
- Any test or type that references `RecipeFilterSchema.shape.grinder` SHALL be updated.

#### Scenario: grinder param is silently dropped

- Given a client sends `GET /api/v1/recipes?grinder=Niche`
- When the request is validated by `RecipeFilterSchema`
- Then `grinder` is silently stripped by Zod's default unknown-keys behavior (no error, no effect)

#### Scenario: grinder field absent from schema

- When `packages/shared/src/schemas/recipe.ts` is inspected after the change
- Then the `RecipeFilterSchema` object does NOT contain a `grinder` key

### Requirement: OpenAPI parameters fully documented

The `describeRoute({ parameters: [...] })` on `GET /api/v1/recipes` (`apps/api/src/modules/recipe/index.ts:63`) SHALL document every query parameter accepted by `RecipeFilterSchema`. Currently only 8 of 17 params are documented. After this change, ALL 21 params SHALL be documented (17 existing − 1 grinder removed + 5 new):

- Existing documented: `page`, `perPage`, `sortBy`, `sortOrder`, `cursor`, `includeTotal`, `tasteNoteId` (deprecated), `tasteNoteIds`.
- Newly documented: `brewMethod`, `drinkType`, `visibility`, `authorId`, `equipmentId`, `mainBrewer`, `coffeeVarietyId`, `search`, and the new `author`, `dateFrom`, `dateTo`, `minRating`, `maxRating`.
- The removed `grinder` SHALL NOT be documented (it is removed from the schema).

#### Scenario: OpenAPI spec lists all filter params

- When `GET /api/v1/openapi.json` is fetched
- Then the `GET /recipes` endpoint documents all 21 query parameters (17 existing minus grinder, plus 5 new)

#### Scenario: OpenAPI coverage test passes

- When `make test-api` runs
- Then `openapi.coverage.test.ts` passes (all routes documented, no orphan tags)

### Requirement: Frontend filter UI for author, date, and rating

The recipe list filter sidebar (`apps/web/src/components/recipe-list/RecipeListView.tsx`) SHALL include three new filter sections:

- **Author**: a text input bound to the `author` URL search param.
- **Date range**: two `<input type="date">` fields bound to `dateFrom` and `dateTo`.
- **Rating range**: two `<input type="number">` fields (min=1, max=10) bound to `minRating` and `maxRating`.

The `useRecipeFilters` hook (`apps/web/src/components/recipe-list/useRecipeFilters.ts`) SHALL read and write the new params. The `extractListParams` utility (`apps/web/src/utils/recipe-filters.ts`) SHALL pass the new params through to the API client. `ActiveFilterBadge` entries SHALL be rendered for each active new filter, with a clear/remove action.

- All user-visible strings SHALL use `t()` i18n keys (en + tr parity).
- The date inputs SHALL use native `<input type="date">` — no date-picker library.
- The rating inputs SHALL use native `<input type="number">` — no slider library.

#### Scenario: Author filter input updates URL

- Given the user is on the recipe list page
- When the user types `alice` into the author filter input
- Then the URL updates to include `?author=alice` and the list re-fetches

#### Scenario: Date range filter updates URL

- When the user selects `2025-01-01` in dateFrom and `2025-06-01` in dateTo
- Then the URL updates to include `?dateFrom=2025-01-01&dateTo=2025-06-01`

#### Scenario: Active filter badge for author

- Given the author filter is active (`?author=alice`)
- When the filter sidebar renders
- Then an `ActiveFilterBadge` for `author` is displayed with a remove button

#### Scenario: Clearing a filter removes it from URL

- Given the author filter badge is displayed
- When the user clicks the remove button on the badge
- Then `author` is removed from the URL and the list re-fetches without the author filter

### Requirement: i18n keys for new filter labels

The i18n files (`packages/shared/src/i18n/en.json` and `tr.json`) SHALL include keys for the new filter labels:

- `recipe.filter.author` — "Author" / tr equivalent
- `recipe.filter.dateFrom` — "From date" / tr equivalent
- `recipe.filter.dateTo` — "To date" / tr equivalent
- `recipe.filter.minRating` — "Min rating" / tr equivalent
- `recipe.filter.maxRating` — "Max rating" / tr equivalent
- `recipe.filter.authorPlaceholder` — "Search by author..." / tr equivalent

- en and tr SHALL have parity (deterministic bidirectional parity test enforced).
- The keys SHALL use the existing `recipe.filter.*` namespace convention.

#### Scenario: en and tr parity

- When the bidirectional i18n parity test runs
- Then all 6 new keys exist in both en.json and tr.json with non-empty values

#### Scenario: Filter labels render in current locale

- Given the app locale is `tr`
- When the recipe list filter sidebar renders
- Then the author filter label shows the Turkish translation, not the English fallback

### Requirement: All new code covered by tests with 85% minimum

Every new function and code path SHALL be covered by tests with at least 85% line coverage on new files. New and updated test files:

- `apps/api/src/modules/recipe/model.test.ts` — author / date / rating filter branches; widened search (personalNotes); ranking helper.
- `apps/api/src/modules/recipe/service.test.ts` — search-active offset fallback; ranking sort applied; ranking NOT applied without search.
- `apps/api/src/modules/recipe/index.test.ts` — new query params accepted; OpenAPI params documented.
- `apps/web/src/components/recipe-list/RecipeListView.test.tsx` — new filter sections render; input → URL update.
- `apps/web/src/utils/recipe-filters.test.ts` — `extractListParams` passes new params.
- `packages/shared/src/schemas/recipe.test.ts` — `RecipeFilterSchema` accepts new fields; `grinder` removed; validation on `minRating`/`maxRating` range.

Existing tests SHALL continue to pass — offset pagination, cursor pagination, and all existing filter behaviour is unchanged.

#### Scenario: All tests pass

- When `make test` runs
- Then all tests pass, including new filter and ranking tests

#### Scenario: TypeScript compiles

- When `make check` runs
- Then no type errors exist

#### Scenario: Linting passes

- When `make lint` runs
- Then no lint errors exist

#### Scenario: Coverage on new files >= 85%

- When `make test-coverage` runs
- Then every new file introduced by this change has >= 85% line coverage

### Requirement: Docblocks on all new public functions

Every new exported function, type, and schema field SHALL have a JSDoc docblock describing its purpose, parameters, and return value. Existing undocumented functions touched by this change SHALL receive docblocks where missing.

- The `rankRecipes` helper SHALL have a docblock describing the weighting (3/2/1) and the stability guarantee.
- The new `buildRecipeFilters` branches (author, date, rating) SHALL have inline comments matching the existing branch comment style.
- The new `RecipeFilterSchema` fields SHALL have JSDoc comments describing the filter semantics.

#### Scenario: All new exported functions have docblocks

- When the source is reviewed
- Then `rankRecipes`, the new schema fields (`author`, `dateFrom`, `dateTo`, `minRating`, `maxRating`), and the new `buildRecipeFilters` branches all have JSDoc docblocks

### Requirement: Code quality gates

The change SHALL pass all repo-mandated code quality gates before commit.

- `make check` (type-check across all workspaces) SHALL pass.
- `make lint` (lint across all apps and packages) SHALL pass.
- `make test` (full test suite via Docker with `--allow-all`) SHALL pass.
- `make fmt` SHALL be applied; `deno fmt --check` SHALL pass (CI gate).

#### Scenario: CI green

- When `make check && make lint && make test` runs
- Then all three commands exit 0

#### Scenario: deno fmt --check passes

- When `make fmt` runs
- Then `git status` shows no unformatted files; `deno fmt --check` passes

## Non-goals

- Facet COUNTS (e.g. "Author: Alice (12)") — filter inputs only, no per-value aggregate counts. Facet counts are a separate future change.
- Infinite scroll / IntersectionObserver on the frontend — cursor already enables it; adoption is a pure-UI future change.
- External search engines (Meilisearch, Typesense, Algolia) — no search infrastructure added.
- `tsvector` / GIN indexes / `pg_trgm` — the project's "no raw SQL, no Postgres-specific operators" convention holds; `ilike` + app-level ranking stays.
- `badge` or `system` notification types (no call sites).
- `grinder` filter re-implementation — the dead field is removed, not wired.
- Real-time search / search-as-you-type / search suggestions / autocomplete.
