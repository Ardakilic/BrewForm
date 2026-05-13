# Spec: add-preparation-notes-field-recipes-markdown

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

Currently recipes only store brewing parameters (dose, yield, time, temp) and personal tasting notes. There is no field to describe the step-by-step preparation method. A user creating an iced latte cannot explain 'pull espresso over ice, then add cold milk' — the recipe is incomplete for anyone trying to reproduce it. This is a real gap reported by the user.

_-- Arda Kilicdagi_

### ambition

1-star: A plain text textarea on create/edit, displayed as raw text on detail/focus pages. 10-star: A rich but safe markdown textarea with a live preview, rendered as beautiful structured HTML (headers, lists, bold, italic) on recipe pages, with a 'copy steps' button and print-friendly formatting. The emotional response: a brewer feels guided and confident, not guessing at steps.

_-- Arda Kilicdagi_

### verification

1) Schema tests: verify preparationNotes accepts valid strings up to 10000 chars. 2) Service tests: verify createRecipe/updateRecipe persist preparationNotes. 3) Seed test: verify seed data populates the field. 4) UI tests: verify textarea appears on create/edit, verify rendered markdown appears on detail/focus pages. 5) Run db-generate + db-migrate to verify migration applies cleanly. 6) Run full test suite (make test). 7) Manually verify both English and Turkish localization. Design quality: check empty state, loading state not needed (static render), long text overflow, and no AI slop patterns.

_-- Arda Kilicdagi_

### scope_boundary

This feature does NOT: (a) add a WYSIWYG editor, (b) support images or tables in markdown, (c) add recipe-step timers or interactive checklists, (d) send notifications about preparation notes, (e) change the existing personalNotes field behavior. Markdown support is limited to: headers (# ## ###), bold, italic, bullet lists, numbered lists, and line breaks. No raw HTML passthrough — all input is escaped.

_-- Arda Kilicdagi_

### reversibility

Yes — making the field mandatory is an irreversible decision for existing API consumers. Old payloads without preparationNotes will be rejected. However, the user confirms the app will be re-deployed from scratch, so this is acceptable.

_-- Arda Kilicdagi_

### user_impact

This is a breaking change. The preparationNotes field is now mandatory on recipe versions. Old API payloads without preparationNotes will fail validation. All 6 seed recipes must include preparationNotes. Existing database rows would fail if not migrated with default values — but the user confirms a fresh deploy.

_-- Arda Kilicdagi_

## Test Strategy (well-engineered)

_To be addressed during execution._

## Performance Considerations (well-engineered)

_To be addressed during execution._

## Observability Plan (well-engineered)

_To be addressed during execution._

## Error Handling (well-engineered)

_To be addressed during execution._

## Security & Threat Model (well-engineered)

_To be addressed during execution._

## Developer Ergonomics (well-engineered)

_To be addressed during execution._

## Design States (empty, loading, error, success) (beautiful-product)

_To be addressed during execution._

## Mobile Layout (beautiful-product)

_To be addressed during execution._

## Interaction Design (beautiful-product)

_To be addressed during execution._

## Accessibility (beautiful-product)

_To be addressed during execution._

## Contributor Guide (open-source)

_To be addressed during execution._

## Public API Surface (open-source)

_To be addressed during execution._

## Out of Scope

- This feature does NOT: (a) add a WYSIWYG editor, (b) support images or tables in markdown, (c) add recipe-step timers or interactive checklists, (d) send notifications about preparation notes, (e) change the existing personalNotes field behavior
- Markdown support is limited to: headers (# ## ###), bold, italic, bullet lists, numbered lists, and line breaks
- No raw HTML passthrough — all input is escaped.

## Tasks

- [x] task-1: Add preparationNotes text column to recipeVersions table in packages/db/src/schema.ts. Files: `packages/db/src/schema.ts`. Make it notNull() per user requirement.\n
- [x] task-2: Generate Drizzle migration for the new column. Files: `packages/db/drizzle/`. Run `make db-generate`.\n
- [x] task-3: Add preparationNotes to shared Zod schemas. Files: `packages/shared/src/schemas/recipe.ts`. Add validation: z.string().min(1).max(10000). Update RecipeCreateObjectSchema and RecipeUpdateSchema.\n
- [x] task-4: Update API recipe service to persist preparationNotes. Files: `apps/api/src/modules/recipe/service.ts`. Handle in createRecipe, updateRecipe (both bumpVersion=true and bumpVersion=false paths), and forkRecipe.\n
- [x] task-5: Update API recipe model if needed for queries. Files: `apps/api/src/modules/recipe/model.ts`. Verify findById/findBySlug already return all version fields.\n
- [x] task-6: Add preparationNotes textarea to RecipeCreatePage. Files: `apps/web/src/pages/recipes/RecipeCreatePage.tsx`. Mandatory field. Add state, include in submit payload.\n
- [x] task-7: Add preparationNotes textarea to RecipeEditPage. Files: `apps/web/src/pages/recipes/RecipeEditPage.tsx`. Pre-populate from currentVersion, include in update payload.\n
- [x] task-8: Display preparationNotes on RecipeDetailPage. Files: `apps/web/src/pages/recipes/RecipeDetailPage.tsx`. Render as plain text with preserved line breaks (Approach C).\n
- [x] task-9: Display preparationNotes on RecipeFocusModePage. Files: `apps/web/src/pages/recipes/RecipeFocusModePage.tsx`. Render as plain text with preserved line breaks.\n
- [x] task-10: Localize preparationNotes label. Files: `packages/shared/src/i18n/en.json`, `packages/shared/src/i18n/tr.json`. Add recipe.preparationNotes key.\n
- [x] task-11: Update seed data with preparationNotes for all 6 recipes. Files: `packages/db/src/seed-data.ts`. Write realistic step-by-step preparation notes for each recipe.\n
- [x] task-12: Update seed.ts to insert preparationNotes into recipeVersions. Files: `packages/db/src/seed.ts`.\n
- [x] task-13: Update schema tests for preparationNotes validation. Files: `packages/shared/src/schemas/recipe.test.ts`. Test required, max length.\n
- [x] task-14: Update service tests for preparationNotes persistence. Files: `apps/api/src/modules/recipe/service.test.ts`.\n
- [x] task-15: Run full test suite and verify no regressions. Command: `make test`.\n
- [x] task-16: Update API docs if recipe endpoint docs exist. Files: `docs/api.md` or `docs/recipes.md`.

## Verification

- 1) Schema tests: verify preparationNotes accepts valid strings up to 10000 chars. 2) Service tests: verify createRecipe/updateRecipe persist preparationNotes. 3) Seed test: verify seed data populates the field. 4) UI tests: verify textarea appears on create/edit, verify rendered markdown appears on detail/focus pages. 5) Run db-generate + db-migrate to verify migration applies cleanly. 6) Run full test suite (make test). 7) Manually verify both English and Turkish localization
- Design quality: check empty state, loading state not needed (static render), long text overflow, and no AI slop patterns.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-13T00:56:07.541Z | - |
