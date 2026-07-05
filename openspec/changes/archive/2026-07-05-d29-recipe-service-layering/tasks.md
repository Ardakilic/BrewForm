## 1. Add `createRecipeWithRelations` to the recipe model layer

- [x] 1.1 Open `apps/api/src/modules/recipe/model.ts`. Immediately after the
  `forkRecipe` function (which ends around line 475), add an exported
  `CreateRecipeWithRelationsInput` interface. It must accept every field the
  transaction body at `service.ts:209-291` consumes, pre-resolved by the
  service:

  ```ts
  /**
   * Input for {@link createRecipeWithRelations}. Carries the pre-resolved
   * recipe + first-version fields and the child-relation arrays. The
   * service is responsible for slug generation, sanitization, setup
   * inheritance, and derived-metric computation before calling the helper.
   */
  export interface CreateRecipeWithRelationsInput {
    // recipe-level
    authorId: string;
    slug: string;
    title: string;
    visibility: Visibility;
    // version-level (exhaustive — mirrors service.ts:218-247)
    productName?: string;
    coffeeBrand?: string;
    coffeeProcessing?: string;
    vendorId?: string;
    roastDate: Date | null;
    packageOpenDate: Date | null;
    grindDate: Date | null;
    brewDate: Date;
    brewMethod: BrewMethod;
    drinkType: DrinkType;
    brewerDetails: string | null | undefined;
    grinder: string | null | undefined;
    grindSize?: string;
    groundWeightGrams?: number;
    extractionTimeSeconds?: number;
    extractionVolumeMl?: number;
    temperatureCelsius?: number;
    brewRatio: number | null;
    flowRate: number | null;
    personalNotes: string;
    preparationNotes: string;
    isFavourite: boolean;
    rating?: number;
    emojiTag?: string;
    preInfusionTimeSeconds: number | null;
    beanId: string | null;
    // child relations
    tasteNoteIds?: string[];
    tasteNoteIntensities?: Record<string, number>;
    equipmentIds?: string[];
    additionalPreparations?: Array<{
      name: string;
      type: string;
      inputAmount: string;
      preparationType: string;
    }>;
    photoIds?: string[];
  }
  ```

  Note: `tds` is intentionally **absent** — the current transaction does not
  write it (pre-existing bug; track separately). `coffeeVarietyId`/
  `coffeeVarietyName` are intentionally absent (not on the wire schema).

- [x] 1.2 Immediately below the interface, add the
  `createRecipeWithRelations` function with a full JSDoc matching the
  `forkRecipe` house style. Move the transaction body verbatim from
  `service.ts:209-291`. After the transaction returns `r`, call
  `findById(r.id)` and return the result (the rich relational shape). Do
  **not** reassemble relations inline (avoid `forkRecipe`'s
  `{ ...newRecipe, versions: [{ ...newVersion, tasteNotes, ... }] }` pattern —
  it omits `author`/`photos`/`forkedFrom`). Do **not** shadow `eq` in
  `.map(...)` callbacks — use `id` or `er` as the parameter name. The
  skeleton:

  ```ts
  /**
   * Create a recipe with its first version and all child relations in a
   * single transaction, then return the full relational row.
   *
   * Inserts the recipe row (with `currentVersionId = null`), the first
   * version row (versionNumber 1), and optionally taste notes, equipment,
   * additional preparations, and version photos. Finally updates
   * `recipes.currentVersionId` and reloads via {@link findById} so the
   * returned shape matches every other read path.
   *
   * @param input - Pre-resolved recipe + version + relation fields.
   * @returns The inserted recipe with author, versions (with nested
   *          relations), photos, and forkedFrom — identical to
   *          {@link findById}'s shape.
   */
  export async function createRecipeWithRelations(
    input: CreateRecipeWithRelationsInput,
  ) {
    const { id } = await db.transaction(async (tx) => {
      const [r] = await tx.insert(recipes).values({
        slug: input.slug,
        title: input.title,
        authorId: input.authorId,
        visibility: input.visibility,
        currentVersionId: null,
      }).returning();

      const [version] = await tx.insert(recipeVersions).values({
        recipeId: r.id,
        versionNumber: 1,
        productName: input.productName,
        coffeeBrand: input.coffeeBrand,
        coffeeProcessing: input.coffeeProcessing,
        vendorId: input.vendorId,
        roastDate: input.roastDate,
        packageOpenDate: input.packageOpenDate,
        grindDate: input.grindDate,
        brewDate: input.brewDate,
        brewMethod: input.brewMethod,
        drinkType: input.drinkType,
        brewerDetails: input.brewerDetails,
        grinder: input.grinder,
        grindSize: input.grindSize,
        groundWeightGrams: input.groundWeightGrams,
        extractionTimeSeconds: input.extractionTimeSeconds,
        extractionVolumeMl: input.extractionVolumeMl,
        temperatureCelsius: input.temperatureCelsius,
        brewRatio: input.brewRatio,
        flowRate: input.flowRate,
        personalNotes: input.personalNotes,
        preparationNotes: input.preparationNotes,
        isFavourite: input.isFavourite,
        rating: input.rating,
        emojiTag: input.emojiTag,
        preInfusionTimeSeconds: input.preInfusionTimeSeconds,
        beanId: input.beanId,
      }).returning();

      if (input.tasteNoteIds?.length) {
        await tx.insert(recipeTasteNotes).values(
          input.tasteNoteIds.map((id) => ({
            recipeVersionId: version.id,
            tasteNoteId: id,
            intensity: input.tasteNoteIntensities?.[id] ?? 1,
          })),
        );
      }
      if (input.equipmentIds?.length) {
        await tx.insert(recipeEquipment).values(
          input.equipmentIds.map((id) => ({
            recipeVersionId: version.id,
            equipmentId: id,
          })),
        );
      }
      if (input.additionalPreparations?.length) {
        await tx.insert(recipeAdditionalPreparations).values(
          input.additionalPreparations.map((p, i) => ({
            recipeVersionId: version.id,
            name: p.name,
            type: p.type,
            inputAmount: p.inputAmount,
            preparationType: p.preparationType,
            sortOrder: i,
          })),
        );
      }
      if (input.photoIds?.length) {
        await tx.insert(recipeVersionPhotos).values(
          input.photoIds.map((photoId, i) => ({
            recipeVersionId: version.id,
            photoId,
            sortOrder: i,
          })),
        );
      }

      await tx.update(recipes).set({ currentVersionId: version.id })
        .where(eq(recipes.id, r.id));

      return r;
    });
    return findById(id);
  }
  ```

  Verify the field list against `service.ts:218-247` line-by-line. No new
  imports are needed — `model.ts` already imports `db`, all six schema
  tables, `eq`, and `sql`.

- [x] 1.3 Run `make check-api` — must pass with zero new type errors.

## 2. Rewire `service.ts:createRecipe` to call the helper

- [x] 2.1 Open `apps/api/src/modules/recipe/service.ts`. Locate
  `createRecipe` (signature at line 175). Delete the `TODO(D29)` comment
  (lines 203-208) and the entire `db.transaction(...)` block (lines 209-291).
  Replace with a single call:

  ```ts
  const finalRecipe = await model.createRecipeWithRelations({
    authorId,
    slug,
    title: safeTitle,
    visibility: data.visibility || 'draft',
    productName: data.productName,
    coffeeBrand: data.coffeeBrand,
    coffeeProcessing: data.coffeeProcessing,
    vendorId: data.vendorId,
    roastDate: data.roastDate ? new Date(data.roastDate) : null,
    packageOpenDate: data.packageOpenDate ? new Date(data.packageOpenDate) : null,
    grindDate: data.grindDate ? new Date(data.grindDate) : null,
    brewDate: data.brewDate ? new Date(data.brewDate) : new Date(),
    brewMethod: data.brewMethod,
    drinkType: data.drinkType,
    brewerDetails,
    grinder,
    grindSize: data.grindSize,
    groundWeightGrams: data.groundWeightGrams,
    extractionTimeSeconds: data.extractionTimeSeconds,
    extractionVolumeMl: data.extractionVolumeMl,
    temperatureCelsius: data.temperatureCelsius,
    brewRatio,
    flowRate,
    personalNotes: sanitizeText(data.personalNotes),
    preparationNotes: sanitizeText(data.preparationNotes),
    isFavourite: data.isFavourite || false,
    rating: data.rating,
    emojiTag: data.emojiTag,
    preInfusionTimeSeconds: data.preInfusionTimeSeconds ?? null,
    beanId: data.beanId ?? null,
    tasteNoteIds: data.tasteNoteIds,
    tasteNoteIntensities: data.tasteNoteIntensities,
    equipmentIds: data.equipmentIds,
    additionalPreparations: data.additionalPreparations,
    photoIds: data.photoIds,
  });
  ```

  Note: the date casts (`new Date(data.X)`) and `sanitizeText(...)` calls stay
  in the service — they are business logic, not data access. `brewRatio`/
  `flowRate` are the service-computed values. `brewerDetails`/`grinder` are
  the post-setup-inheritance values.

- [x] 2.2 Delete the now-redundant
  `const finalRecipe = await model.findById(recipe.id);` (line 293). The
  helper returns the rich shape directly.
- [x] 2.3 Confirm the post-transaction side effects (lines 295-308:
  `notifyFollowersOfNewRecipe` IIFE when `finalRecipe?.visibility === 'public'`,
  `evaluateBadges` fire-and-forget, `logger.debug({ authorId }, 'createRecipe completed')`)
  are unchanged and still reference `finalRecipe`.
- [x] 2.4 Run `make check-api` — must pass.

## 3. Delete the offending imports from `service.ts`

- [x] 3.1 Delete these three lines from `service.ts`:
  - line 15: `import { db } from '@brewform/db';`
  - lines 16-23: the `import { recipeAdditionalPreparations, recipeEquipment, recipes, recipeTasteNotes, recipeVersionPhotos, recipeVersions } from '@brewform/db/schema';` block
  - line 24: `import { eq } from 'drizzle-orm';`

  Keep `import * as model from './model.ts';` (line 14) and all pure-function
  imports (`sanitizeText`, `computeBrewRatio`, `computeFlowRate`,
  `generateSlug`, `ensureUniqueSlug`, `decodeCursor`,
  `notifyFollowersOfNewRecipe`, `notifyRecipeLiked`, `evaluateBadges`,
  `createLogger`, the shared schemas, `BrewMethod` type).

- [x] 3.2 Run `grep -n 'drizzle-orm\|@brewform/db' apps/api/src/modules/recipe/service.ts`
  — must return **zero** hits (the `@brewform/shared/*` imports are fine; only
  `@brewform/db` and `@brewform/db/schema` must be gone).
- [x] 3.3 Run `make check-api` — must pass with zero type errors. If a type
  error appears, a reference to `db`/`eq`/a schema table was missed somewhere
  in `service.ts` (search for `db.`, `eq(`, or the six table names).

## 4. Fix the file-level docstring

- [x] 4.1 Update the JSDoc at `service.ts:1-11`. Remove the "except for the
  compatibility validation helper" sentence (line 10). The corrected docstring:

  ```ts
  /**
   * Recipe business-logic / service layer.
   *
   * Sits between controllers and the data-access layer ({@link ./model.ts}).
   * Orchestrates multi-step operations (creation, version bumping, forking),
   * enforces business rules (equipment compatibility, visibility checks),
   * and triggers side effects (badge evaluation, follower notifications).
   *
   * All DB access is delegated to `model.ts` — no Drizzle calls from this module.
   */
  ```

- [x] 4.2 (Optional) Add docblocks to the two non-exported helpers that lack
  them: `generateUniqueSlug` (line 65) and `validateEquipmentCompatibility`
  (line 134). Single-line `/** ... */` is sufficient.

## 5. Add `RecipeDetailOutputSchema` to the shared package

- [x] 5.1 Open `packages/shared/src/schemas/responses/recipe.ts`. After the
  existing `FeedRecipeOutputSchema` (around line 120), add the schemas needed
  to describe the `findById` rich shape. The exact composition (verify
  against `model.ts:231-250`):

  ```ts
  /** Author projection loaded by `recipe/model.ts findById` — includes `id`. */
  export const RecipeDetailAuthorSchema = z.object({
    id: z.string(),
    username: z.string(),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
  });

  /** Taste-note row joined to its master `tasteNotes` row, as loaded by findById. */
  const RecipeDetailTasteNoteSchema = z.object({
    id: z.string(),
    recipeVersionId: z.string(),
    tasteNoteId: z.string(),
    intensity: z.number().int(),
    tasteNote: TasteNoteOutputSchema,
  });

  /** Equipment row joined to its master `equipment` row, as loaded by findById. */
  const RecipeDetailEquipmentSchema = z.object({
    id: z.string(),
    recipeVersionId: z.string(),
    equipmentId: z.string(),
    equipment: EquipmentOutputSchema,
  });

  /** Additional-preparation row (no nested relation). */
  const RecipeDetailAdditionalPreparationSchema = z.object({
    id: z.string(),
    recipeVersionId: z.string(),
    name: z.string(),
    type: z.string(),
    inputAmount: z.string(),
    preparationType: z.string(),
    sortOrder: z.number().int(),
  });

  /** Partial bean projection loaded by findById (`{ origin, roaster, roastLevel }`). */
  const RecipeDetailBeanMiniSchema = z.object({
    origin: z.string().nullable(),
    roaster: z.string().nullable(),
    roastLevel: z.string().nullable(),
  }).nullable();

  /** Version row enriched with all nested relations, as loaded by findById. */
  export const RecipeDetailVersionSchema = RecipeVersionRowSchema.omit({
    versionPhotos: true,
  }).extend({
    tasteNotes: z.array(RecipeDetailTasteNoteSchema),
    equipment: z.array(RecipeDetailEquipmentSchema),
    additionalPreparations: z.array(RecipeDetailAdditionalPreparationSchema),
    versionPhotos: z.array(RecipeVersionPhotoSchema), // promote the private export if needed
    bean: RecipeDetailBeanMiniSchema,
  });

  /** Forked-from projection loaded by findById (`{ id, slug, title }`). */
  const RecipeForkedFromMiniSchema = z.object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
  }).nullable();

  /**
   * Full recipe detail as returned by `recipe/model.ts findById` /
   * `recipe/service.ts createRecipe` (the POST /api/v1/recipes 201 body, wrapped
   * in successEnvelope). Mirrors the `db.query.recipes.findFirst({ with: {...} })`
   * shape at model.ts:231-250.
   */
  export const RecipeDetailOutputSchema = RecipeRowSchema.extend({
    author: RecipeDetailAuthorSchema,
    versions: z.array(RecipeDetailVersionSchema),
    photos: z.array(PhotoOutputSchema),
    forkedFrom: RecipeForkedFromMiniSchema,
  });
  ```

  Verify each sub-schema against the actual `with:` tree. `RecipeVersionRowSchema`
  already includes `versionPhotos` (as `z.array(RecipeVersionPhotoSchema)`) —
  decide whether to `omit` it and re-add the richer `versionPhotos` with
  `photo: PhotoOutputSchema`, or extend in place. The private
  `RecipeVersionPhotoSchema` (recipe.ts:46-52) may need to be promoted to an
  export or duplicated. Also check whether `PhotoOutputSchema` (photo.ts) and
  `TasteNoteOutputSchema` (taste.ts) and `EquipmentOutputSchema` (equipment.ts)
  match the nested `photo`/`tasteNote`/`equipment` rows `findById` loads.

- [x] 5.2 Add `RecipeDetailOutputSchema` (and any promoted sub-schemas) to
  the barrel at `packages/shared/src/schemas/responses/index.ts` (the
  `recipe.ts` re-export block, around line 28-34).
- [x] 5.3 Add a co-located round-trip unit test in
  `packages/shared/src/schemas/responses/recipe.test.ts` following the
  existing `wire()` convention: one `describe('RecipeDetailOutputSchema')`
  with one `it` that `safeParse`s a representative full payload (recipe row +
  author with `id` + one version with all nested relations + photos[] +
  forkedFrom) and asserts `result.data` deep-equals the wired input. Copy
  the `wire()` helper and representative-row `const`s from the existing
  tests; add a full detail version with nested `tasteNotes[].tasteNote`,
  `equipment[].equipment`, `additionalPreparations`, `versionPhotos[].photo`,
  `bean`.
- [x] 5.4 Register `RecipeDetailOutputSchema` in
  `packages/shared/src/schemas/responses/output-schema-acceptance.pbt.test.ts`
  `cases` array (around line 507-580). Compose a `recipeDetailArb` from the
  existing `recipeRowArb` + a detail-author arb + a detail-version arb
  (extend `recipeVersionArb` with the nested relation arbs) + photos arb +
  forkedFrom arb. Use `numRuns: 100` (the existing default).
- [x] 5.5 Run `make check` and `make test-shared` — both must pass.

## 6. Wire the `createRecipe` route's `describeRoute`

- [x] 6.1 Open `apps/api/src/modules/recipe/index.ts`. Update the imports at
  the top of the file to add (if not already present):

  ```ts
  import { jsonRequestBody } from '../../utils/openapi/index.ts';
  import {
    ErrorEnvelopeSchema,
    RecipeDetailOutputSchema,
    successEnvelope,
  } from '@brewform/shared/schemas';
  ```

  `describeRoute` and `resolver` are already imported from `hono-openapi`
  (line 3). `RecipeCreateSchema` is already imported (line 7-10).

- [x] 6.2 Replace the `createRecipe` route's `describeRoute` (lines 273-281)
  with a complete one modeled on the coffee-variety `POST /` template
  (`apps/api/src/modules/coffee-variety/index.ts:97-134`):

  ```ts
  describeRoute({
    tags: ['Recipes'],
    summary: 'Create a recipe',
    description: 'Creates a recipe with its first version and all child relations.',
    security: [{ bearerAuth: [] }],
    requestBody: jsonRequestBody(RecipeCreateSchema),
    responses: {
      201: {
        description: 'Recipe created',
        content: {
          'application/json': {
            schema: resolver(successEnvelope(RecipeDetailOutputSchema)),
          },
        },
      },
      400: {
        description: 'Validation error',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Forbidden (email not verified or not authorized)',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  ```

- [x] 6.3 Run `make check-api` and
  `make test-specific filter=apps/api/src/routes/openapi.coverage.test.ts` —
  both must pass. (The coverage test already passes for this route; the new
  metadata is additive.)

## 7. Add tests for `createRecipeWithRelations` (model-level)

- [x] 7.1 Create `apps/api/src/modules/recipe/model.create.test.ts`. Start
  with:

  ```ts
  import '../../test-setup.ts';
  import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
  import { expect } from 'jsr:@std/expect';
  import { eq, inArray } from 'drizzle-orm';
  import { db } from '@brewform/db';
  import {
    recipeAdditionalPreparations,
    recipeEquipment,
    recipes,
    recipeTasteNotes,
    recipeVersionPhotos,
    recipeVersions,
    users,
  } from '@brewform/db/schema';
  import * as model from './model.ts';
  ```

- [x] 7.2 Add a local `createUser(prefix)` fixture (inline the pattern from
  `coffee-variety/model.test.ts` / `model.cursor.test.ts` — no shared helper
  exists). Use `crypto.randomUUID()` for the user id.
- [x] 7.3 Add `describe('createRecipeWithRelations', { sanitizeOps: false,
  sanitizeResources: false }, () => { ... })` with `beforeEach` that creates
  a user and `afterEach` that hard-deletes child-first:
  `recipeTasteNotes` → `recipeEquipment` → `recipeAdditionalPreparations` →
  `recipeVersionPhotos` → `recipeVersions` → `recipes` → `users` (use
  `inArray` on the created IDs, or `eq` on the single user ID). The child
  tables cascade on `recipeVersions.id` deletion, but explicit cleanup is the
  house pattern.
- [x] 7.4 Add `it` blocks covering:
  - **recipe row insert**: `slug`, `title`, `authorId`, `visibility` match
    the input; `currentVersionId` is non-null and equals `versions[0].id`;
    `likeCount`/`commentCount`/`forkCount` are `0`; `featured` is `false`.
  - **version row insert**: `versionNumber === 1`; every passed field is
    persisted (`productName`, `brewMethod`, `drinkType`, `brewRatio`,
    `flowRate`, `personalNotes`, `preparationNotes`, `isFavourite`, `rating`,
    `emojiTag`, `preInfusionTimeSeconds`, `beanId`, dates as ISO strings).
  - **taste notes inserted**: when `tasteNoteIds` provided, each row has the
    correct `recipeVersionId`, `tasteNoteId`, and `intensity` (from
    `tasteNoteIntensities`, default `1`). Use a real `tasteNotes` row from
    the seed or create one in `beforeEach`.
  - **taste notes absent**: when `tasteNoteIds` is `undefined` or `[]`, no
    `recipeTasteNotes` rows exist for the version.
  - **equipment inserted**: when `equipmentIds` provided, rows exist. Use a
    real `equipment` row.
  - **additional preparations**: when provided, rows exist with `sortOrder`
    equal to the array index, and `name`/`type`/`inputAmount`/
    `preparationType` match.
  - **`photoIds` branch**: when provided, `recipeVersionPhotos` rows exist
    with `sortOrder` = array index. (This branch is dead on the create route
    today; the test exercises the helper's contract directly.)
  - **return shape**: the returned object has `author`, `versions[0].tasteNotes`
    (with nested `tasteNote`), `versions[0].equipment` (with nested
    `equipment`), `versions[0].additionalPreparations`,
    `versions[0].versionPhotos` (with nested `photo`), `versions[0].bean`,
    `photos`, `forkedFrom` — i.e. matches `model.findById`'s shape.
- [x] 7.5 Run `make check-tests` and
  `make test-specific filter=apps/api/src/modules/recipe/model.create.test.ts`
  — both must pass.

## 8. Add a service-level integration test for `createRecipe`

- [x] 8.1 Either extend `apps/api/src/modules/recipe/service.test.ts` (which
  is currently pure-logic only) or create a new
  `service.create.test.ts`. Use the same `test-setup.ts` + `createUser`
  fixture pattern. Add `describe('createRecipe (integration)', { sanitizeOps:
  false, sanitizeResources: false }, () => { ... })`.
- [x] 8.2 Add an `it` that calls `service.createRecipe(authorId, data)` with
  a minimal valid `RecipeCreateSchema` payload (use `RecipeCreateSchema.parse`
  to build `data`) and asserts the returned object has the rich `findById`
  shape: `author.id === authorId`, `versions.length === 1`,
  `versions[0].versionNumber === 1`, `versions[0].tasteNotes` is an array,
  `versions[0].equipment` is an array, `currentVersionId ===
  versions[0].id`. This is the regression guard — it locks the shape before
  and after the move.
- [x] 8.3 Add cleanup in `afterEach` (delete the created recipe's child rows
  first, then `recipes`, then the user).
- [x] 8.4 Run `make check-tests` and
  `make test-specific filter=apps/api/src/modules/recipe/service.create.test.ts`
  (or `service.test.ts` if extended) — must pass.

## 9. Add an HTTP integration test for `POST /api/v1/recipes`

- [x] 9.1 Extend `apps/api/src/modules/recipe/index_test.ts` (which already
  mounts `recipeRouter` on a stub Hono app via `createTestApp(userId)`). Add
  a new `describe('POST /api/v1/recipes — create', { sanitizeOps: false,
  sanitizeResources: false }, () => { ... })` with `beforeEach`/`afterEach`
  cleanup.
- [x] 9.2 Add an `it` that:
  - creates a user with `isEmailVerified: true` (the route guards on
    `isEmailVerified`),
  - sends `POST /api/v1/recipes` with a valid `RecipeCreateSchema` JSON body
    (include `tasteNoteIds` and `equipmentIds` pointing at seed rows, or
    create them in `beforeEach`),
  - asserts the response status is `201`,
  - asserts `body.success === true`,
  - asserts `body.data.author.id === userId`,
  - asserts `body.data.versions[0].tasteNotes` is a non-empty array with
    nested `tasteNote`,
  - asserts `body.data.versions[0].equipment` is a non-empty array with
    nested `equipment`,
  - asserts `body.data.currentVersionId === body.data.versions[0].id`.
- [x] 9.3 Add cleanup (`afterEach` deletes the created recipe + child rows +
  any seed rows created in `beforeEach`).
- [x] 9.4 Run `make check-tests` and
  `make test-specific filter=apps/api/src/modules/recipe/index_test.ts` —
  must pass.

## 10. Logging

- [x] 10.1 Add entry/exit debug logs to `createRecipeWithRelations` in
  `model.ts`, matching the `forkRecipe` / `createUser` pattern. The module
  already has a `const log = createLogger('recipe.model')` (or equivalent —
  verify; if not present, add one). Add at the top of the function:
  `log.debug({ authorId: input.authorId }, 'createRecipeWithRelations started');`
  and before the `return findById(id);`:
  `log.debug({ authorId: input.authorId, recipeId: id }, 'createRecipeWithRelations completed');`
  Never log the input payload (may contain `personalNotes`); log only
  traceable IDs.
- [x] 10.2 Verify the existing `createRecipe` logs in `service.ts` (lines
  179, 310: `logger.debug({ authorId }, 'createRecipe started'/'completed')`)
  are unchanged.
- [x] 10.3 Run `make lint` — must pass with zero warnings on the modified
  files.

## 11. Format, Lint, Type-Check, Tests

- [x] 11.1 Run `make fmt` — formats all modified files.
- [x] 11.2 Run `make check` — type-checks the import graph (`src/main.ts`).
  Must pass with zero errors.
- [x] 11.3 Run `make check-tests` — type-checks the test files (separate
  target; `make check` does **not** type-check `_test.ts`/`.test.ts` files).
  Must pass with zero errors.
- [x] 11.4 Run `make lint` — zero warnings on `apps/api/src/modules/recipe/`
  and `packages/shared/src/schemas/responses/`.
- [x] 11.5 Run `make test-api` — every test in `apps/api/src/` passes,
  including the new `model.create.test.ts`, the service-level test, the HTTP
  test, the existing recipe tests, and `openapi.coverage.test.ts`.
- [x] 11.6 Run `make test-shared` — the new `RecipeDetailOutputSchema` test
  and the `output-schema-acceptance.pbt.test.ts` pass.
- [x] 11.7 (Optional) `make test-specific filter=apps/api/src/modules/recipe/`
  for a fast recipe-module-only run before the full `make test-api`.

## 12. Final verification

- [x] 12.1 Run `make fmt && make check && make check-tests && make lint && make test-api`
  — all green, zero errors, zero warnings, zero test failures.
- [x] 12.2 Confirm `service.ts` has zero references to `drizzle-orm`,
  `@brewform/db`, or any schema table:
  `grep -n 'drizzle-orm\|@brewform/db' apps/api/src/modules/recipe/service.ts`
  → no output.
- [x] 12.3 Confirm the `TODO(D29)` comment is gone from `service.ts`:
  `grep -n 'TODO(D29)' apps/api/src/modules/recipe/service.ts` → no output.
- [x] 12.4 Confirm `createRecipeWithRelations` is exported from `model.ts`
  and called from `service.ts`:
  `grep -n 'createRecipeWithRelations' apps/api/src/modules/recipe/` →
  matches in `model.ts` (definition) and `service.ts` (call site).
- [x] 12.5 Confirm the `createRecipe` route's `describeRoute` has a
  `requestBody` and `resolver(successEnvelope(RecipeDetailOutputSchema))`:
  read `index.ts` around the `POST /` route and verify.
- [x] 12.6 Confirm the file-level docstring no longer mentions "compatibility
  validation helper": read `service.ts:1-11`.
- [ ] 12.7 (Optional) Manual smoke: start `make dev`, `POST /api/v1/recipes` _(deferred: optional manual smoke test requiring a running server; not a code deliverable — code + automated tests complete. Archived 2026-07-05.)_
  with a valid body, confirm the response shape is unchanged from before
  D29.