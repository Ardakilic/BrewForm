## MODIFIED Requirements

### Requirement: Shared recipe filter-building helper

The system SHALL provide a `buildRecipeFilters(filters: RecipeFilterCriteria): SQL[]`
function exported from `apps/api/src/modules/recipe/model.ts`. The
function SHALL handle every filter key defined on
`RecipeFilterCriteria`:

- `brewMethod?: BrewMethod`
- `drinkType?: DrinkType`
- `search?: string` (matches `recipes.title` + any version's `recipeVersions.productName` + `recipeVersions.personalNotes`, combined into ONE `inArray(recipes.id, union(...))` condition — wave 6, see the `advanced-search` capability)
- `equipmentId?: string`
- `tasteNoteIds?: string` (comma-separated UUIDs)
- `tasteNoteId?: string` (deprecated, singular; backward compatibility)
- `mainBrewer?: string`
- `coffeeVarietyId?: string`
- `author?: string` (NEW — username/displayName substring, via `users` table subquery)
- `dateFrom?: Date` (NEW — `gte(recipes.createdAt, dateFrom)`)
- `dateTo?: Date` (NEW — `lte(recipes.createdAt, dateTo)`)
- `minRating?: number` (NEW — average rating >= minRating, via `userRecipeRatings` subquery)
- `maxRating?: number` (NEW — average rating <= maxRating, via `userRecipeRatings` subquery)

The `grinder` field is REMOVED from `RecipeFilterSchema` in `packages/shared/src/schemas/recipe.ts` — it was declared on the schema but never read by `buildRecipeFilters` or any service code. Removing it closes the schema-behaviour gap. (Note: `grinder` was never on the `RecipeFilterCriteria` interface in `model.ts` — only on the Zod schema — so only the schema declaration needs removing.)

Each branch SHALL generate Drizzle conditions using `ilike`, `inArray`, `gte`, `lte`, `or`, `and` helpers and the `union` set operator from `drizzle-orm/pg-core` — no raw SQL. The single permitted exception is the documented fallback for the search union: if Drizzle 0.45 rejects a set operator inside `inArray`, the search branch MAY use a `sql` fragment that takes Drizzle columns and bound parameters only and carries a `// D03 raw-SQL exception:` comment (ADR-017). Every `ilike` pattern built from `search`, `mainBrewer` or `author` SHALL be `toContainsPattern(normalizeSearchTerm(value))` (trim, then escape `\` → `\\`, `%` → `\%`, `_` → `\_` and wrap in `%…%`; PostgreSQL's default LIKE escape is `\`), so user input matches literally and never acts as a wildcard; a value that is empty after trimming adds no condition. Both `listRecipes()` (in `service.ts`, via `model.buildListRecipesWhere`) and `findStarred()` (in `model.ts`) SHALL call this helper and SHALL NOT contain any inline filter `if` blocks.

#### Scenario: author filter generates users subquery condition

- When `buildRecipeFilters({ author: 'alice' })` is called
- Then the returned array contains exactly one condition: `inArray(recipes.authorId, db.select({ id: users.id }).from(users).where(or(ilike(users.username, '%alice%'), ilike(users.displayName, '%alice%'))))`

#### Scenario: dateFrom filter generates gte condition

- When `buildRecipeFilters({ dateFrom: new Date('2025-01-01') })` is called
- Then the returned array contains exactly one condition: `gte(recipes.createdAt, <2025-01-01 date>)`

#### Scenario: minRating filter generates having subquery

- When `buildRecipeFilters({ minRating: 7 })` is called
- Then the returned array contains exactly one condition: `inArray(recipes.id, db.select({ recipeId: userRecipeRatings.recipeId }).from(userRecipeRatings).groupBy(userRecipeRatings.recipeId).having(gte(avg(userRecipeRatings.rating), 7)))`

#### Scenario: search is one union condition that includes personalNotes

- When `buildRecipeFilters({ search: 'V60' })` is called
- Then the returned array contains exactly one search condition: `inArray(recipes.id, union(<recipe ids where ilike(recipes.title, '%V60%')>, <recipe ids of versions where ilike(recipeVersions.productName, '%V60%') or ilike(recipeVersions.personalNotes, '%V60%')>))`
- And a recipe that matches through several versions appears once in the results (the union de-duplicates ids)

#### Scenario: wildcard characters in search match literally

- When `buildRecipeFilters({ search: ' 50%_\\ ' })` is called
- Then every `ilike` pattern in the search condition is `%50\%\_\\%` (trimmed, with `\`, `%` and `_` escaped in that order)
- And `buildRecipeFilters({ search: '\\' })` produces the pattern `%\\%`
- And `buildRecipeFilters({ search: '   ' })` returns no search condition

#### Scenario: grinder field is not in RecipeFilterSchema

- When `packages/shared/src/schemas/recipe.ts` is inspected after the change
- Then the `RecipeFilterSchema` object does NOT contain a `grinder` key

#### Scenario: grinder param silently dropped

- When a client sends `GET /api/v1/recipes?grinder=Niche`
- Then `grinder` is stripped by Zod's default unknown-keys behavior (no error, no effect)

### Requirement: Caller composes base conditions

`buildRecipeFilters` SHALL NOT include visibility conditions,
favourite-scope conditions, `authorId` conditions, or any other
caller-specific base condition. The helper's return value SHALL
contain only conditions derived from `RecipeFilterCriteria`. Callers
SHALL prepend their own base conditions and compose the resulting
array with Drizzle's `and()`.

The visibility base condition SHALL come from the shared conditions
of the `recipe-visibility` capability, exported by
`apps/api/src/modules/recipe/model.ts`:
- `buildListRecipesWhere` (used by `listRecipes`) prepends
  `listableRecipeCondition(null)` (non-deleted `public` only, so
  `unlisted` recipes are never listed or searchable). When an admin
  passes a `visibility` filter, it prepends
  `eq(recipes.visibility, filters.visibility)` instead (admin
  exemption, marked `// visibility-exempt: admin filter`).
- `findStarred` prepends `viewableRecipeCondition(userId)`: the
  caller's own favourites that are `public` or `unlisted`, plus the
  caller's own `draft`/`private` recipes. The Starred list is a
  viewer-only record (see `recipe-visibility`).

No caller compares `recipes.visibility` inline. The `recipe-visibility`
enforcement test checks this.

#### Scenario: Helper output omits visibility

- **WHEN** `buildRecipeFilters({ brewMethod: 'ESPRESSO' })` is called
- **THEN** the returned `SQL[]` contains exactly one condition (the
  `brewMethod` subquery) and does NOT contain any reference to
  `recipes.visibility`

#### Scenario: listRecipes prepends visibility condition

- **WHEN** `service.ts:listRecipes(filters)` composes its `WHERE`
  clause
- **THEN** the visibility condition (admin-aware:
  `listableRecipeCondition(null)` for non-admins and for admins
  without a `visibility` filter) is prepended to the array returned by
  `buildRecipeFilters(filters)` before `and(...)` is applied

#### Scenario: findStarred prepends the viewer-scoped visibility condition

- **WHEN** `model.ts:findStarred(userId, filters, ...)` composes its
  `WHERE` clause
- **THEN** `viewableRecipeCondition(userId)` is prepended to the
  array returned by `buildRecipeFilters(filters)`, together with the
  favourites-scope subquery, before `and(...)` is applied

#### Scenario: Starred list keeps an unlisted favourite and drops a now-private one

- **WHEN** user B has favourited A's `unlisted` recipe U and A's
  recipe P, which A later made `private`
- **THEN** `findStarred(B, {}, 1, 20)` returns U and does not return P
