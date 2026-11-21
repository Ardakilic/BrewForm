## MODIFIED Requirements

### Requirement: `createRecipeWithRelations` model helper owns the creation transaction

The system SHALL provide a `createRecipeWithRelations(input: CreateRecipeWithRelationsInput)` function exported from `apps/api/src/modules/recipe/model.ts`, co-located with `forkRecipe`. The
function SHALL own the entire `db.transaction` block that creates a recipe:
inserting the `recipes` row (with `currentVersionId = null`), inserting the
first `recipeVersions` row (with `versionNumber = 1`), conditionally
inserting `recipeTasteNotes`, `recipeEquipment`,
`recipeAdditionalPreparations`, and `recipeVersionPhotos` rows, and finally
updating `recipes.currentVersionId` to the new version's id.

The function SHALL accept a single typed `CreateRecipeWithRelationsInput`
interface (exported from `model.ts`) carrying: the recipe-level fields
(`authorId`, `slug`, `title`, `visibility`), the exhaustive version-level
fields (every `recipe_version` column except `id`, `recipeId`, `versionNumber`
and `createdAt`, pre-resolved by the service, including `Date`-cast dates,
computed `brewRatio`/`flowRate`, setup-inherited `grinder`/`brewerDetails`,
sanitized `personalNotes`/`preparationNotes`, `tds` as a decimal string or
`null`, and `coffeeVarietyId` with its server-resolved `coffeeVarietyName`), and
the child-relation arrays (`tasteNoteIds`, `tasteNoteIntensities`,
`equipmentIds`, `additionalPreparations`, `photoIds`). The helper SHALL NOT
re-derive any of these values; it is a pure data-access function.

The version row values SHALL be produced by the shared version-column mapping
defined in "Version-write paths share one column mapping", so the create, amend,
bump and fork paths cannot drift. The previous rule that kept `tds`,
`coffeeVarietyId` and `coffeeVarietyName` out of the insert is withdrawn: all
three SHALL be inserted.

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
- **THEN** it sets every `recipe_version` column except `id` and `createdAt`
  (31 columns), including `tds`, `coffeeVarietyId` and `coffeeVarietyName`

#### Scenario: tds and coffee variety round-trip on create

- **WHEN** the helper is called with `tds: '1.35'`, `coffeeVarietyId: <id>` and `coffeeVarietyName: 'Gesha'`
- **THEN** the returned `versions[0]` has `tds === '1.35'`, `coffeeVarietyId === <id>` and `coffeeVarietyName === 'Gesha'`

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

### Requirement: `createRecipe` service function delegates to the helper

`apps/api/src/modules/recipe/service.ts:createRecipe` SHALL perform only pre-transaction business logic (equipment compatibility validation, referenced-record validation, coffee-variety name resolution, title sanitization, slug generation, setup inheritance, `brewRatio`/`flowRate` computation, `tds` normalization to a decimal string) and post-transaction side effects (follower notification when
`visibility === 'public'`, badge evaluation). The multi-table insert SHALL
be delegated to `model.createRecipeWithRelations(...)`. The service SHALL
NOT call `model.findById` after the helper returns, because the helper already
returns the rich shape. The service SHALL NOT contain any `db.transaction`,
`tx.insert`, `tx.update`, or `eq(...)` call. All validation SHALL complete
before the helper is called, so a rejected request writes nothing.

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

#### Scenario: invalid references write nothing

- **WHEN** `createRecipe` is called with an unknown `coffeeVarietyId`
- **THEN** it throws a validation error before `createRecipeWithRelations` is called and no `recipe` row exists for the title

### Requirement: Tests cover the create path at model, service, and HTTP layers

A model-level integration test (`model.create.test.ts`) SHALL exercise `createRecipeWithRelations` directly: asserting the recipe row is inserted
with the correct fields, `currentVersionId` is set to `versions[0].id`, the
version row has `versionNumber: 1` and all passed fields (including `tds`,
`coffeeVarietyId` and `coffeeVarietyName`), taste notes are inserted with the
correct intensity (default `1`), equipment and additional preparations and
version photos are inserted with the correct `sortOrder`, and the returned shape
matches `findById`. A service-level integration test SHALL assert
`service.createRecipe` returns the rich shape end-to-end and persists `tds` and
the coffee variety. An HTTP integration test SHALL assert `POST /api/v1/recipes`
returns `201` with a success envelope whose `data` has `author`,
`versions[0].tasteNotes`, `versions[0].tds`, `versions[0].coffeeVarietyName` and
`currentVersionId`. All tests SHALL use Vitest (`describe`/`it`/`expect` from
`vitest`), `*.test.ts` file names, the project's fixture pattern
(`import '../../test-setup.ts'` as the first import, `beforeEach`/`afterEach`
with `crypto.randomUUID()` ids and explicit child-first `db.delete` cleanup), and
SHALL run against the `brewform_test` database through the `make test*` targets.

#### Scenario: model-level test exists and passes

- **WHEN** `make test-specific filter=apps/api/src/modules/recipe/model.create.test.ts`
  is run
- **THEN** all `it` blocks pass and cover: recipe row insert, version row
  insert (including `tds` and coffee variety), taste notes (present and absent),
  equipment, additional preparations, version photos, and return shape

#### Scenario: service-level test exists and passes

- **WHEN** `make test-specific filter=apps/api/src/modules/recipe/service.create.test.ts` is run
- **THEN** it asserts `service.createRecipe` returns an object with
  `author.id === authorId`, `versions[0].versionNumber === 1`,
  `currentVersionId === versions[0].id`, and the submitted `tds` and coffee variety

#### Scenario: HTTP test exists and passes

- **WHEN** `make test-specific filter=apps/api/src/modules/recipe/index.test.ts`
  is run
- **THEN** the `POST /api/v1/recipes` test asserts `201`, `body.success === true`,
  `body.data.author.id`, `body.data.versions[0].tasteNotes` (array),
  `body.data.versions[0].tds`, and
  `body.data.currentVersionId === body.data.versions[0].id`

#### Scenario: tests clean up after themselves

- **WHEN** any of the three test files' `afterEach` is inspected
- **THEN** it deletes created rows child-first (`recipeTasteNotes` →
  `recipeEquipment` → `recipeAdditionalPreparations` → `recipeVersionPhotos`
  → `recipeVersions` → `recipes` → `users`) using `db.delete(...).where(eq(...) | inArray(...))`

## ADDED Requirements

### Requirement: Recipe update payload distinguishes absent, null and empty values
`RecipeUpdateSchema` SHALL be built from an update object schema that injects no default values except `bumpVersion: false`, and the update path SHALL treat an absent key as "keep the stored value", `null` as "clear the stored value", and an empty array as "remove all related rows".

`RecipeUpdateSchema` SHALL NOT be derived with `.partial()` from a schema that has `.default()`
(Zod 4 keeps defaults through `.optional()`/`.partial()`), following the precedent of
`UserPreferencesPatchSchema`. Rules:

- Nullable on update (`null` clears): `productName`, `coffeeBrand`, `coffeeProcessing`,
  `vendorId`, `roastDate`, `packageOpenDate`, `grindDate`, `brewerDetails`, `grinder`,
  `grindSize`, `groundWeightGrams`, `extractionTimeSeconds`, `extractionVolumeMl`,
  `temperatureCelsius`, `tds`, `preInfusionTimeSeconds`, `beanId`, `coffeeVarietyId`,
  `personalNotes`, `rating`, `emojiTag`.
- Not nullable (`null` is a 400): `title`, `visibility`, `brewMethod`, `drinkType`,
  `preparationNotes`, `isFavourite`, `brewDate`.
- Relations (`tasteNoteIds`, `equipmentIds`, `additionalPreparations`): absent keeps, `[]` clears,
  a non-empty array replaces; `null` is a 400. `tasteNoteIntensities` is accepted only together
  with `tasteNoteIds`; keys not listed in `tasteNoteIds` are ignored; ids without an intensity get
  their previous intensity when kept, else `1`.
- `brewRatio` and `flowRate` are derived server-side and SHALL be removed from the create and update
  input schemas (unknown keys are stripped, so existing clients keep working).
- `setupId` on update fills `grinder`/`brewerDetails` from the caller's own setup only when those keys
  are absent from the payload, as on create.
- Empty brewer notes after `sanitizeText` SHALL be stored as `NULL`.

#### Scenario: Title-only PATCH keeps the recipe public (regression)
- **WHEN** the author of a `public` recipe sends `PATCH /api/v1/recipes/:id` with `{ "title": "New" }`
- **THEN** the recipe's `visibility` is still `public`

#### Scenario: Bump without isFavourite keeps it
- **WHEN** the current version has `isFavourite: true` and the author bumps with a payload that omits `isFavourite`
- **THEN** the new version has `isFavourite: true`

#### Scenario: null clears a field
- **WHEN** the author sends `{ "grinder": null, "tds": null }`
- **THEN** the current version's `grinder` and `tds` are `NULL`

#### Scenario: Empty array clears taste notes
- **WHEN** the author sends `{ "tasteNoteIds": [] }`
- **THEN** the affected version has no `recipe_taste_note` rows

#### Scenario: null on a required field is rejected
- **WHEN** the author sends `{ "title": null }` or `{ "brewMethod": null }`
- **THEN** the response is 400 `VALIDATION_ERROR` and nothing is written

### Requirement: An update never resets omitted visibility or favourite state
A `PATCH /api/v1/recipes/:id` that omits `visibility` SHALL keep the recipe's stored `visibility`, and a `PATCH` that omits `isFavourite` SHALL keep the current version's `isFavourite` on amend and carry it into the new version on bump, because `RecipeUpdateSchema` SHALL inject no default for either key.

This is the audit-missed data-loss bug confirmed on zod 4.6.7: `RecipeUpdateSchema` is today
`RecipeCreateObjectSchema.partial().extend(...)` (`packages/shared/src/schemas/recipe.ts:121`), and
Zod 4 keeps `.default()` through `.partial()`, so `visibility: VisibilityEnum.default('draft')`
(`:26`) and `isFavourite: z.boolean().default(false)` (`:47`) are injected into every parsed PATCH.
The service's `data.visibility ?? recipe.visibility` (`apps/api/src/modules/recipe/service.ts:349,357`)
and `data.isFavourite ?? latestVersion.isFavourite` (`:325`) then never fall back, so a title-only
edit unpublishes a public recipe and a bump clears the favourite flag. After the fix:

- `RecipeUpdateSchema` SHALL be built from `RecipeUpdateObjectSchema`, declared field by field with
  no `.default()` on any field; the only default in the update schema SHALL be
  `bumpVersion: z.boolean().default(false)`.
- `RecipeUpdateSchema.parse({})` SHALL return exactly `{ bumpVersion: false }`, and a shared unit
  test SHALL assert this so any future `.default()` on an update field fails CI.
- The service SHALL decide "provided" by key presence in the parsed payload (`'visibility' in data`
  or `data.visibility !== undefined`), never by comparing against a schema default.
- `updateRecipe` keeps its current side effects unchanged (it sends no follower notification today;
  this requirement adds none).

#### Scenario: Parsing a title-only payload injects no defaults (regression)
- **WHEN** `RecipeUpdateSchema.parse({ title: 'x' })` is evaluated in `packages/shared/src/schemas/recipe.test.ts`
- **THEN** the result deep-equals `{ title: 'x', bumpVersion: false }`
- **AND** `'visibility' in result` and `'isFavourite' in result` are both `false`

#### Scenario: Empty payload parses to the bump flag only (drift guard)
- **WHEN** `RecipeUpdateSchema.parse({})` is evaluated
- **THEN** `Object.keys(result)` equals `['bumpVersion']`

#### Scenario: Title-only amend keeps a public recipe public
- **WHEN** the author of a `public` recipe sends `PATCH /api/v1/recipes/:id` with `{ "title": "New" }` and `bumpVersion` absent
- **THEN** `GET /api/v1/recipes/:slug` returns `visibility: 'public'` and the recipe is still returned by `GET /api/v1/recipes`

#### Scenario: Amend without isFavourite keeps it
- **WHEN** the current version has `isFavourite: true` and the author sends `{ "grindSize": "medium" }` with `bumpVersion: false`
- **THEN** the current version still has `isFavourite: true`

#### Scenario: Bump preserves isFavourite and visibility
- **WHEN** a `public` recipe's current version has `isFavourite: true` and the author sends `{ "grindSize": "medium", "bumpVersion": true }`
- **THEN** the new current version has `isFavourite: true` and the recipe's `visibility` is still `public`

#### Scenario: Explicit values still apply
- **WHEN** the author sends `{ "visibility": "private", "isFavourite": false }`
- **THEN** the recipe's `visibility` is `private` and the affected version's `isFavourite` is `false`

### Requirement: Edits without a version bump amend the current version
When `bumpVersion` is false, `PATCH /api/v1/recipes/:id` SHALL persist every provided recipe-level and version-level field to the recipe and to its current version in a single database transaction, without creating a new version.

Provided relations SHALL replace the current version's rows (delete then insert inside the same
transaction); absent relations and version photos SHALL be left untouched. `brewRatio` and
`flowRate` SHALL be recomputed from the merged measurements. `brewDate` SHALL change only when
provided. Versions other than the current one SHALL never be modified. `recipes.updatedAt` SHALL be
set to the current time. Any validation failure SHALL leave the recipe and every version unchanged.

#### Scenario: Grind size edit is saved (regression)
- **WHEN** the author changes `grindSize` from "fine" to "medium" with `bumpVersion: false`
- **THEN** `GET /api/v1/recipes/:slug` shows `currentVersion.grindSize === 'medium'`
- **AND** `versionCount` is unchanged

#### Scenario: Equipment is replaced in place
- **WHEN** the author sends `{ "equipmentIds": [E2] }` with `bumpVersion: false` on a version linked to `E1`
- **THEN** the current version is linked to `E2` only

#### Scenario: Earlier versions stay immutable
- **WHEN** a recipe has versions 1 and 2 and the author amends with `bumpVersion: false`
- **THEN** version 1's row and relations are byte-identical to before

#### Scenario: Failed amend writes nothing
- **WHEN** an amend payload fails equipment compatibility (422) or cross-field validation (400)
- **THEN** the recipe row and the current version, including its relations, are unchanged

### Requirement: Version bumps create a complete new version atomically
When `bumpVersion` is true, `PATCH /api/v1/recipes/:id` SHALL create exactly one new version in a single database transaction, carrying forward every version-level value and relation of the current version except those the payload provides, and SHALL point `recipes.currentVersionId` at it.

Carried forward unless provided: all scalar columns (including `tds`, `coffeeVarietyId`,
`coffeeVarietyName`, `beanId`, `vendorId`, `preInfusionTimeSeconds`, `rating`, `emojiTag`,
`isFavourite`), taste notes with their intensities, equipment, additional preparations (with
`sortOrder`) and version photos. `brewDate` SHALL be the provided value or the current time. The new
`versionNumber` SHALL be one more than the highest existing version number for the recipe,
computed inside the transaction after locking the recipe row with Drizzle's `.for('update')`.
Title sanitization, cross-field validation, reference validation and equipment compatibility on the
merged values SHALL all run before the first write. The recipe title and visibility updates and
`recipes.updatedAt` SHALL be written in the same transaction.

#### Scenario: Bump keeps relations and scalars (regression)
- **WHEN** the current version has two taste notes (intensities 3 and 2), one equipment item, one additional preparation, one photo, `tds` "1.35" and a coffee variety, and the author bumps with only `{ "grindSize": "medium" }`
- **THEN** the new current version has the same two taste notes with intensities 3 and 2, the same equipment, preparation and photo, `tds` "1.35", the same coffee variety, and `grindSize` "medium"

#### Scenario: Bump replaces taste notes when provided
- **WHEN** the author bumps with `{ "tasteNoteIds": [T3], "tasteNoteIntensities": { "T3": 2 } }`
- **THEN** the new version has only `T3` at intensity 2 and the previous version still has its original taste notes

#### Scenario: Recipe stays in relation listings after a bump
- **WHEN** a recipe linked to equipment E, taste note T and coffee variety V is bumped without changing them
- **THEN** it is still returned by `?equipmentId=E`, `?tasteNoteIds=T`, `?coffeeVarietyId=V` and the `/coffee-varieties/V` recipes list

#### Scenario: Invalid title leaves no orphan version (regression)
- **WHEN** the author bumps with a title that is empty after sanitization (for example `"<b></b>"`)
- **THEN** the response is 400 `VALIDATION_ERROR` and the recipe's version count is unchanged

#### Scenario: Concurrent bumps do not collide
- **WHEN** two bump requests for the same recipe run concurrently
- **THEN** both succeed with consecutive version numbers and neither returns 500

### Requirement: TDS is persisted on every write path
The system SHALL persist `tds` on recipe create, amend, bump and fork, storing it in the `recipe_version.tds` decimal(4,2) column and returning it as a decimal string.

The service SHALL convert the numeric input with `String(value)` and let Postgres round to two
decimals; the Drizzle column stays in its default string mode so the wire type (`string | null`)
does not change.

#### Scenario: TDS round-trips on create
- **WHEN** a recipe is created with `tds: 1.35`
- **THEN** `GET /api/v1/recipes/:slug` returns `currentVersion.tds === '1.35'`

#### Scenario: TDS is rounded to two decimals
- **WHEN** a recipe is created with `tds: 1.355`
- **THEN** the stored and returned value is `'1.36'`

#### Scenario: TDS survives bump and fork
- **WHEN** a recipe with `tds` "1.40" is bumped without `tds` in the payload and then forked
- **THEN** both the new version and the fork's first version have `tds === '1.40'`

### Requirement: Coffee variety is linkable and persisted
The create and update payloads SHALL accept an optional `coffeeVarietyId`, and the system SHALL persist it together with a server-resolved `coffeeVarietyName` on create, amend, bump and fork.

The id SHALL reference an existing, non-soft-deleted `coffee_variety` row, otherwise the request
SHALL fail with 400 `VALIDATION_ERROR` (field `coffeeVarietyId`) before any write.
`coffeeVarietyName` SHALL always be copied from the variety row and SHALL NOT be accepted from
clients. `null` on update SHALL clear both columns.

#### Scenario: Linked recipe appears on the variety page
- **WHEN** a public recipe is created with `coffeeVarietyId: V`
- **THEN** it appears in `GET /api/v1/coffee-varieties/V/recipes` and in `GET /api/v1/recipes?coffeeVarietyId=V`
- **AND** its current version has `coffeeVarietyName` equal to variety V's name

#### Scenario: Unknown variety is rejected
- **WHEN** a create or update payload carries a `coffeeVarietyId` that does not exist or is soft-deleted
- **THEN** the response is 400 `VALIDATION_ERROR` with a `coffeeVarietyId` detail and nothing is written

#### Scenario: Variety can be cleared
- **WHEN** the author sends `{ "coffeeVarietyId": null }`
- **THEN** the affected version has `coffeeVarietyId` and `coffeeVarietyName` both `NULL`

### Requirement: Update validation matches create validation
`PATCH /api/v1/recipes/:id` SHALL enforce the same cross-field rules as `POST /api/v1/recipes` both on the payload and on the merged result of the payload over the stored current version.

The five rules (grind date not before roast date, package-open date not before roast date, grind
date not before package-open date, pre-infusion shorter than extraction, extraction time required
with pre-infusion) SHALL be defined once as an exported pure function in
`packages/shared/src/schemas/recipe.ts`, used by the `RecipeCreateSchema` and `RecipeUpdateSchema`
refinements and by the service for the merged check. Violations SHALL return 400 `VALIDATION_ERROR`
with the same `field`/`message` details as create.

#### Scenario: Payload-level violation
- **WHEN** a PATCH payload has `roastDate: "2026-11-10"` and `grindDate: "2026-11-01"`
- **THEN** the response is 400 with a `grindDate` detail

#### Scenario: Merged violation
- **WHEN** the stored roast date is 2026-11-10 and a PATCH payload sets only `grindDate: "2026-11-01"`
- **THEN** the response is 400 with a `grindDate` detail and nothing is written

#### Scenario: Clearing extraction time while pre-infusion is stored
- **WHEN** the current version has `preInfusionTimeSeconds: 5` and the payload sends `extractionTimeSeconds: null`
- **THEN** the response is 400 with a `preInfusionTimeSeconds` detail

### Requirement: Referenced records are validated before writing
Recipe create, amend and bump SHALL reject unknown or inaccessible referenced ids with 400 `VALIDATION_ERROR` and per-field details before any write, instead of failing on a foreign-key violation.

Checks (all excluding soft-deleted rows): every `tasteNoteIds` entry exists; every `equipmentIds`
entry exists; `vendorId` exists; `coffeeVarietyId` exists; a newly set `beanId` exists and belongs
to the recipe author. A `beanId` carried forward unchanged (for example from a fork) is not
re-checked. The lookups SHALL live in `recipe/model.ts`.

#### Scenario: Unknown taste note
- **WHEN** `POST /api/v1/recipes` carries a random UUID in `tasteNoteIds`
- **THEN** the response is 400 with a `tasteNoteIds` detail and no recipe row is created

#### Scenario: Another user's bean
- **WHEN** an author sets `beanId` to a bean owned by a different user
- **THEN** the response is 400 with a `beanId` detail

### Requirement: Recipe payloads reject duplicate relation ids
The shared recipe create and update schemas SHALL reject an array of relation ids that contains the same id twice, with 400 `VALIDATION_ERROR` and a field detail, before any write.

The rule applies to `tasteNoteIds` and `equipmentIds` in `packages/shared/src/schemas/recipe.ts`
(create and update; the recipe payload has no photo id array), through one refine on the shared
array schema:
`.refine((ids) => new Set(ids).size === ids.length, { message: 'Duplicate ids are not allowed' })`.
Without it, a duplicate violates `recipe_taste_note_recipe_version_id_taste_note_id_unique` or
`recipe_equipment_recipe_version_id_equipment_id_unique`, which the global handler can only answer
with `409 CONFLICT` (a `500` before wave 6). The `tasteNoteIntensities` keys follow the de-duplicated
`tasteNoteIds`, and merge keeps its own de-duplication.

#### Scenario: Duplicate taste note id is rejected
- **WHEN** `POST /api/v1/recipes` sends `tasteNoteIds: [a, a]`
- **THEN** the response is `400` `VALIDATION_ERROR` with a `tasteNoteIds` detail and no recipe row is written

#### Scenario: Duplicate equipment id on update is rejected
- **WHEN** `PATCH /api/v1/recipes/:id` sends `equipmentIds: [e, e]`
- **THEN** the response is `400` `VALIDATION_ERROR` and the current version is unchanged

### Requirement: Recipe PATCH route is gated, mapped and documented
`PATCH /api/v1/recipes/:id` SHALL require a verified email like `POST /api/v1/recipes`, SHALL map every expected service error to a documented status, and SHALL carry complete OpenAPI metadata.

Status mapping: 400 `VALIDATION_ERROR` (Zod, cross-field, reference, empty title; with details), 401
`UNAUTHORIZED`, 403 `EMAIL_NOT_VERIFIED` or `FORBIDDEN` (not the author), 404 `NOT_FOUND`, 409
`CONFLICT`, 422 equipment incompatibility. No expected failure SHALL produce 500. `describeRoute`
SHALL include `tags: ['Recipes']`, `summary`, `description` (explaining amend versus bump and
absent/null/[] semantics), `security`, the `id` parameter, `requestBody:
jsonRequestBody(RecipeUpdateSchema)`, `200` as `resolver(successEnvelope(RecipeDetailOutputSchema))`
and each error status as `resolver(ErrorEnvelopeSchema)`. `zValidator('json', RecipeUpdateSchema,
zodValidationHook)` remains the validator.

#### Scenario: Unverified author cannot edit
- **WHEN** an author whose email is not verified sends a PATCH
- **THEN** the response is 403 `EMAIL_NOT_VERIFIED` and nothing is written

#### Scenario: Empty title is a 400, not a 500 (regression)
- **WHEN** the author sends `{ "title": "<i></i>" }`
- **THEN** the response is 400 `VALIDATION_ERROR`

#### Scenario: OpenAPI documents the body
- **WHEN** `/api/v1/openapi.json` is fetched
- **THEN** `PATCH /api/v1/recipes/{id}` has a `requestBody` and a 200 schema referencing the recipe detail envelope

### Requirement: Fork copies every version-level value
`forkRecipe` SHALL copy every version-level value of the source's current version into the fork's first version, including `tds`, `coffeeVarietyId` and `coffeeVarietyName`, together with taste notes and intensities, equipment, additional preparations and version photos.

The fork SHALL reset `rating` (null) and `isFavourite` (false), because those are the source
author's personal assessments, and SHALL NOT copy any user's private notes. Copying SHALL use the
shared version-column mapping.

#### Scenario: Fork keeps tds and variety
- **WHEN** user B forks a public recipe whose current version has `tds` "1.30" and variety V
- **THEN** the fork's first version has `tds === '1.30'`, `coffeeVarietyId === V`, the variety's name, and `rating === null`

### Requirement: Version-write paths share one column mapping
`apps/api/src/modules/recipe/model.ts` SHALL build `recipe_version` insert and update values for create, amend, bump and fork from one shared column mapping, and a test SHALL fail when a `recipe_version` column is not handled by that mapping.

The drift guard SHALL compare the mapping's keys with `getTableColumns(recipeVersions)` (minus
`id`, `recipeId`, `versionNumber`, `createdAt`) in `model.test.ts`.

#### Scenario: New column without mapping fails the test
- **WHEN** a column is added to `recipeVersions` in `schema.ts` without updating the mapping
- **THEN** the drift-guard test in `model.test.ts` fails and names the column

### Requirement: Recipe write paths are logged without payloads
Every new or changed recipe write function in `recipe/service.ts` and `recipe/model.ts` SHALL emit structured `debug` entry and exit logs and `error` logs with `err`, containing only traceable ids and modes.

Allowed fields: `recipeId`, `authorId`, `versionId`, `versionNumber`, `mode` (`'amend' | 'bump'`),
`relationCounts`. Payloads, brewer notes and private notes SHALL NOT be logged.

#### Scenario: Bump log carries mode and ids only
- **WHEN** a bump runs at `debug` level
- **THEN** the log lines include `{ recipeId, authorId, mode: 'bump', versionNumber }` and no payload fields

### Requirement: Recipe edit page saves honestly
The recipe edit page SHALL describe the version choice truthfully, SHALL send `null` or `[]` for values the user cleared, and SHALL let the author edit every persisted field it pre-fills, including equipment and coffee variety.

The checkbox label SHALL read "Save as a new version" (`recipe.editPage.bumpVersion`) with a hint
that changes with its state: off, "Updates the current version (v{current}) in place"
(`recipe.editPage.bumpHint.off`); on, "Creates version v{next}; v{current} stays unchanged"
(`recipe.editPage.bumpHint.on`). Keys SHALL exist in `en.json` and `tr.json`. Cleared text, number,
date, rating and emoji inputs SHALL be sent as `null`; removing all taste notes or equipment SHALL
send `[]`; fields the page does not render (additional preparations, pre-infusion, vendor, bean,
photos) SHALL be omitted so they are kept. The page SHALL pre-populate and allow changing equipment
(reusing the create page's picker) and coffee variety (a typeahead over
`GET /api/v1/coffee-varieties/search`). API validation errors SHALL be shown inline, and the page
SHALL navigate away only on success. The page SHALL follow the web-data-loading capability (route
loader and action).

#### Scenario: Cleared grinder is saved without bumping (regression)
- **WHEN** the author clears the grinder input and saves with the checkbox off
- **THEN** the request carries `"grinder": null` and the recipe page shows no grinder

#### Scenario: Hint reflects the choice
- **WHEN** the current version is 3 and the author ticks the checkbox
- **THEN** the hint reads that version 4 will be created and version 3 stays unchanged

#### Scenario: Removing all taste notes clears them
- **WHEN** the author removes every taste note and saves
- **THEN** the request carries `"tasteNoteIds": []` and the recipe page shows no taste notes

#### Scenario: Author changes the coffee variety
- **WHEN** the author picks variety "Gesha" in the edit form and saves
- **THEN** the recipe detail page shows "Gesha" linked to `/coffee-varieties/<id>`

### Requirement: Recipe create and detail pages expose bean and coffee variety links
The recipe create page SHALL send `beanId` when it was opened from a bean (`?beanId=`) and SHALL offer a coffee-variety typeahead, and the recipe detail page SHALL display the current version's coffee variety name linked to its variety page when set.

#### Scenario: Recipe created from a bean keeps the link (regression)
- **WHEN** a user opens `/recipes/new?beanId=B` for their own bean B and submits
- **THEN** the created version has `beanId === B`

#### Scenario: Detail page shows the variety
- **WHEN** a recipe's current version has `coffeeVarietyName` "Pink Bourbon"
- **THEN** the detail page shows "Pink Bourbon" linking to `/coffee-varieties/<coffeeVarietyId>`

### Requirement: Every recipe data-loss path has a regression test
Each data-loss path fixed by this change SHALL have a Vitest regression test that fails on the pre-change code and passes afterwards.

Required tests (service or HTTP level against `brewform_test`): non-bump edit persists version
fields; bump keeps taste notes with intensities, equipment, preparations, photos, `tds` and variety;
bump replaces relations when provided; title-only PATCH keeps visibility; amend and bump keep
`isFavourite`; `RecipeUpdateSchema.parse({ title: 'x' })` has no `visibility` or `isFavourite` key
and `RecipeUpdateSchema.parse({})` has only `bumpVersion` (shared schema test in
`packages/shared/src/schemas/recipe.test.ts`); `null` clears and `[]` clears; `tds` persists on
create, amend, bump and fork; coffee variety persists on create, amend, bump and fork; empty-title
bump leaves no orphan version; concurrent bumps both succeed; merged cross-field validation
rejects; the create-from-bean page sends `beanId`; the edit page sends `null`/`[]` for cleared
inputs (component test in `RecipeEditPage.test.tsx`). The obsolete assertions in `service.test.ts`
(`saveNotes`, bump/non-bump expectations) SHALL be rewritten to the new behaviour, and the
`index.test.ts` `POST /:id/notes` block SHALL be replaced by the removal test required by the
`recipe-personal-notes` capability ("The legacy notes POST endpoint is removed").

#### Scenario: Regression suite passes
- **WHEN** `make test-api`, `make test-shared` and `make test-web` are run
- **THEN** all the listed regression tests exist and pass
