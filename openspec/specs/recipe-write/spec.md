# recipe-write Specification

## Purpose
TBD - created by archiving change d29-recipe-service-layering. Update Purpose after archive.
## Requirements
### Requirement: Service layer does not import from drizzle-orm

`apps/api/src/modules/recipe/service.ts` SHALL NOT import `db` from
`@brewform/db`, SHALL NOT import any symbol from `@brewform/db/schema`, and
SHALL NOT import any symbol (`eq`, `and`, `sql`, etc.) from `drizzle-orm`.
All database access from the service layer SHALL go through the model layer
(`import * as model from './model.ts'`) or through pure-function utilities
that do not touch Drizzle. The file-level docstring SHALL restate this rule
without any per-function carve-out.

#### Scenario: service.ts has no drizzle-orm imports

- **WHEN** `grep -n 'drizzle-orm\|@brewform/db' apps/api/src/modules/recipe/service.ts` is run
- **THEN** the command produces no output (zero matches)

#### Scenario: service.ts has no schema-table references

- **WHEN** the source of `service.ts` is inspected
- **THEN** none of the identifiers `recipes`, `recipeVersions`,
  `recipeTasteNotes`, `recipeEquipment`, `recipeAdditionalPreparations`,
  `recipeVersionPhotos` appear as direct schema-table references (they may
  appear in comments or string literals, but not as imported identifiers)

#### Scenario: file docstring has no carve-out

- **WHEN** the file-level JSDoc at `service.ts:1-11` is read
- **THEN** it does not contain the phrase "except for the compatibility
  validation helper" and states that all DB access is delegated to `model.ts`

### Requirement: `createRecipeWithRelations` model helper owns the creation transaction

The system SHALL provide a `createRecipeWithRelations(input:
CreateRecipeWithRelationsInput)` function exported from
`apps/api/src/modules/recipe/model.ts`, co-located with `forkRecipe`. The
function SHALL own the entire `db.transaction` block that creates a recipe:
inserting the `recipes` row (with `currentVersionId = null`), inserting the
first `recipeVersions` row (with `versionNumber = 1`), conditionally
inserting `recipeTasteNotes`, `recipeEquipment`,
`recipeAdditionalPreparations`, and `recipeVersionPhotos` rows, and finally
updating `recipes.currentVersionId` to the new version's id. The
transaction body SHALL be moved verbatim from the previous inline
implementation in `service.ts` — the SQL emitted SHALL be byte-identical.

The function SHALL accept a single typed `CreateRecipeWithRelationsInput`
interface (exported from `model.ts`) carrying: the recipe-level fields
(`authorId`, `slug`, `title`, `visibility`), the exhaustive version-level
fields (every column `service.ts` previously inserted into `recipeVersions`,
pre-resolved by the service — including `Date`-cast dates, computed
`brewRatio`/`flowRate`, setup-inherited `grinder`/`brewerDetails`, and
sanitized `personalNotes`/`preparationNotes`), and the child-relation arrays
(`tasteNoteIds`, `tasteNoteIntensities`, `equipmentIds`,
`additionalPreparations`, `photoIds`). The helper SHALL NOT re-derive any
of these values — it is a pure data-access function.

The helper SHALL NOT add fields the previous transaction omitted. In
particular, `tds`, `coffeeVarietyId`, and `coffeeVarietyName` SHALL remain
absent from the `recipeVersions` insert (preserving the current behavior
verbatim). Fixing the `tds` omission is a separate change.

#### Scenario: helper is exported from model.ts

- **WHEN** the exports of `apps/api/src/modules/recipe/model.ts` are inspected
- **THEN** `createRecipeWithRelations` and `CreateRecipeWithRelationsInput`
  are both present

#### Scenario: helper owns a single transaction

- **WHEN** the body of `createRecipeWithRelations` is inspected
- **THEN** it contains exactly one `db.transaction(async (tx) => { ... })`
  call that performs the recipe insert, version insert, child inserts, and
  `currentVersionId` update

#### Scenario: version insert is exhaustive

- **WHEN** the `tx.insert(recipeVersions).values({...})` call inside the
  helper is inspected
- **THEN** it includes exactly the 28 fields the previous
  `service.ts:218-247` insert included — no more, no less (no `tds`, no
  `coffeeVarietyId`, no `coffeeVarietyName`)

#### Scenario: currentVersionId two-step update is preserved

- **WHEN** the `recipes` row is inserted
- **THEN** `currentVersionId` is `null`
- **AND** **WHEN** the `recipeVersions` row is inserted
- **THEN** a subsequent `tx.update(recipes).set({ currentVersionId: version.id }).where(eq(recipes.id, r.id))` is executed before the transaction commits

#### Scenario: taste-note intensity default

- **WHEN** `tasteNoteIds` is provided without a matching `tasteNoteIntensities` entry for a given id
- **THEN** the inserted `recipeTasteNotes.intensity` is `1`

#### Scenario: additional-preparation and version-photo sortOrder

- **WHEN** `additionalPreparations` or `photoIds` are provided as arrays
- **THEN** each inserted row's `sortOrder` equals the array index of its
  position in the input array

#### Scenario: no eq parameter shadowing

- **WHEN** the `.map(...)` callbacks inside the helper are inspected
- **THEN** none of them name their parameter `eq` (which would shadow the
  imported `drizzle-orm` `eq`)

### Requirement: `createRecipeWithRelations` returns the rich findById shape

`createRecipeWithRelations` SHALL return the full relational shape produced
by `model.findById(id)` — the recipe row plus `author` (`{ id, username,
displayName, avatarUrl }`), `versions` (each with nested `tasteNotes[].tasteNote`,
`equipment[].equipment`, `additionalPreparations`, `versionPhotos[].photo`,
`bean`), `photos`, and `forkedFrom`. The helper SHALL call `findById(r.id)`
after the `db.transaction` commits and return its result. The helper SHALL
NOT return the bare `{ ...r, versions: [version] }` shape the inline
transaction previously produced (which lacked all nested relations) — that
would be a wire-format regression.

#### Scenario: returned shape matches findById

- **WHEN** `createRecipeWithRelations(input)` is called with valid input
- **THEN** the returned object has an `author` property with `id`,
  `username`, `displayName`, `avatarUrl`
- **AND** the returned object has a `versions` array whose first element has
  `tasteNotes` (with nested `tasteNote`), `equipment` (with nested
  `equipment`), `additionalPreparations`, `versionPhotos` (with nested
  `photo`), and `bean`
- **AND** the returned object has `photos` and `forkedFrom` properties

#### Scenario: helper calls findById after the transaction

- **WHEN** the body of `createRecipeWithRelations` is inspected
- **THEN** after the `db.transaction(...)` returns, the function calls
  `findById(id)` (where `id` is the recipe row's id from the transaction)
  and returns the result of that call

### Requirement: `createRecipe` service function delegates to the helper

`apps/api/src/modules/recipe/service.ts:createRecipe` SHALL perform only
pre-transaction business logic (equipment compatibility validation, title
sanitization, slug generation, setup inheritance, `brewRatio`/`flowRate`
computation) and post-transaction side effects (follower notification when
`visibility === 'public'`, badge evaluation). The multi-table insert SHALL
be delegated to `model.createRecipeWithRelations(...)`. The service SHALL
NOT call `model.findById` after the helper returns — the helper already
returns the rich shape. The service SHALL NOT contain any `db.transaction`,
`tx.insert`, `tx.update`, or `eq(...)` call.

#### Scenario: createRecipe calls the helper

- **WHEN** the body of `service.ts:createRecipe` is inspected
- **THEN** it contains a call to `model.createRecipeWithRelations({...})`
  with the pre-resolved input
- **AND** it does not contain any `db.transaction(...)` call

#### Scenario: service drops the post-transaction findById

- **WHEN** the body of `service.ts:createRecipe` is inspected after the
  helper call
- **THEN** there is no `await model.findById(...)` call between the helper
  call and the `return finalRecipe` statement (the `finalRecipe` variable is
  assigned the helper's return value directly)

#### Scenario: side effects are unchanged

- **WHEN** the body of `service.ts:createRecipe` is inspected
- **THEN** the `notifyFollowersOfNewRecipe` IIFE (guarded on
  `finalRecipe?.visibility === 'public'`) and the `evaluateBadges`
  fire-and-forget call are present and unchanged from before D29

### Requirement: `createRecipeWithRelations` has a full JSDoc docblock

`createRecipeWithRelations` SHALL have a multi-line JSDoc docblock
immediately preceding its declaration, matching the `forkRecipe` house style:
a one-sentence description, a paragraph noting the transaction, `@param`
for the input, and `@returns` describing the rich shape. The
`CreateRecipeWithRelationsInput` interface SHALL also have a docblock. The
function SHALL have entry/exit `log.debug` calls (with traceable IDs only —
`authorId`, `recipeId` — never the input payload, which may contain
`personalNotes`).

#### Scenario: docblock is present and complete

- **WHEN** the source above `createRecipeWithRelations` is inspected
- **THEN** a `/** ... */` block is present, contains a description of the
  transaction, an `@param` tag for `input`, and an `@returns` tag describing
  the rich shape

#### Scenario: entry/exit logs are present and safe

- **WHEN** the body of `createRecipeWithRelations` is inspected
- **THEN** it logs `createRecipeWithRelations started` with `{ authorId }`
  near the top and `createRecipeWithRelations completed` with
  `{ authorId, recipeId }` near the end
- **AND** neither log line includes the input payload or `personalNotes`

### Requirement: `POST /api/v1/recipes` is fully documented with a response schema

The `POST /api/v1/recipes` route's `describeRoute` SHALL include:
`tags: ['Recipes']`, `summary`, `description`, `security: [{ bearerAuth: [] }]`,
`requestBody: jsonRequestBody(RecipeCreateSchema)`, and a `responses` map
with `201` documented via `resolver(successEnvelope(RecipeDetailOutputSchema))`
and `400` / `401` / `403` documented via `resolver(ErrorEnvelopeSchema)`. The
`RecipeDetailOutputSchema` SHALL be added to
`packages/shared/src/schemas/responses/recipe.ts`, derived from the actual
`findById` return shape (recipe row + author with `id` + versions with nested
`tasteNotes`/`equipment`/`additionalPreparations`/`versionPhotos`/`bean` +
`photos` + `forkedFrom`). It SHALL be registered in the
`responses/index.ts` barrel, have a co-located round-trip unit test in
`recipe.test.ts`, and be registered in the
`output-schema-acceptance.pbt.test.ts` `cases` array.

#### Scenario: describeRoute has a request body

- **WHEN** the `POST /api/v1/recipes` route's `describeRoute` is inspected
- **THEN** it includes `requestBody: jsonRequestBody(RecipeCreateSchema)`

#### Scenario: 201 response is a success envelope of the detail schema

- **WHEN** the `responses[201]` entry of the `POST /api/v1/recipes`
  `describeRoute` is inspected
- **THEN** it includes `content: { 'application/json': { schema:
  resolver(successEnvelope(RecipeDetailOutputSchema)) } }`

#### Scenario: error responses are error envelopes

- **WHEN** the `responses[400]`, `responses[401]`, and `responses[403]`
  entries are inspected
- **THEN** each includes `content: { 'application/json': { schema:
  resolver(ErrorEnvelopeSchema) } }`

#### Scenario: RecipeDetailOutputSchema is exported and registered

- **WHEN** `packages/shared/src/schemas/responses/index.ts` is inspected
- **THEN** `RecipeDetailOutputSchema` is re-exported from the `recipe.ts`
  block
- **AND** **WHEN** `packages/shared/src/schemas/responses/recipe.test.ts`
  is inspected
- **THEN** a `describe('RecipeDetailOutputSchema')` block with a round-trip
  `it` exists
- **AND** **WHEN** `packages/shared/src/schemas/responses/output-schema-acceptance.pbt.test.ts`
  is inspected
- **THEN** `RecipeDetailOutputSchema` is present in the `cases` array

#### Scenario: RecipeDetailOutputSchema matches the findById shape

- **WHEN** `RecipeDetailOutputSchema` is compared against the
  `db.query.recipes.findFirst({ with: {...} })` call at `model.ts:231-250`
- **THEN** it includes a base `RecipeRowSchema`, an `author` sub-schema with
  `{ id, username, displayName, avatarUrl }`, a `versions` array whose
  element schema includes `tasteNotes` (with nested `tasteNote`),
  `equipment` (with nested `equipment`), `additionalPreparations`,
  `versionPhotos` (with nested `photo`), and `bean`, a `photos` array, and a
  nullable `forkedFrom` with `{ id, slug, title }`

### Requirement: Tests cover the create path at model, service, and HTTP layers

A model-level integration test (`model.create.test.ts`) SHALL exercise
`createRecipeWithRelations` directly: asserting the recipe row is inserted
with the correct fields, `currentVersionId` is set to `versions[0].id`, the
version row has `versionNumber: 1` and all passed fields, taste notes are
inserted with the correct intensity (default `1`), equipment and additional
preparations and version photos are inserted with the correct `sortOrder`,
and the returned shape matches `findById`. A service-level integration test
SHALL assert `service.createRecipe` returns the rich shape end-to-end. An
HTTP integration test SHALL assert `POST /api/v1/recipes` returns `201` with
a success envelope whose `data` has `author`, `versions[0].tasteNotes`, and
`currentVersionId`. All tests SHALL use the project's fixture pattern
(`test-setup.ts` first import, `describe` options `{ sanitizeOps: false,
sanitizeResources: false }`, `beforeEach`/`afterEach` with
`crypto.randomUUID()` ids and explicit child-first `db.delete` cleanup).

#### Scenario: model-level test exists and passes

- **WHEN** `make test-specific filter=apps/api/src/modules/recipe/model.create.test.ts`
  is run
- **THEN** all `it` blocks pass and cover: recipe row insert, version row
  insert, taste notes (present and absent), equipment, additional
  preparations, version photos, and return shape

#### Scenario: service-level test exists and passes

- **WHEN** the service-level create test is run
- **THEN** it asserts `service.createRecipe` returns an object with
  `author.id === authorId`, `versions[0].versionNumber === 1`, and
  `currentVersionId === versions[0].id`

#### Scenario: HTTP test exists and passes

- **WHEN** `make test-specific filter=apps/api/src/modules/recipe/index_test.ts`
  is run
- **THEN** the `POST /api/v1/recipes` test asserts `201`, `body.success === true`,
  `body.data.author.id`, `body.data.versions[0].tasteNotes` (array), and
  `body.data.currentVersionId === body.data.versions[0].id`

#### Scenario: tests clean up after themselves

- **WHEN** any of the three test files' `afterEach` is inspected
- **THEN** it deletes created rows child-first (`recipeTasteNotes` →
  `recipeEquipment` → `recipeAdditionalPreparations` → `recipeVersionPhotos`
  → `recipeVersions` → `recipes` → `users`) using `db.delete(...).where(eq(...) | inArray(...))`

### Requirement: All verification commands pass

After D29 is applied, the project's verification commands SHALL all pass with
zero errors and zero warnings: `make fmt`, `make check`, `make check-tests`,
`make lint`, `make test-api`, and `make test-shared`. The OpenAPI coverage
test (`openapi.coverage.test.ts`) SHALL continue to pass.

#### Scenario: full gate is green

- **WHEN** `make fmt && make check && make check-tests && make lint && make test-api && make test-shared` is run
- **THEN** every command exits 0 with no errors and no warnings

