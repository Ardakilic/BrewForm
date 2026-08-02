# recipe-filter Specification

## MODIFIED Requirements

### Requirement: Shared recipe filter-building helper

The system SHALL provide a `buildRecipeFilters(filters: RecipeFilterCriteria): SQL[]`
function exported from `apps/api/src/modules/recipe/model.ts`. The
function SHALL handle every filter key defined on
`RecipeFilterCriteria`:

- `brewMethod?: BrewMethod`
- `drinkType?: DrinkType`
- `search?: string` (matches `recipes.title` + `recipeVersions.productName` + `recipeVersions.personalNotes`)
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

Each branch SHALL generate Drizzle conditions using `ilike`, `inArray`, `gte`, `lte`, `or`, `and` helpers — no raw SQL. Both `listRecipes()` (in `service.ts`) and `findStarred()` (in `model.ts`) SHALL call this helper and SHALL NOT contain any inline filter `if` blocks.

#### Scenario: author filter generates users subquery condition

- When `buildRecipeFilters({ author: 'alice' })` is called
- Then the returned array contains exactly one condition: `inArray(recipes.authorId, db.select({ id: users.id }).from(users).where(or(ilike(users.username, '%alice%'), ilike(users.displayName, '%alice%'))))`

#### Scenario: dateFrom filter generates gte condition

- When `buildRecipeFilters({ dateFrom: new Date('2025-01-01') })` is called
- Then the returned array contains exactly one condition: `gte(recipes.createdAt, <2025-01-01 date>)`

#### Scenario: minRating filter generates having subquery

- When `buildRecipeFilters({ minRating: 7 })` is called
- Then the returned array contains exactly one condition: `inArray(recipes.id, db.select({ recipeId: userRecipeRatings.recipeId }).from(userRecipeRatings).groupBy(userRecipeRatings.recipeId).having(gte(avg(userRecipeRatings.rating), 7)))`

#### Scenario: search matches personalNotes (NEW)

- When `buildRecipeFilters({ search: 'V60' })` is called
- Then the returned `or()` condition includes an `inArray(recipes.id, ... ilike(recipeVersions.personalNotes, '%V60%'))` branch (in addition to the existing title and productName branches)

#### Scenario: grinder field is not in RecipeFilterSchema

- When `packages/shared/src/schemas/recipe.ts` is inspected after the change
- Then the `RecipeFilterSchema` object does NOT contain a `grinder` key

#### Scenario: grinder param silently dropped

- When a client sends `GET /api/v1/recipes?grinder=Niche`
- Then `grinder` is stripped by Zod's default unknown-keys behavior (no error, no effect)
