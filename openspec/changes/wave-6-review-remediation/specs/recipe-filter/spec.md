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
- `author?: string` (NEW — username/displayName substring of a live account, via a `users` table subquery that also requires `isNull(users.deletedAt)`; see the `account-deletion` capability)
- `dateFrom?: string` (a `YYYY-MM-DD` UTC day — `gte(recipes.createdAt, <dateFrom at 00:00:00.000Z>)`; see the `advanced-search` capability)
- `dateTo?: string` (a `YYYY-MM-DD` UTC day — `lt(recipes.createdAt, <the day after dateTo at 00:00:00.000Z>)`, so the whole day is included)
- `minRating?: number` (NEW — average rating >= minRating, via `userRecipeRatings` subquery)
- `maxRating?: number` (NEW — average rating <= maxRating, via `userRecipeRatings` subquery)

The `grinder` field is REMOVED from `RecipeFilterSchema` in `packages/shared/src/schemas/recipe.ts` — it was declared on the schema but never read by `buildRecipeFilters` or any service code. Removing it closes the schema-behaviour gap. (Note: `grinder` was never on the `RecipeFilterCriteria` interface in `model.ts` — only on the Zod schema — so only the schema declaration needs removing.)

Each branch SHALL generate Drizzle conditions using `ilike`, `inArray`, `gte`, `lt`, `lte`, `or`, `and` helpers and the `union` set operator from `drizzle-orm/pg-core` — no raw SQL. The single permitted exception is the documented fallback for the search union: if Drizzle 0.45 rejects a set operator inside `inArray`, the search branch MAY use a `sql` fragment that takes Drizzle columns and bound parameters only and carries a `// D03 raw-SQL exception:` comment (ADR-017). Every `ilike` pattern built from `search`, `mainBrewer` or `author` SHALL be `toContainsPattern(normalizeSearchTerm(value))` (trim, then escape `\` → `\\`, `%` → `\%`, `_` → `\_` and wrap in `%…%`; PostgreSQL's default LIKE escape is `\`), so user input matches literally and never acts as a wildcard; a value that is empty after trimming adds no condition. Both `listRecipes()` (in `service.ts`, via `model.buildListRecipesWhere`) and `findStarred()` (in `model.ts`) SHALL call this helper and SHALL NOT contain any inline filter `if` blocks.

#### Scenario: author filter generates users subquery condition

- When `buildRecipeFilters({ author: 'alice' })` is called
- Then the returned array contains exactly one condition: `inArray(recipes.authorId, db.select({ id: users.id }).from(users).where(and(isNull(users.deletedAt), or(ilike(users.username, '%alice%'), ilike(users.displayName, '%alice%')))))`

#### Scenario: dateFrom filter generates gte condition

- When `buildRecipeFilters({ dateFrom: '2025-01-01' })` is called
- Then the returned array contains exactly one condition: `gte(recipes.createdAt, <2025-01-01T00:00:00.000Z>)`

#### Scenario: dateTo filter generates an exclusive next-day bound

- When `buildRecipeFilters({ dateTo: '2026-11-21' })` is called
- Then the returned array contains exactly one condition: `lt(recipes.createdAt, <2026-11-22T00:00:00.000Z>)`

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
