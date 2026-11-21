# advanced-search Specification

## Purpose

Extends the recipe listing with author / date-range / rating-range faceted filters, widened text-search scope (title + productName + personalNotes), and application-level relevance ranking. Introduces the search-active offset-fallback rule: cursor pagination SHALL fall back to offset when `search` is active, because rank ordering is non-deterministic from a `(createdAt, id)` keyset.
## Requirements
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

- When the client sends `GET /api/v1/recipes?author=%25coffee%25`
- Then the sanitized term is `coffee` (wildcards stripped) and the ilike pattern is `%coffee%`

### Requirement: Date range filter

The `RecipeFilterSchema` SHALL include optional `dateFrom` and `dateTo` fields, each a calendar day in `YYYY-MM-DD` form (`z.iso.date().optional()`, kept as a string) interpreted as a UTC day: for `dateFrom`, `buildRecipeFilters` SHALL generate `gte(recipes.createdAt, <dateFrom at 00:00:00.000Z>)`, and for `dateTo` it SHALL generate `lt(recipes.createdAt, <the day after dateTo at 00:00:00.000Z>)`.

- `dateFrom` and `dateTo` SHALL be usable independently — either, both, or neither may be provided.
- Both ends are inclusive whole days: `dateFrom=D&dateTo=D` returns every recipe created on UTC day D.
- A timestamp, a non-ISO date or an impossible date (for example `2025-02-30`) is a 400 validation error.
- The filter operates on `recipes.createdAt` (the recipe creation timestamp), NOT on recipe-version creation timestamps, for `GET /api/v1/recipes` and `GET /api/v1/recipes/starred`.
- The web's `extractListParams` (`apps/web/src/utils/recipe-filters.ts`) forwards `dateFrom` and `dateTo` only when they match `YYYY-MM-DD`, so a hand-edited URL value is dropped instead of failing the list loader.

#### Scenario: dateFrom filters to recent recipes only
- **WHEN** recipes exist with createdAt values spanning 2025-01-01 to 2025-12-01 and the client sends `GET /api/v1/recipes?dateFrom=2025-06-01`
- **THEN** only recipes created on or after 2025-06-01T00:00:00Z are returned

#### Scenario: dateTo filters to older recipes only
- **WHEN** the same recipe set exists and the client sends `GET /api/v1/recipes?dateTo=2025-06-01`
- **THEN** only recipes created before 2025-06-02T00:00:00Z (on or before UTC day 2025-06-01) are returned

#### Scenario: dateTo includes the whole chosen day
- **WHEN** recipes were created at 2026-11-20T23:59:59.999Z, 2026-11-21T00:00:00.000Z, 2026-11-21T12:00:00Z, 2026-11-21T23:59:59.999Z and 2026-11-22T00:00:00.000Z, and the client sends `GET /api/v1/recipes?dateFrom=2026-11-21&dateTo=2026-11-21`
- **THEN** exactly the three recipes created on 2026-11-21 are returned

#### Scenario: Both dateFrom and dateTo define an inclusive range
- **WHEN** the client sends `GET /api/v1/recipes?dateFrom=2025-03-01&dateTo=2025-09-01`
- **THEN** only recipes created from 2025-03-01T00:00:00Z up to the end of 2025-09-01 (UTC) are returned

#### Scenario: Invalid date string is rejected by Zod
- **WHEN** the client sends `GET /api/v1/recipes?dateFrom=not-a-date` or `GET /api/v1/recipes?dateTo=2026-11-21T10:00:00Z`
- **THEN** the response is a 400 validation error

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

The `search` filter in `buildRecipeFilters` SHALL match against three columns: `recipes.title` (weight 3), `recipeVersions.productName` (weight 2), AND `recipeVersions.personalNotes` (weight 1). F11 added `personalNotes`; wave 6 restructures the predicate so every branch is index-assisted.

- The `ilike` pattern SHALL be the output of the single pattern helper `toContainsPattern(normalizeSearchTerm(search))` (trim, then escape `\`, `%` and `_` with `\` and wrap in `%…%`; a case-insensitive literal substring match; see "Search term bounds and pattern sanitization").
- The same pattern SHALL apply identically to all three columns and to the relevance score.
- The title branch (`ilike(recipes.title, …)`) and the version branch (`ilike` on `productName` OR `personalNotes` of any version) SHALL be combined as a single condition on `recipes.id` (a union of matching recipe ids, or an equivalent form the planner can serve from the trigram indexes) with semantics identical to `title matches OR any version matches`.
- The combined condition SHALL be null-guarded before pushing to the conditions array, matching the existing pattern (D12 spec: Requirement: Type safety on the conditions array).

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

#### Scenario: Search matches an older version

- Given a recipe whose version 1 has productName `Ethiopia Guji` and whose current version 2 has productName `Kenya AA`
- When the client sends `GET /api/v1/recipes?search=guji`
- Then the recipe is returned exactly once (any-version scope; the union does not duplicate rows)

### Requirement: Search-active offset fallback for cursor pagination

When `search` is active AND `cursor` is provided, the system SHALL fall back to offset-based pagination using `page` and `perPage`. This extends the existing cursor-fallback rule (which currently falls back when `sortBy` is not `createdAt`).

- The system SHALL log a debug-level message with non-sensitive metadata only (e.g., `requestId`, `hasSearch: true`, `searchLength`): `log.debug({ requestId, hasSearch: true, searchLength: <number> }, 'Search active, falling back to offset pagination for ranking')`. The raw search string SHALL NOT be logged.
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

- `apps/api/src/modules/recipe/model.test.ts` — author / date / rating filter branches; widened search (personalNotes) including the union-structured search branch.
- `apps/api/src/modules/recipe/model.search.test.ts` (DB-backed, wave 6) — database-side ranking (title > productName > personalNotes, best version, tie-breaks), bounded page size on a 1000-match fixture (two statements captured by a Drizzle logger), `total` via SQL count, `sortBy=rating` with unrated last, deterministic tie-break pagination, no `versions` on list items, literal `%`/`_`/`\` matching, and hidden (private, draft, unlisted, soft-deleted) recipes never matching.
- `apps/api/src/modules/recipe/model.search.explain.test.ts` (DB-backed, wave 6) — trigram index usage and index/sequential-scan result parity, including escaped patterns.
- `packages/db/src/preflight.test.ts` — the three pre-flight outcomes (not available, no CREATE privilege, already installed) against a stub client.
- `apps/api/src/modules/recipe/service.test.ts` — search-active offset fallback; search delegates to the bounded model query; no ranking path without search.
- `apps/api/src/modules/recipe/index.test.ts` — new query params accepted; `search` length bound; `perPage` cap; 503 `QUERY_TIMEOUT` mapping; OpenAPI params documented.
- `apps/web/src/components/recipe-list/RecipeListView.test.tsx` — new filter sections render; input → URL update; search input `maxLength`.
- `apps/web/src/utils/recipe-filters.test.ts` — `extractListParams` passes new params.
- `packages/shared/src/schemas/recipe.test.ts` — `RecipeFilterSchema` accepts new fields; `grinder` removed; validation on `minRating`/`maxRating` range; `search` trimmed and capped at 200.

Existing tests SHALL continue to pass — offset pagination, cursor pagination, and all existing filter behaviour is unchanged except where the wave-6 requirements in this spec deliberately change it.

#### Scenario: All tests pass

- When `make test` runs
- Then all tests pass, including new filter, ranking and bounded-pagination tests

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

- The model's list-page query builder SHALL have a docblock describing the relevance weighting (3/2/1), best-version semantics, the ordering and tie-break keys, and the guarantee that the query is bounded by `LIMIT perPage`.
- The search-term helpers (`normalizeSearchTerm`, `toContainsPattern`) SHALL have docblocks describing trim, the escaped characters (`\`, `%`, `_`) and their escape order, PostgreSQL's default `\` LIKE escape, and the 200-character bound enforced by the schema.
- The new `buildRecipeFilters` branches (author, date, rating, union-structured search) SHALL have inline comments matching the existing branch comment style.
- Every `sql` template fragment SHALL carry a `// D03 raw-SQL exception:` comment explaining why no Drizzle builder exists for it.
- The new `RecipeFilterSchema` fields SHALL have JSDoc comments describing the filter semantics.
- Each new trigram index in `packages/db/src/schema.ts` SHALL have a docblock naming the query it serves.

#### Scenario: All new exported functions have docblocks

- When the source is reviewed
- Then the list-page query builder, the normalization and pattern helpers, the pre-flight check, the new schema fields (`author`, `dateFrom`, `dateTo`, `minRating`, `maxRating`, bounded `search`), the new `buildRecipeFilters` branches and the trigram index definitions all have JSDoc docblocks or inline comments

### Requirement: Code quality gates

The change SHALL pass all repo-mandated code quality gates before commit.

- `make check` (type-check across all workspaces) SHALL pass.
- `make lint` (Biome lint across all apps and packages) SHALL pass.
- `make test` (full Vitest suite via Docker, against the `brewform_test` database provisioned by `make test-db-provision`) SHALL pass.
- `make fmt` (`biome check --write`) SHALL be applied; `pnpm run fmt-check` SHALL pass (CI gate).
- `make db-generate` SHALL report no schema changes (CI freshness gate).

#### Scenario: CI green

- When `make check && make lint && make test` runs
- Then all three commands exit 0

#### Scenario: Biome format check passes

- When `make fmt` runs
- Then `git status` shows no unformatted files; `pnpm run fmt-check` passes

### Requirement: Database-side relevance ranking

When `search` is active on `GET /api/v1/recipes` or `GET /api/v1/recipes/starred`, the database SHALL compute each matching recipe's relevance score and order the results by that score before `OFFSET`/`LIMIT` are applied, so ranking is global across pages and no ranking or re-sorting of result rows happens in the API process.

- The score SHALL be `3 × titleMatch + max over the recipe's versions of (2 × productNameMatch + 1 × personalNotesMatch)`, where each match is 1 or 0. The version-level score SHALL be the BEST single version's score; matches on different versions SHALL NOT be summed.
- Each match SHALL be evaluated with exactly the same normalized `ilike '%<term>%'` predicate that the search filter uses, so the filter and the score cannot disagree: every recipe a search returns SHALL have a score of at least 1.
- The version set that is scored SHALL be the same version set that the search filter matches (currently any version of the recipe; see "Widened search scope includes personalNotes"). If the filter's version scope changes, the score's version scope SHALL change with it.
- Ordering SHALL be: score descending, then the requested `sortBy`/`sortOrder` key (see "Top-rated sort orders by average rating" for `rating`), then `recipes.id` in the `sortOrder` direction as the final unique tie-break.
- The score SHALL NOT be added to the response payload.
- When `search` is absent or empty after normalization, no score SHALL be computed and the order SHALL be the requested `sortBy`/`sortOrder` key followed by `recipes.id`.

#### Scenario: Title match outranks productName matches across page boundaries

- **WHEN** 25 public recipes match `espresso` only through a version's `productName`, all created after recipe T, which matches only through its title and is the oldest, and the client sends `GET /api/v1/recipes?search=espresso&perPage=10&page=1`
- **THEN** recipe T is the first item of page 1
- **AND** pages 2 and 3 contain only productName-only matches

#### Scenario: Best single version is scored, not the sum across versions

- **WHEN** recipe A has version 1 with productName `Kenya Espresso` and personalNotes `bright`, and version 2 with productName `Kenya` and personalNotes `pull it like espresso`, while recipe B has one version with productName `Espresso Blend` and personalNotes `classic espresso`, and the client searches `espresso`
- **THEN** recipe B (version score 3) is ordered before recipe A (best version score 2, not 3)

#### Scenario: Equal scores follow the requested sort key

- **WHEN** recipes A and B both match `match` only on their title, A has `likeCount` 5 and B has `likeCount` 9, and the client sends `GET /api/v1/recipes?search=match&sortBy=likeCount&sortOrder=desc`
- **THEN** B is ordered before A

#### Scenario: Score agrees with the database's case-insensitive match

- **WHEN** a public recipe titled `İstanbul Blend` (or any title that the database's `ilike` matches for the term) is returned by `GET /api/v1/recipes?search=istanbul`
- **THEN** that recipe is ordered ahead of every recipe that matches only through `productName` or `personalNotes`
- **AND** no returned recipe has a score of 0

#### Scenario: No search means no relevance ordering

- **WHEN** the client sends `GET /api/v1/recipes?sortBy=createdAt&sortOrder=desc` with no `search`
- **THEN** results are ordered by `createdAt` descending, then `id` descending, and no score expression appears in the issued SQL

### Requirement: Bounded per-request memory for recipe listing and search

The recipe list, search, starred and feed queries SHALL fetch at most `perPage` recipe rows (plus one aggregate count row) from the database per request, with ordering, `OFFSET` and `LIMIT` applied in SQL and the total computed with a SQL `COUNT` over the same filter.

- No model function SHALL fetch the full filtered result set into the API process; `findAllForRanking` SHALL be removed.
- No `recipe_version` rows SHALL be returned to the API process for the purpose of ranking or sorting.
- `perPage` SHALL remain capped at 100 by `RecipeFilterSchema`; larger values SHALL be rejected with 400.
- The offset-mode `total` SHALL equal the number of recipes matching all filters (including `search`), computed in SQL.
- A page beyond the last page SHALL return an empty `data` array with the correct `total`.
- Cursor mode (no search, `sortBy=createdAt`) is unchanged and remains bounded at `perPage + 1` rows.

#### Scenario: A 1000-match search loads only one page of rows

- **WHEN** 1000 public recipes (each with two versions) match `espresso` and the client sends `GET /api/v1/recipes?search=espresso&page=3&perPage=10`
- **THEN** the response contains exactly 10 items with `meta.pagination.total` 1000 and `totalPages` 100
- **AND** the SQL statements issued for the request (captured with a Drizzle `logger` on a test `db` instance in `model.search.test.ts`) are exactly two: the page query, whose result has at most 10 rows, and the count query, whose result has one row
- **AND** no returned row carries `versions`, `productName` or `personalNotes`, so no `recipe_version` row reaches the API process

#### Scenario: The compiled page query is limited

- **WHEN** the model's list-page query builder is compiled with `.toSQL()` for `search=espresso`, `page=3`, `perPage=10`
- **THEN** the SQL contains a `limit` and an `offset` whose bound parameters are 10 and 20

#### Scenario: Unbounded ranking fetch no longer exists

- **WHEN** the exports of `apps/api/src/modules/recipe/model.ts` are inspected
- **THEN** there is no `findAllForRanking` export and no list or search function issues a query without a `limit`

#### Scenario: perPage above the cap is rejected

- **WHEN** the client sends `GET /api/v1/recipes?search=espresso&perPage=101`
- **THEN** the response is 400 with the standard validation error envelope

#### Scenario: Page past the end is empty with the correct total

- **WHEN** 1000 recipes match and the client sends `GET /api/v1/recipes?search=espresso&page=101&perPage=10`
- **THEN** `data` is an empty array and `meta.pagination.total` is 1000

### Requirement: List items carry no version payload

Recipe list, search, starred and feed responses SHALL NOT include a `versions` array on list items; each item SHALL conform to `RecipeListItemOutputSchema` (the recipe row plus the `{ id, username, displayName }` author projection).

- Version `productName` and `personalNotes` text SHALL NOT be serialized into list payloads.
- The detail endpoints (`GET /api/v1/recipes/:id`, `/slug/:slug`) are unchanged and still return versions.

#### Scenario: List item has no versions key

- **WHEN** the client sends `GET /api/v1/recipes?search=espresso` and `GET /api/v1/recipes`
- **THEN** no item in `data` has a `versions` property
- **AND** every item has exactly the keys declared by `RecipeListItemOutputSchema` (a strict parse succeeds)

### Requirement: Deterministic tie-break for offset-paginated listings

Every offset-paginated recipe listing (with or without `search`, including `/recipes/starred` and the offset feed) SHALL append `recipes.id` as the final `ORDER BY` key so that consecutive pages never repeat or skip a recipe when the primary sort key has ties.

#### Scenario: Pages over tied likeCount values are disjoint and complete

- **WHEN** 30 public recipes all have `likeCount` 0 and the client requests pages 1, 2 and 3 of `GET /api/v1/recipes?sortBy=likeCount&sortOrder=desc&perPage=10`
- **THEN** the three pages contain 30 distinct recipe ids whose union is all 30 recipes

### Requirement: Top-rated sort orders by average rating

When `sortBy=rating`, the recipe list and starred endpoints SHALL order recipes by the average of their `userRecipeRatings.rating` values in the requested `sortOrder`, with unrated recipes placed after every rated recipe in both directions, and `recipes.id` as the final tie-break.

- Today `sortBy=rating` is accepted by `RecipeFilterSchema` and offered in the UI ("Top rated") but silently orders by `createdAt`; this requirement replaces that behaviour.
- The average SHALL be computed in SQL (an aggregate subquery joined per recipe), never by loading ratings into the API process.
- When `search` is active, the rating order SHALL be the secondary key after the relevance score.
- `cursor` with `sortBy=rating` continues to fall back to offset pagination (cursor-pagination spec, unchanged).

#### Scenario: Descending rating with unrated last

- **WHEN** recipe A has an average rating of 9, recipe B of 6, recipe C has no ratings, and the client sends `GET /api/v1/recipes?sortBy=rating&sortOrder=desc`
- **THEN** the order is A, B, C

#### Scenario: Ascending rating still puts unrated last

- **WHEN** the same recipes are requested with `sortBy=rating&sortOrder=asc`
- **THEN** the order is B, A, C

#### Scenario: Rating breaks relevance ties

- **WHEN** recipes A (average 9) and B (average 6) both match `espresso` only on their title and the client sends `GET /api/v1/recipes?search=espresso&sortBy=rating&sortOrder=desc`
- **THEN** A is ordered before B

### Requirement: Search term bounds and pattern sanitization

The `search` query parameter SHALL be trimmed and limited to 200 characters by `RecipeFilterSchema`, and user-supplied `%`, `_` and `\` characters SHALL be escaped so they match literally and never act as `ilike` pattern metacharacters.

- A `search` longer than 200 characters (after trimming) SHALL be rejected with 400 and the standard validation error envelope.
- The term SHALL be normalized once by the exported pure helper `normalizeSearchTerm(raw)` in `apps/api/src/utils/search.ts` (trim only; `undefined` becomes `''`), and the `ilike` pattern SHALL be built once by the exported pure helper `toContainsPattern(term)` in the same module, which escapes with `\` (PostgreSQL's default `LIKE` escape character) in this order: `\` → `\\`, `%` → `\%`, `_` → `\_`, then wraps the result as `%<escaped>%`. The pattern is a bound parameter of Drizzle's `ilike()`, so no `ESCAPE` clause and no raw SQL is needed, and `pg_trgm` honours the escapes. That same normalized term and pattern SHALL drive search-active detection, the filter predicate and the relevance score, and the same pattern helper SHALL be used for the `mainBrewer` and `author` filters.
- A term that is empty after trimming SHALL be treated as no search: no filter, no score, and cursor pagination remains available. A term made only of metacharacters (for example `\` or `%`) is a real search for those literal characters.
- The raw search term SHALL NOT be logged on any path, including query failures; logs MAY include its length.
- The OpenAPI `search` parameter on `GET /api/v1/recipes` and `GET /api/v1/recipes/starred` SHALL declare `maxLength: 200` and describe the behaviour as a case-insensitive literal substring match on title, coffee name and personal notes, ordered by relevance.
- The web recipe-list search input SHALL set `maxLength={200}` so the UI cannot produce a 400.

#### Scenario: Over-long search is rejected

- **WHEN** the client sends `GET /api/v1/recipes` with a `search` value of 201 characters
- **THEN** the response is 400 with `error.code` `VALIDATION_ERROR` and a detail for field `search`

#### Scenario: Surrounding whitespace is ignored

- **WHEN** a public recipe is titled `Espresso Martini` and the client sends `GET /api/v1/recipes?search=%20%20espresso%20%20`
- **THEN** the recipe is returned

#### Scenario: Whitespace-only search is treated as no search

- **WHEN** the client sends `GET /api/v1/recipes?search=%20%20%20`
- **THEN** the response is 200, no search filter or score is applied, and the result equals `GET /api/v1/recipes`

#### Scenario: Underscore matches literally

- **WHEN** public recipes titled `abc` and `a_c` exist and the client sends `GET /api/v1/recipes?search=a_c`
- **THEN** the recipe titled `a_c` is returned and the recipe titled `abc` is NOT returned

#### Scenario: Percent matches literally

- **WHEN** public recipes titled `100% Arabica` and `1000 Arabica` exist and the client sends `GET /api/v1/recipes?search=100%25`
- **THEN** only `100% Arabica` is returned

#### Scenario: Backslash matches literally and never errors

- **WHEN** a public recipe has productName `C:\beans` and the client sends `GET /api/v1/recipes?search=%5C`
- **THEN** the response is 200 and contains exactly the recipes whose title, productName or personalNotes contain a backslash

#### Scenario: Pattern helper escapes in the right order

- **WHEN** `toContainsPattern('50%_\\')` is called with the five-character term `50%_\`
- **THEN** it returns the pattern `%50\%\_\\%` (each metacharacter preceded by one backslash, the backslash itself doubled)

#### Scenario: OpenAPI documents the bound

- **WHEN** `GET /api/v1/openapi.json` is fetched
- **THEN** the `search` query parameter of `GET /recipes` and `GET /recipes/starred` has `maxLength` 200

### Requirement: Trigram indexes accelerate substring search

The database schema SHALL enable the `pg_trgm` extension and define GIN trigram indexes using the `gin_trgm_ops` operator class on `recipe.title`, `recipe_version.product_name` and `recipe_version.personal_notes`, so the leading-wildcard `ilike` search predicates are index-assisted instead of requiring sequential scans.

- The extension SHALL be created by a `drizzle-kit generate --custom` migration containing only `CREATE EXTENSION IF NOT EXISTS pg_trgm;`, ordered before the migration that creates the indexes.
- The indexes SHALL be declared in `packages/db/src/schema.ts` and their migration generated by `make db-generate`; the generated SQL SHALL NOT be hand-edited, and a subsequent `make db-generate` SHALL report no schema changes.
- The search predicate SHALL be structured so that each of the three columns can be served by its own index (the title branch and the version branch combined as a union of recipe ids, or an equivalent form the planner can bitmap-scan).
- Index-assisted results SHALL be identical to sequential-scan results, including for non-ASCII case folding.
- `make db-reset` (which uses `drizzle-kit push`) SHALL create the extension before pushing the schema so it keeps working.

#### Scenario: Fresh database gets the extension and indexes

- **WHEN** `make test-db-provision` runs against an empty `brewform_test` database
- **THEN** `pg_extension` lists `pg_trgm`
- **AND** `pg_indexes` lists the three trigram indexes using `gin` with `gin_trgm_ops`

#### Scenario: Migration snapshot is fresh

- **WHEN** `make db-generate` runs after the migrations are committed
- **THEN** it prints "No schema changes, nothing to migrate"

#### Scenario: Search plan uses the trigram indexes

- **WHEN** the search page query and the search count query for a term of at least 3 characters are explained on `brewform_test` inside a transaction with `SET LOCAL enable_seqscan = off`
- **THEN** each plan contains a Bitmap Index Scan on the `recipe.title`, `recipe_version.product_name` and `recipe_version.personal_notes` trigram indexes

#### Scenario: Index and sequential scans return the same rows

- **WHEN** the same searches, including `istanbul` against a recipe titled `İstanbul Blend`, are run with `enable_seqscan` on and off
- **THEN** both runs return the same recipe ids in the same order

#### Scenario: Schema reset still works

- **WHEN** `make db-reset` runs
- **THEN** it completes without an "operator class gin_trgm_ops does not exist" error and the three indexes exist

#### Scenario: Escaped patterns are index-assisted and equal to sequential scans

- **WHEN** the searches `a_c`, `100%` and `\` are run with `enable_seqscan` on and off
- **THEN** both runs return the same recipe ids in the same order

### Requirement: Migrations pre-flight the trigram extension
Before applying any migration, the migration runner (`packages/db/src/migrate.ts`) SHALL verify that `pg_trgm` is either already installed in the target database or available on the server and creatable by the connected role, and SHALL otherwise exit with status 1 and a message naming `pg_trgm` and the remedy, without applying any migration.

The check SHALL live in `packages/db/src/preflight.ts` as an exported
`assertMigrationPreflight(client)` and SHALL read only catalog data: `pg_extension` (installed?),
`pg_available_extensions` (available?), and
`has_database_privilege(current_user, current_database(), 'CREATE')` (`pg_trgm` is a trusted
extension, so the database `CREATE` privilege is enough; no superuser is needed). It is a
migration-runner catalog query, not application query code, and carries a
`// D03 raw-SQL exception:` comment. Messages SHALL be:
`pg_trgm is not available on this PostgreSQL server; use the official postgres image or install the contrib package` and
`role <role> lacks CREATE on database <db>; run "CREATE EXTENSION pg_trgm;" as the database owner, then rerun migrations`.
Both official images used by BrewForm (`postgres:18-trixie` in compose, `postgres:18-alpine` in CI)
ship the contrib modules, so the pre-flight passes on them; it protects managed or custom
PostgreSQL servers. The API image's `migrate` entrypoint mode and the compose `migrate` one-shot
service run this runner, so a failing pre-flight stops the deployment before the API starts.

#### Scenario: Extension unavailable stops migrations
- **WHEN** `assertMigrationPreflight` runs against a stub client whose catalog reports `pg_trgm` neither installed nor available
- **THEN** it throws the "not available" message and the runner exits 1 without calling `migrate()`

#### Scenario: Missing CREATE privilege stops migrations
- **WHEN** the stub reports `pg_trgm` available but not installed and `has_database_privilege` false
- **THEN** it throws the "lacks CREATE" message naming the role and database

#### Scenario: Installed extension passes without privilege
- **WHEN** the stub reports `pg_trgm` installed and `has_database_privilege` false
- **THEN** the pre-flight passes

#### Scenario: Official images pass
- **WHEN** `make test-db-provision` runs on `postgres:18-trixie` and the CI test job runs on `postgres:18-alpine`
- **THEN** the pre-flight passes and the migrations apply

### Requirement: Search never widens the listing's visibility scope
The search branch and the relevance score SHALL only narrow the result set of the listing they are applied to: `GET /api/v1/recipes` and `GET /api/v1/recipes/starred` with `search` SHALL return a subset of the same request without `search`, combined with `AND` onto the same visibility condition the unfiltered listing uses.

The visibility condition itself (which recipes a viewer may see in listings:
`listableRecipeCondition(null)` on `GET /api/v1/recipes`, so unlisted, draft and private recipes are
never searchable — not even by their author — and `viewableRecipeCondition(userId)` on
`GET /api/v1/recipes/starred`) is owned by the recipe-visibility capability; this capability SHALL NOT define or relax it. The
search union (`inArray(recipes.id, union(...))`) and the version-score subquery SHALL NOT join or
`OR` in any condition that bypasses it, and the `COUNT` SHALL use the same `finalWhere` as the page
query. Admin-only visibility filtering stays as the visibility capability defines it.

#### Scenario: Hidden recipes never match a search
- **WHEN** a private, a draft, an unlisted and a soft-deleted recipe are each titled `zq7hidden` by user A, and an anonymous client, signed-in user B and user A each send `GET /api/v1/recipes?search=zq7hidden`
- **THEN** all three responses have an empty `data` array and `meta.pagination.total` 0

#### Scenario: Matching older versions does not leak hidden recipes
- **WHEN** user A's private recipe has an older version whose productName is `zq7legacy` and user B searches `zq7legacy`
- **THEN** the response is empty

#### Scenario: Search is a subset of the unfiltered listing
- **WHEN** any viewer sends `GET /api/v1/recipes?search=espresso&perPage=100` and `GET /api/v1/recipes?perPage=100` over a fixture of fewer than 100 recipes
- **THEN** every id in the first response appears in the second

### Requirement: Database query time budget for search

Every database statement issued by the API, including recipe search and count queries, SHALL run under a server-side statement timeout (default 10000 ms, configurable through `DB_STATEMENT_TIMEOUT_MS`, where `0` disables it), and a search that exceeds the budget SHALL fail fast with a 503 error envelope instead of hanging or returning an opaque 500.

- The timeout SHALL be applied as a connection startup parameter of the shared `postgres-js` pool in `packages/db/src/index.ts`, which SHALL also set a finite `connect_timeout` and `idle_timeout`.
- A query cancelled by the timeout (Postgres SQLSTATE `57014`, surfaced either directly or as the `cause` of a Drizzle `DrizzleQueryError`) SHALL map to HTTP 503 with `error.code` `QUERY_TIMEOUT` and a generic message.
- The timeout SHALL be logged at `warn` with `requestId`, `searchLength` and the SQLSTATE only; the SQL text, bound parameters and raw search term SHALL NOT be logged.
- `GET /api/v1/recipes` and `GET /api/v1/recipes/starred` SHALL document the 503 response with `ErrorEnvelopeSchema`.

#### Scenario: Default statement timeout is active

- **WHEN** `SHOW statement_timeout` is executed through the API's shared pool with `DB_STATEMENT_TIMEOUT_MS` unset
- **THEN** the result is `10s`

#### Scenario: Timeout can be disabled

- **WHEN** the pool is created with `DB_STATEMENT_TIMEOUT_MS=0`
- **THEN** `SHOW statement_timeout` returns `0`

#### Scenario: A timed-out search returns 503

- **WHEN** the recipe list query fails with a `DrizzleQueryError` whose `cause.code` is `57014` while serving `GET /api/v1/recipes?search=espresso`
- **THEN** the response is 503 with `success: false` and `error.code` `QUERY_TIMEOUT`

#### Scenario: Timeout logs carry no search text

- **WHEN** a search for `secret-term` times out
- **THEN** no log line contains `secret-term` or the query's bound parameters, and the warn line contains `searchLength` 11

### Requirement: Search architecture decision recorded in project rules

The project documentation SHALL record database-side search ranking as an architectural decision: `docs/decisions.md` SHALL contain a new ADR approving `pg_trgm` trigram indexes and `sql` fragments for `CASE` scoring and `NULLS LAST` ordering, and `AGENTS.md` and `docs/architecture.md` SHALL state the amended database rules, including a bounded-reads rule.

- The ADR SHALL use the existing Decision / Why / Trade-off format, take the next free ADR number, and list the rejected alternatives (Postgres full-text search, in-app ranking of a bounded candidate set, the previous unbounded in-app ranking).
- The `AGENTS.md` "Database rules" SHALL say that `ilike` is the accepted case-insensitive operator, that `sql` template fragments are allowed in `model.ts` only where Drizzle has no builder and must carry a `// D03 raw-SQL exception:` comment, that extensions approved by an ADR (currently `pg_trgm`) and GIN operator-class indexes are permitted schema-level features, and that list and search queries must apply `LIMIT` with ordering and pagination done in SQL.
- `docs/architecture.md` "Portability Rules" SHALL match the amended `AGENTS.md` wording.

#### Scenario: ADR exists

- **WHEN** `docs/decisions.md` is read
- **THEN** it contains an ADR for database-side search ranking with `pg_trgm` that names the rejected alternatives

#### Scenario: Agent rules mention bounded reads and the approved extension

- **WHEN** the "Database rules" section of `AGENTS.md` is read
- **THEN** it contains the bounded-reads rule, the `sql`-fragment exception rule, and names `pg_trgm` as an approved extension with a reference to the ADR

### Requirement: Admin and catalog substring searches match literally and ignore letter case

Every free-text substring filter outside the recipe list SHALL normalise its term with `normalizeSearchTerm` and match with `ilike(<column>, toContainsPattern(term))` from `apps/api/src/utils/search.ts`, so letter case is ignored and `%`, `_` and `\` match literally.

- This covers the admin user list (`GET /api/v1/admin/users?q=`, matched against email, username and
  display name), the admin coffee-variety list (`listCoffeeVarieties` in `admin/model.ts`), the public
  coffee-variety list and search (`coffee-variety/model.ts#findMany`), the equipment search and list
  (`equipment/model.ts#search`, `#findManyWithFilters`), the vendor search (`vendor/model.ts#search`) and
  the taste-note search (`taste/model.ts#searchByName`). Plain `like()` SHALL NOT be used for
  user-supplied search terms.
- A term that is empty after trimming SHALL apply no filter in the paginated lists, and SHALL return no
  rows in the `search` functions that require a term.
- The admin user-search term SHALL NOT be logged, because admins search by email; logs MAY include its
  length.

#### Scenario: Admin user search ignores letter case

- **WHEN** user `Arda<m>` with email `arda<m>@example.com` exists and an admin lists users with `q=ARDA<m>`, and again with `q=Arda<m>@Example.com`
- **THEN** both responses contain that user

#### Scenario: Underscore in an admin search is literal

- **WHEN** users `a_c<m>` and `abc<m>` exist and an admin lists users with `q=a_c<m>`
- **THEN** only `a_c<m>` is returned

#### Scenario: The admin search term is not logged

- **WHEN** an admin lists users with `q=someone@example.com`
- **THEN** no log entry contains `someone@example.com`

#### Scenario: Catalog searches ignore letter case

- **WHEN** equipment with brand `Hario<m>`, vendor `Onyx<m>` and taste note `Fruity<m>` exist, and clients search equipment for `hario<m>`, vendors for `onyx<m>` and taste notes for `fruity<m>`
- **THEN** each search returns the matching row

#### Scenario: Catalog searches treat metacharacters literally

- **WHEN** taste notes `100%<m>` and `1000<m>` exist and a client searches taste notes for `100%<m>`, and coffee varieties `a_c<m>` and `abc<m>` exist and a client lists coffee varieties with `search=a_c<m>`
- **THEN** only `100%<m>` and only `a_c<m>` are returned

