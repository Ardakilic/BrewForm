# recipe-comparison Specification

## Purpose

Defines the recipe compare-and-merge flow. A shared Zod schema describes merge payloads, `POST
/api/v1/recipes/merge` merges two versions the caller may view into a new draft, and the web compare
page shows a side-by-side diff with a per-field merge selector. Its strings exist in both locales,
diff colours are themeable, logs carry ids only, and the behaviour has regression tests.
## Requirements
### Requirement: Shared Zod schema for merge payloads
`packages/shared/src/schemas/recipe.ts` SHALL export `RecipeMergeSchema` and its inferred type `RecipeMerge` (re-exported from `packages/shared/src/schemas/index.ts`) describing a merge request as `recipeVersionId1` and `recipeVersionId2` (`z.uuid()`), `title` (`z.string().min(1).max(200)`) and a `selections` object defaulting to `{}` in which every scalar field (`brewMethod`, `drinkType`, `grindSize`, `groundWeightGrams`, `extractionTimeSeconds`, `extractionVolumeMl`, `temperatureCelsius`, `brewerDetails`, `grinder`, `preparationNotes`, `personalNotes`) is an optional `z.enum(['v1', 'v2'])` and every list field (`tasteNotes`, `equipment`, `additionalPreparations`) is an optional `z.enum(['v1', 'v2', 'both', 'none'])`.

The schema SHALL reject a payload whose two version ids are equal, reporting the issue on `recipeVersionId2`.

#### Scenario: A complete payload validates
- **WHEN** `RecipeMergeSchema.safeParse({ recipeVersionId1: crypto.randomUUID(), recipeVersionId2: crypto.randomUUID(), title: 'Merged', selections: { brewMethod: 'v1', tasteNotes: 'both' } })` is called
- **THEN** `result.success` is `true`, `result.data.selections.brewMethod` is `'v1'` and `result.data.selections.tasteNotes` is `'both'`

#### Scenario: Invalid UUID, empty title and unknown selection values are rejected
- **WHEN** the payload has `recipeVersionId1: 'not-a-uuid'`, or `title: ''`, or `selections: { brewMethod: 'v3' }`, or `selections: { grindSize: 'both' }`
- **THEN** `result.success` is `false` and the issue path names the offending field

#### Scenario: Omitted selections default to an empty object
- **WHEN** a payload without `selections` is parsed
- **THEN** `result.success` is `true` and `result.data.selections` is `{}`

#### Scenario: Merging a version with itself is rejected
- **WHEN** both version ids are the same UUID
- **THEN** `result.success` is `false` with the message "Cannot merge a version with itself" on path `recipeVersionId2`

### Requirement: Model fetches a recipe version with its relations
`apps/api/src/modules/recipe/model.ts` SHALL export `fetchRecipeVersionWithRelations(versionId)`, which returns the `recipeVersions` row with its parent `recipe`, its `tasteNotes` (each with the nested `tasteNote`), its `equipment` (each with the nested `equipment`) and its `additionalPreparations`, or `undefined` when no version has that id.

#### Scenario: Relations are populated
- **WHEN** it is called for a version that has two taste notes and one equipment item
- **THEN** the result carries `recipe`, a `tasteNotes` array of length 2 with nested `tasteNote` objects, an `equipment` array of length 1 with a nested `equipment` object, and an `additionalPreparations` array

#### Scenario: Unknown id returns undefined
- **WHEN** it is called with an id that does not exist
- **THEN** it returns `undefined`

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

### Requirement: POST /api/v1/recipes/merge endpoint with OpenAPI documentation
The recipe router SHALL expose `POST /api/v1/recipes/merge`, registered before any `/:id` or `/:slugOrId` parameter route, guarded by `authGuard`, validated with `zValidator('json', RecipeMergeSchema, zodValidationHook)`, and rejecting unverified accounts with `403 EMAIL_NOT_VERIFIED`; it SHALL return `201` with the success envelope around the created recipe, map `RECIPE_NOT_FOUND` to `404 NOT_FOUND` and `FORBIDDEN` to `403 FORBIDDEN`, and carry `describeRoute()` metadata with tag `Recipes`, `security: [{ bearerAuth: [] }]`, `requestBody: jsonRequestBody(RecipeMergeSchema, …)`, a `201` response of `resolver(successEnvelope(RecipeDetailOutputSchema))` and `resolver(ErrorEnvelopeSchema)` responses for `400`, `401`, `403` and `404`.

#### Scenario: Successful merge returns 201
- **WHEN** a verified user posts a valid payload for two viewable versions
- **THEN** the response is `201` with `{ success: true, data: { id, title, visibility: 'draft', … } }`

#### Scenario: Error responses follow the envelope
- **WHEN** the request is unauthenticated, from an unverified account, references a missing version, references another user's private recipe, or has an invalid body
- **THEN** the status is `401`, `403 EMAIL_NOT_VERIFIED`, `404 NOT_FOUND`, `403 FORBIDDEN` or `400 VALIDATION_ERROR` respectively, each with `success: false`

#### Scenario: The route is in the OpenAPI document
- **WHEN** `/api/v1/openapi.json` is generated
- **THEN** it contains `POST /api/v1/recipes/merge` tagged `Recipes` with a request body and responses for 201, 400, 401, 403 and 404, and `routes/openapi.coverage.test.ts` passes

### Requirement: DiffHighlighter renders one side-by-side comparison row
`apps/web/src/components/recipe/DiffHighlighter.tsx` SHALL render a three-column row (version 1 value, translated label from `labelKey`, version 2 value), SHALL display `'-'` for a `null` value, SHALL pass both values through the optional `formatter`, and SHALL style the row from the optional `status` prop (`added`, `removed`, `modified`, `unchanged`, using the `--diff-added-*`, `--diff-removed-*` and `--diff-modified-*` theme variables) or, when `status` is absent, highlight the row with `--diff-highlight` and accent-coloured values whenever the two displayed values differ.

The component SHALL stay generic, because the version-diff capability reuses it.

#### Scenario: Differing values are highlighted
- **WHEN** `<DiffHighlighter labelKey="recipe.dose" value1={18} value2={20} />` renders
- **THEN** the row background uses the diff highlight colour and the two values use the accent colours

#### Scenario: Identical values stay neutral
- **WHEN** both values are `18`
- **THEN** the row background is transparent and both values use `--text-primary`

#### Scenario: Formatter and null handling
- **WHEN** `formatter` maps enum values to labels, or `value1` is `null` while `value2` is `'medium'`
- **THEN** human-readable labels are shown, or `'-'` is shown for the null side and the row is highlighted

### Requirement: MergeSelector collects per-field version choices
`apps/web/src/components/recipe/MergeSelector.tsx` SHALL render, for each field it receives, a labelled radio group named after the field key with a version 1 and a version 2 option showing each version's value, and a submit button labelled with `t('merge.create')` that calls `onMerge` with the selections made so far (an empty object when nothing was chosen).

#### Scenario: Radio groups per field
- **WHEN** it renders with a `brewMethod` field whose values are `'v60'` and `'aeropress'`
- **THEN** a radio group named `brewMethod` with two options is shown under the translated `recipe.brewMethod` label

#### Scenario: Selections are reported on submit
- **WHEN** the user picks version 1 for `brewMethod` and version 2 for `grindSize` and submits
- **THEN** `onMerge` is called with `{ brewMethod: 'v1', grindSize: 'v2' }`, or with `{}` when the user submits without choosing

### Requirement: Recipe compare page shows differences and offers a merge flow
`apps/web/src/pages/recipes/RecipeComparePage.tsx`, served at `/recipes/compare/:slug1/:slug2`, SHALL load both recipes, render their current versions' parameters through `DiffHighlighter` rows (enum values formatted with `labelFor(BREW_METHODS, …)` and `labelFor(DRINK_TYPES, …)`), and, once both recipes are loaded, show a `t('merge.button')` button that opens the `MergeSelector` in a modal dialog which closes on Escape.

Submitting the selector SHALL call `recipeApi.merge` with both current version ids, the title `"<title 1> + <title 2>"` and the selections, navigate to `/recipes/<newId>/edit` on success, and show the error message in the dialog on failure. The page SHALL log `RecipeComparePage mounted` / `unmounted` at debug level and log merge failures with the `err` object.

#### Scenario: Differences are highlighted on the page
- **WHEN** a user opens `/recipes/compare/a/b` for two recipes with different doses and equal temperatures
- **THEN** the dose row is highlighted and the temperature row is neutral

#### Scenario: Merge creates a draft and opens its editor
- **WHEN** the user opens the merge dialog, chooses parameters and submits
- **THEN** `recipeApi.merge` is called with the two current version ids and the selections, and the browser navigates to the new recipe's edit page

#### Scenario: Merge failure is shown, not thrown
- **WHEN** the merge request fails
- **THEN** the dialog shows the error message and the page stays usable

### Requirement: Web API client exposes a typed merge call
`recipeApi` in `apps/web/src/api/index.ts` SHALL expose `merge(body: RecipeMerge)` that posts to `/recipes/merge` and resolves to the unwrapped `RecipeDetailOutput`, with both types imported from `@brewform/shared/schemas`.

#### Scenario: The merge call is typed end to end
- **WHEN** `recipeApi.merge({ recipeVersionId1, recipeVersionId2, title, selections })` is awaited
- **THEN** the TypeScript return type is `RecipeDetailOutput` and `make check-web` passes without casts

### Requirement: Merge UI strings exist in both locales
`packages/shared/src/i18n/en.json` and `tr.json` SHALL both define `merge.selectParams`, `merge.create` and `merge.button` (en: "Select Parameters to Keep", "Create Merged Recipe", "Merge Recipes"; tr: "Korunacak Parametreleri Seçin", "Birleştirilmiş Tarif Oluştur", "Tarifleri Birleştir"), and the comparison rows SHALL reuse the existing `recipe.*` label keys rather than duplicating them.

#### Scenario: Keys resolve in both locales
- **WHEN** `t('merge.selectParams')` is called with locale `en` and then `tr`
- **THEN** it returns "Select Parameters to Keep" and then "Korunacak Parametreleri Seçin"

### Requirement: Diff colours are themeable
`apps/web/src/styles/globals.css` SHALL define `--diff-highlight` and the `--diff-added-bg/-text`, `--diff-removed-bg/-text` and `--diff-modified-bg/-text` custom properties in each of the three theme blocks (light `:root`, `.dark`, `.coffee`).

#### Scenario: Variables exist in every theme
- **WHEN** the three theme blocks in `globals.css` are inspected
- **THEN** each defines `--diff-highlight` and the six status variables

### Requirement: Merge flow logging carries ids, never payloads
`mergeRecipes` SHALL log `mergeRecipes started` with `{ authorId }`, `mergeRecipes completed` with `{ authorId, recipeId }` and `mergeRecipes failed` with `{ err, authorId }`, using the module-scoped recipe service logger, and SHALL NOT log the merge payload (it may contain `personalNotes`).

#### Scenario: Logs omit the payload
- **WHEN** `mergeRecipes('user-1', payload)` runs successfully
- **THEN** debug logs `mergeRecipes started` and `mergeRecipes completed` are emitted with only ids, and neither contains `payload` or `personalNotes`

### Requirement: Merge behaviour has regression test coverage
The capability SHALL be covered by `packages/shared/src/schemas/recipe.merge.test.ts` (schema cases, including self-merge rejection), `apps/api/src/modules/recipe/merge.test.ts` (service and helper cases, including the soft-deleted and forbidden sources), `apps/api/src/modules/recipe/merge.route.test.ts` (201, 400, 401, 403 for both unverified email and another user's private source, 404) and the Vitest + Testing Library suites `apps/web/src/components/recipe/DiffHighlighter.test.tsx` and `MergeSelector.test.tsx`, all using `describe`/`it`/`expect`/`vi` from `vitest`.

#### Scenario: Suites pass
- **WHEN** `make test-api`, `make test-shared` and `make test-web` run
- **THEN** every merge-related suite passes, including the cases for soft-deleted and forbidden sources

