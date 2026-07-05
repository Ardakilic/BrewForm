# D29 — Recipe Service Layer Imports `drizzle-orm` Directly

> **Status (2026-07-04): ✅ Done** — `service.ts` has zero `drizzle-orm` imports; `model.createRecipeWithRelations` (:550). Openspec change `d29-recipe-service-layering` is complete — recommend archiving it.

## Severity

**Medium** (architecture / layering violation; no runtime bug)

## Phase

**Phase 1 of 1.** Tracked as a refactor follow-up. The current `createRecipe`
path is annotated with an inline `TODO(D29)` and continues to work; this plan
captures the eventual move into the model layer so the layering rule is
restored.

## Issue Description

`apps/api/src/modules/recipe/service.ts` violates the project's layering rule
that "services import from model files, never from `drizzle-orm` directly"
(AGENTS.md). The violation is concentrated in `createRecipe`:

| Concern                                              | File / line                                          |
| ---------------------------------------------------- | ---------------------------------------------------- |
| `import { eq } from 'drizzle-orm'`                   | `apps/api/src/modules/recipe/service.ts:24`          |
| Direct schema imports (`recipes`, `recipeVersions`, `recipeTasteNotes`, `recipeEquipment`, `recipeAdditionalPreparations`, `recipeVersionPhotos`) | `apps/api/src/modules/recipe/service.ts:16-23` |
| `db.transaction(async (tx) => { ... })` block         | `apps/api/src/modules/recipe/service.ts:202-284`     |
| `tx.update(recipes).set({...}).where(eq(recipes.id, r.id))` | `apps/api/src/modules/recipe/service.ts:281` |

The file-level docstring (`service.ts:1-11`) already states:

> All DB access is delegated to `model.ts` — no Drizzle calls directly
> from this module except for the compatibility validation helper.

The "compatibility validation helper" exception is outdated — that helper
(`checkEquipmentCompatibility`, `service.ts:116-131`) is a pure function and
does **not** touch Drizzle. The real outlier is the `createRecipe` transaction.

## Impact

- **Layering violation**: the service depends on the data-access layer
  directly rather than going through `model.ts`, which is the convention
  every other recipe operation follows (`forkRecipe`, `update`, `createVersion`,
  `toggleLike`, etc. all delegate to model helpers).
- **Reduced encapsulation**: schema table imports leak into the service. Any
  future schema change (column rename, soft-delete column added, default
  change) requires updating the service in addition to the model.
- **Hinders testability**: the service cannot be exercised without a real DB
  transaction shape; the model layer's `forkRecipe` already demonstrates the
  preferred pattern (full transaction encapsulated in the model).
- **Stylistic drift**: `forkRecipe` (`model.ts:333-456`) and `createRecipe`
  (`service.ts:174-305`) both create a recipe + initial version + relations
  in a single transaction but the two implementations live in different
  layers, which makes them hard to compare and easy to drift.

## Affected Files

| File | Lines | Change type |
|------|-------|-------------|
| `apps/api/src/modules/recipe/service.ts` | 16-23 (schema imports), 24 (`drizzle-orm` import), 202-284 (`db.transaction` body) | Remove imports; replace transaction body with single `model.createRecipeWithRelations(...)` call |
| `apps/api/src/modules/recipe/model.ts` | new helper near `createVersion` / `forkRecipe` | Add `createRecipeWithRelations(input)` model helper that owns the entire transaction |
| `apps/api/src/modules/recipe/service.ts` | 286 (`model.findById(recipe.id)` after transaction) | The model helper should return the rich row + relations; service can drop the post-transaction `findById` and the destructured `versions: [version]` shape |

## Fix Approach

1. **Add a model helper** `createRecipeWithRelations(input)` in
   `apps/api/src/modules/recipe/model.ts` next to `forkRecipe` (which is the
   most analogous existing helper — it owns a full multi-table transaction).
   The helper accepts a typed input object (recipe fields + version fields +
   `tasteNoteIds` + `tasteNoteIntensities` + `equipmentIds` +
   `additionalPreparations` + `photoIds`) and returns the inserted recipe row
   with its first version and all child relations — matching the shape
   currently returned by the inline transaction.
2. **Move the transaction body** verbatim from `service.ts:202-284` into the
   new model helper, keeping the existing `db.transaction` and table imports
   entirely inside `model.ts`. The service keeps ownership of the
   business-logic steps that surround the transaction (slug generation,
   setup inheritance, equipment compatibility validation, derived-metric
   computation, post-create notification / badge evaluation) — only the
   `db.transaction` block itself moves.
3. **Delete the now-unused imports** from `service.ts`:
   - `import { db } from '@brewform/db';`
   - `import { recipeAdditionalPreparations, recipeEquipment, recipes, recipeTasteNotes, recipeVersionPhotos, recipeVersions } from '@brewform/db/schema';`
   - `import { eq } from 'drizzle-orm';`
4. **Replace the inline `db.transaction(...)` call** in `service.ts:createRecipe`
   with `const recipe = await model.createRecipeWithRelations({...})`. The
   service's surrounding logic (validation, slug, derived metrics,
   notification, badges) is unchanged.
5. **Update the file-level docstring** at `service.ts:1-11` so the "except
   for the compatibility validation helper" sentence is removed (the helper
   does not touch Drizzle) and the layering rule is restated correctly.
6. **Update or add tests**: the existing service-level tests
   (`apps/api/src/modules/recipe/service_test.ts` if present, otherwise the
   recipe controller integration tests) should continue to pass with no
   observable behavioural change. Add a focused model-level test for
   `createRecipeWithRelations` covering: recipe row insert, version row
   insert, optional taste-note / equipment / additional-preparation /
   version-photo inserts, and `currentVersionId` update.

## Migration Risk

- The transaction body is moved verbatim, so the SQL emitted is identical.
  Behavioural risk is low.
- The model helper must return the same `RecipeWithRelations` shape that the
  inline transaction currently produces (recipe row + `versions: [version]`)
  so the downstream `model.findById(recipe.id)` call can be removed safely.
  Verify by diffing the returned object before and after the move.
- Notification and badge side-effects in the service are **unchanged** —
  they run after the transaction commits, exactly as today.
