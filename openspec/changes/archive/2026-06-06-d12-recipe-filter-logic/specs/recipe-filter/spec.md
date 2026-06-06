## ADDED Requirements

### Requirement: Shared recipe filter-building helper

The system SHALL provide a `buildRecipeFilters(filters: RecipeFilterCriteria): SQL[]`
function exported from `apps/api/src/modules/recipe/model.ts`. The
function SHALL handle every filter key defined on
`RecipeFilterCriteria`:

- `brewMethod?: BrewMethod`
- `drinkType?: DrinkType`
- `search?: string`
- `equipmentId?: string`
- `tasteNoteIds?: string` (comma-separated UUIDs)
- `tasteNoteId?: string` (deprecated, singular; backward compatibility)
- `mainBrewer?: string`
- `coffeeVarietyId?: string`

Each branch SHALL generate the exact same Drizzle condition structure
that `apps/api/src/modules/recipe/service.ts:listRecipes()` produced
prior to the refactor. Both `listRecipes()` (in `service.ts`) and
`findStarred()` (in `model.ts`) SHALL call this helper and SHALL NOT
contain any inline filter `if` blocks.

#### Scenario: listRecipes calls the helper

- **WHEN** `service.ts:listRecipes(filters)` is invoked with any
  filter combination
- **THEN** the function calls `model.buildRecipeFilters(filters)`
  exactly once and uses the returned array as the filter portion of
  its `WHERE` clause

#### Scenario: findStarred calls the helper

- **WHEN** `model.ts:findStarred(userId, filters, ...)` is invoked
  with any filter combination
- **THEN** the function calls `buildRecipeFilters(filters)` exactly
  once and uses the returned array as the filter portion of its
  `WHERE` clause

#### Scenario: No inline filter blocks remain in either call site

- **WHEN** `apps/api/src/modules/recipe/service.ts` and
  `apps/api/src/modules/recipe/model.ts` are inspected after the
  refactor
- **THEN** neither `listRecipes` nor `findStarred` contains any
  `if (filters.brewMethod)`, `if (filters.drinkType)`,
  `if (filters.search)`, `if (filters.mainBrewer)`,
  `if (filters.equipmentId)`, `if (filters.tasteNoteIds)`,
  `if (filters.tasteNoteId)`, or `if (filters.coffeeVarietyId)`
  branch

### Requirement: Caller composes base conditions

`buildRecipeFilters` SHALL NOT include visibility conditions,
favourite-scope conditions, `authorId` conditions, or any other
caller-specific base condition. The helper's return value SHALL
contain only conditions derived from `RecipeFilterCriteria`. Callers
SHALL prepend their own base conditions and compose the resulting
array with Drizzle's `and()`.

#### Scenario: Helper output omits visibility

- **WHEN** `buildRecipeFilters({ brewMethod: 'ESPRESSO' })` is called
- **THEN** the returned `SQL[]` contains exactly one condition (the
  `brewMethod` subquery) and does NOT contain any reference to
  `recipes.visibility`

#### Scenario: listRecipes prepends visibility condition

- **WHEN** `service.ts:listRecipes(filters)` composes its `WHERE`
  clause
- **THEN** the visibility condition (admin-aware) is prepended to
  the array returned by `buildRecipeFilters(filters)` before
  `and(...)` is applied

#### Scenario: findStarred prepends public visibility condition

- **WHEN** `model.ts:findStarred(userId, filters, ...)` composes its
  `WHERE` clause
- **THEN** `eq(recipes.visibility, 'public')` is prepended to the
  array returned by `buildRecipeFilters(filters)` before `and(...)`
  is applied

### Requirement: Type safety on the conditions array

The return type of `buildRecipeFilters` SHALL be `SQL[]`, not
`any[]`. Inside the helper, every value pushed to the local
`conditions` array SHALL be of type `SQL`. Where the helper invokes
Drizzle's `or()` (which returns `SQL | undefined`), the result SHALL
be assigned to a local variable and pushed only after a non-null
check.

After the refactor, `apps/api/src/modules/recipe/model.ts:findStarred()`
SHALL declare its local conditions array as `const conditions: SQL[]`
(not `const conditions: any[]`).

#### Scenario: Helper signature returns SQL[]

- **WHEN** TypeScript checks
  `apps/api/src/modules/recipe/model.ts`
- **THEN** the declared return type of `buildRecipeFilters` is
  `SQL[]` and the function body type-checks under that constraint

#### Scenario: findStarred conditions array is SQL[]

- **WHEN** `apps/api/src/modules/recipe/model.ts:findStarred` is
  inspected after the refactor
- **THEN** the local conditions array declaration reads
  `const conditions: SQL[]`

#### Scenario: search branch null-guards or()

- **WHEN** `buildRecipeFilters({ search: 'foo' })` is called
- **THEN** the result of `or(ilike(...), inArray(...))` is assigned
  to a local variable and pushed to `conditions` only when that
  variable is truthy

### Requirement: coffeeVarietyId delegates to the existing helper

When `coffeeVarietyId` is provided, `buildRecipeFilters` SHALL call
the existing exported `recipeCoffeeVarietyCondition()` helper in
`apps/api/src/modules/recipe/model.ts` and push its return value.
The helper SHALL NOT inline a duplicate `inArray(recipes.id,
db.select(...).from(recipeVersions).where(...))` subquery for this
filter.

#### Scenario: coffeeVarietyId branch delegates

- **WHEN** `buildRecipeFilters({ coffeeVarietyId: 'some-uuid' })` is
  called
- **THEN** the returned array contains exactly one condition, which
  is the value produced by `recipeCoffeeVarietyCondition('some-uuid')`

#### Scenario: findStarred inline coffeeVariety subquery is removed

- **WHEN** `apps/api/src/modules/recipe/model.ts:findStarred` is
  inspected after the refactor
- **THEN** the inline `inArray(recipes.id, db.select(...).from(recipeVersions).where(eq(recipeVersions.coffeeVarietyId, ...)))`
  block previously present at lines ~614–623 is absent

### Requirement: Deprecated tasteNoteId (singular) is honoured

`buildRecipeFilters` SHALL honour the deprecated singular `tasteNoteId`
filter as a fallback when the plural `tasteNoteIds` is not provided.
When `tasteNoteId` (singular) is provided AND `tasteNoteIds` (plural)
is NOT, the helper SHALL generate a single taste-note condition
equivalent to the legacy behaviour of `service.ts:listRecipes()`. When
both `tasteNoteIds` and `tasteNoteId` are provided, the plural
`tasteNoteIds` SHALL take precedence and `tasteNoteId` SHALL be
ignored (matching the existing `else if` branch in `listRecipes`).

This means `model.ts:findStarred()` — which previously dropped
`tasteNoteId` silently — SHALL pick up the deprecated singular filter
for free after the refactor. This is an intentional parity fix
against the public `RecipeFilterSchema` contract.

#### Scenario: Singular tasteNoteId generates one condition

- **WHEN** `buildRecipeFilters({ tasteNoteId: 'some-uuid' })` is
  called (and `tasteNoteIds` is absent)
- **THEN** the returned array contains exactly one
  `inArray(recipes.currentVersionId, db.select(...).from(recipeTasteNotes).where(eq(recipeTasteNotes.tasteNoteId, 'some-uuid')))`
  condition

#### Scenario: Plural tasteNoteIds takes precedence

- **WHEN** `buildRecipeFilters({ tasteNoteIds: 'a,b', tasteNoteId: 'c' })`
  is called
- **THEN** the returned array contains two conditions (for `a` and
  `b`) and no condition referencing `c`

#### Scenario: /api/v1/recipes/starred honours singular tasteNoteId

- **WHEN** a `GET /api/v1/recipes/starred?tasteNoteId=<uuid>` request
  is processed
- **THEN** the resulting query includes the single-taste-note
  condition (previously dropped silently on this endpoint)

### Requirement: Empty and sanitized filter inputs generate no condition

`buildRecipeFilters` SHALL treat empty or sanitization-stripped
inputs as "no filter":

- An empty `search` string, OR a `search` string that becomes empty
  after stripping `%` and `_` characters, SHALL generate no
  condition.
- An empty `mainBrewer` string, OR a `mainBrewer` string that
  becomes empty after stripping `%` and `_` characters, SHALL
  generate no condition.
- A `tasteNoteIds` string that is an empty string SHALL generate no
  condition. (Whitespace-only entries within a non-empty
  comma-separated list MAY still produce a condition, matching the
  legacy behaviour of `service.ts:listRecipes()`.)
- All other absent filter keys (`brewMethod`, `drinkType`,
  `equipmentId`, `coffeeVarietyId`, `tasteNoteId`) SHALL generate
  no condition when their value is `undefined` or empty string.

#### Scenario: Empty search is ignored

- **WHEN** `buildRecipeFilters({ search: '' })` is called
- **THEN** the returned array is empty

#### Scenario: Sanitization-stripped search is ignored

- **WHEN** `buildRecipeFilters({ search: '%_%' })` is called
- **THEN** the returned array is empty (the sanitized form is the
  empty string)

#### Scenario: Sanitization-stripped mainBrewer is ignored

- **WHEN** `buildRecipeFilters({ mainBrewer: '%' })` is called
- **THEN** the returned array is empty

#### Scenario: Empty filters object returns an empty array

- **WHEN** `buildRecipeFilters({})` is called
- **THEN** the returned array is exactly `[]`
