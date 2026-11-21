## MODIFIED Requirements

### Requirement: Service merges two accessible versions into a new draft
`mergeRecipes(authorId, data)` in `apps/api/src/modules/recipe/service.ts` SHALL load both versions through the model, throw `RECIPE_NOT_FOUND` when either version is missing or its recipe is soft-deleted, throw `FORBIDDEN` when the caller may not view either source recipe under the shared visibility predicate (`canViewRecipe`: public and unlisted recipes are viewable by anyone, draft and private recipes only by their author), and otherwise create a new recipe through `createRecipe` with `visibility: 'draft'`, `isFavourite: false`, the requested `title` and the selected field values.

Unselected scalar fields SHALL be empty except `brewMethod` and `drinkType`, which fall back to version 1's values, and `preparationNotes`, which falls back to `'Merged recipe'`. List fields SHALL follow their selection (`v1`, `v2`, `both` = de-duplicated union, `none` or unset = empty), computed by the exported helpers `getMergedIds` and `getMergedPreparations`. Taste notes and equipment whose catalog row is soft-deleted SHALL be dropped from the merged lists before `createRecipe` runs (the relation rows loaded by `fetchRecipeVersionWithRelations` carry the row's `deletedAt`), so a merge never fails on a record deleted after it was linked. Taste-note intensities are not carried over (they default to 1 in `createRecipe`). The service SHALL NOT import `drizzle-orm` or `@brewform/db`.

#### Scenario: Selected fields come from the chosen version
- **WHEN** `mergeRecipes(authorId, { …, selections: { brewMethod: 'v1', temperatureCelsius: 'v2' } })` is called on two viewable versions
- **THEN** the returned recipe is a draft titled as requested whose version uses version 1's `brewMethod` and version 2's `temperatureCelsius`

#### Scenario: Taste notes are unioned with 'both'
- **WHEN** version 1 has taste notes [A, B], version 2 has [B, C] and `selections.tasteNotes` is `'both'`
- **THEN** the merged recipe has taste notes A, B and C exactly once each

#### Scenario: Soft-deleted taste notes and equipment are dropped
- **WHEN** version 1 links taste note A and soft-deleted taste note D, version 2 links B, and `selections.tasteNotes` is `'both'`
- **THEN** the merge succeeds and the merged recipe has taste notes A and B only

#### Scenario: Missing or deleted source returns not found
- **WHEN** `recipeVersionId1` does not exist, or belongs to a recipe whose `deletedAt` is set
- **THEN** the function throws `RECIPE_NOT_FOUND`

#### Scenario: Another user's private source is forbidden
- **WHEN** `recipeVersionId2` belongs to another user's `private` or `draft` recipe
- **THEN** the function throws `FORBIDDEN` and no recipe is created
