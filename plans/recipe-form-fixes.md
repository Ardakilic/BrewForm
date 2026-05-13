# Implementation Plan: Recipe Form & Display Fixes

## Clarifications
1. **Taste Notes filter**: Improve `TasteAutocomplete` (clear search after selection, add checkmarks, keep intensity dots) rather than replacing with `TasteNotesFilter`.
2. **DB enum changes**: Breaking changes accepted. Update schema + regenerate migrations; user will wipe DB.
3. **Main Brewer clickability**: Display `brewerDetails` as a static/non-clickable "Main Brewer" item in the Equipment section (it is free text without an `equipmentId`).

## Task Groups

### Group A — Backend Schema, Constants, Seed Data
**Files**: `packages/shared/src/constants/drink-types.ts`, `packages/shared/src/schemas/recipe.ts`, `packages/db/src/schema.ts`, `packages/db/src/seed-data.ts`
- Add `aeropress`, `drip_coffee`, `moka_pot`, `siphon` to `DRINK_TYPES` with `compatibleMethods` matching their brew method.
- Add same 4 values to `DrinkTypeEnum` in Zod schema.
- Add same 4 values to DB `drinkTypeEnum` in `schema.ts`.
- Change `groundWeightGrams` and `extractionVolumeMl` from `.positive()` to `.min(0)` in `RecipeCreateObjectSchema`.
- Update seed data: recipes using `aeropress`, `drip_coffee`, `moka_pot`, `siphon` brew methods must use corresponding new drink types.

### Group B — Recipe Display Pages (Detail / Focus)
**Files**: `apps/web/src/components/recipe/EquipmentSection.tsx`, `apps/web/src/pages/recipes/RecipeDetailPage.tsx`, `apps/web/src/pages/recipes/RecipeFocusModePage.tsx`, `apps/web/src/components/recipe/RecipeNotesSection.tsx`
- `EquipmentSection`: accept optional `brewerDetails` prop; if present, prepend a non-clickable "Main Brewer" card before the equipment grid.
- `RecipeDetailPage` & `RecipeFocusModePage`: pass `currentVersion.brewerDetails` to `EquipmentSection`.
- `RecipeNotesSection`: default `initialNotes` to empty string (`useState(initialNotes ?? '')`) to prevent `.length` on `null`.

### Group C — Recipe Forms (Create / Edit)
**Files**: `apps/web/src/pages/recipes/RecipeCreatePage.tsx`, `apps/web/src/pages/recipes/RecipeEditPage.tsx`, `apps/web/src/api/client.ts`
- Rename label "Brewer Details" → "Main Brewer" in both forms.
- `RecipeEditPage`: add missing `brewerDetails` state field, populate from API, include in PATCH payload.
- Add `min="0"` to Dose (`groundWeightGrams`) and Yield (`extractionVolumeMl`) inputs.
- Remove client-side `title` validation from `RecipeCreatePage`.
- Update both forms to catch `ApiError`, read `err.details`, and render each as a bullet point in the error banner.

### Group D — TasteAutocomplete, Setups, i18n
**Files**: `apps/web/src/components/taste/TasteAutocomplete.tsx`, `apps/web/src/pages/setups/SetupListPage.tsx`, `packages/shared/src/i18n/en.json`, `packages/shared/src/i18n/tr.json`
- `TasteAutocomplete`: clear `query` after a selection is toggled; add checkmark indicator for selected items in the dropdown.
- `SetupListPage`: rename label "Brewer Details" → "Main Brewer".
- i18n: update `setup.brewerDetails` values; add `recipe.mainBrewer` key if needed.

### Group E — Tests & Verification
**Files**: `apps/web/src/components/recipe/EquipmentSection.test.tsx`, `apps/api/src/modules/recipe/service.test.ts`
- Update `EquipmentSection` tests for `brewerDetails` prop.
- Add backend schema tests for new drink types and `.min(0)` validation.
- Run `deno check`, `deno lint`, and `deno test` across modified packages.

## Execution Order
Groups A, B, C, D can run in parallel. Group E runs after all others.
