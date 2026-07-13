# F08 — Recipe Comparison Improvements

> **Validation status (2026-07-13): ⚠️ Outdated — corrections below (design valid)**
>
> - Verified: RecipeComparePage route is `recipes/compare/:slug1/:slug2` (router.tsx:108); `recipeTasteNotes.tasteNoteId` column exists (schema.ts:250) so `tn.tasteNoteId` is valid. `DiffHighlighter` is net-new (absent from components/recipe/) — F09 depends on it, so land F08 first or merge the two efforts.
> - `mergedData` keys verified against `createRecipe`: title/visibility/brewMethod/drinkType/grindSize/groundWeightGrams/extractionTimeSeconds/extractionVolumeMl/temperatureCelsius/brewerDetails/grinder/preparationNotes/personalNotes/tasteNoteIds/equipmentIds/additionalPreparations all exist on RecipeCreateObjectSchema (recipe.ts:24–59). Note `preparationNotes` is REQUIRED (min 1), so the plan's `pick('preparationNotes') || 'Merged recipe'` fallback is needed. `fetchRecipeVersionWithRelations` is net-new; the tasteNotes/equipment/additionalPreparations relations it loads exist (recipeVersionsRelations, schema.ts:1029–1031).
> - Shape alignment: RecipeComparePage consumes `recipe.currentVersion` + top-level `recipe.tasteNotes`/`recipe.equipment` from `RecipeDetailOutput` (composed as `versions[0]` in recipe/index.ts:326–350) — the CompareTable rewrite must read those same fields.
> - NEW — D42: the merge endpoint returns a recipe via `createRecipe` → wrap in `success()`; add a typed `recipeApi.merge(...)` client method (`api/types.ts` deleted). NEW — D40 i18n: MergeSelector/DiffHighlighter labels must be added to both en.json + tr.json; RecipeComparePage already uses `t()` + `labelFor(BREW_METHODS/DRINK_TYPES)` — preserve that in the diff rewrite.

## Overview

Enhance the existing `RecipeComparePage` with diff highlighting to visually mark parameters that differ between two recipes, and add a "merge" option to create a new recipe from selected parameters of both. No new database tables — frontend enhancement plus one new API endpoint for merge.

## Goals

- Make differences between two recipes immediately visible
- Allow users to cherry-pick the best parameters from each recipe into a new one
- Keep the comparison page layout clean and intuitive
- Reuse existing recipe creation flow for the merge output

## User Stories

1. **As a user**, when comparing two recipes, I want differing parameters highlighted so I can quickly see what's different.
2. **As a user**, I want to merge two recipes by selecting which version of each parameter to keep, creating a new recipe draft.
3. **As a user**, I want the merge to pre-fill the recipe creation form so I can tweak before saving.

## Technical Design

### No New Tables

This feature uses existing `recipe` and `recipe_version` tables only.

### API: Merge Endpoint

Add to `apps/api/src/modules/recipe/index.ts`:

```ts
recipe.post(
  '/merge',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Merge two recipe versions',
    description: 'Creates a new recipe draft from selected parameters of two recipe versions.',
    security: [{ bearerAuth: [] }],
    responses: {
      201: { description: 'Merged recipe draft created' },
      400: { description: 'Invalid merge parameters' },
      404: { description: 'One or both recipes not found' },
    },
  }),
  authMiddleware,
  zValidator('json', RecipeMergeSchema, zodValidationHook),
  async (c) => {
    const authorId = c.get('userId') as string;
    const body = c.req.valid('json');
    try {
      const merged = await service.mergeRecipes(authorId, body);
      return success(c, merged, 201);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
      throw err;
    }
  },
);
```

### Shared Schema

Add to `packages/shared/src/schemas/recipe.ts`:

```ts
export const RecipeMergeSchema = z.object({
  recipeVersionId1: z.uuid(),
  recipeVersionId2: z.uuid(),
  title: z.string().min(1).max(200),
  // Selected parameters from each version
  // Keys match RecipeVersion columns
  selections: z.object({
    brewMethod: z.enum(['v1', 'v2']).optional(),
    drinkType: z.enum(['v1', 'v2']).optional(),
    grindSize: z.enum(['v1', 'v2']).optional(),
    groundWeightGrams: z.enum(['v1', 'v2']).optional(),
    extractionTimeSeconds: z.enum(['v1', 'v2']).optional(),
    extractionVolumeMl: z.enum(['v1', 'v2']).optional(),
    temperatureCelsius: z.enum(['v1', 'v2']).optional(),
    brewerDetails: z.enum(['v1', 'v2']).optional(),
    grinder: z.enum(['v1', 'v2']).optional(),
    preparationNotes: z.enum(['v1', 'v2']).optional(),
    personalNotes: z.enum(['v1', 'v2']).optional(),
    // Equipment, taste notes, additional preparations
    tasteNotes: z.enum(['v1', 'v2', 'both', 'none']).optional(),
    equipment: z.enum(['v1', 'v2', 'both', 'none']).optional(),
    additionalPreparations: z.enum(['v1', 'v2', 'both', 'none']).optional(),
  }),
});
```

Export from `packages/shared/src/schemas/index.ts`:

```ts
export { RecipeMergeSchema } from './recipe.ts';
```

### Service: Merge Logic

Add to `apps/api/src/modules/recipe/service.ts`:

```ts
export async function mergeRecipes\(authorId: string, data: any\) \{
  logger\.debug\(\{ authorId \}, 'mergeRecipes started'\);

  // Use model-layer functions instead of direct DB access
  const v1 = await model\.fetchRecipeVersionWithRelations\(data\.recipeVersionId1\);
  const v2 = await model\.fetchRecipeVersionWithRelations\(data\.recipeVersionId2\);

  if (!v1 || !v2) throw new Error('RECIPE_NOT_FOUND');

  const sel = data.selections;
  const pick = (field: string) => {
    const choice = sel[field];
    if (!choice || choice === 'none') return null;
    if (choice === 'v1') return (v1 as any)[field];
    if (choice === 'v2') return (v2 as any)[field];
    return (v1 as any)[field]; // default
  };

  // Build merged recipe data using existing createRecipe
  const mergedData = {
    title: data.title,
    visibility: 'draft',
    brewMethod: pick('brewMethod') ?? v1.brewMethod,
    drinkType: pick('drinkType') ?? v1.drinkType,
    grindSize: pick('grindSize'),
    groundWeightGrams: pick('groundWeightGrams'),
    extractionTimeSeconds: pick('extractionTimeSeconds'),
    extractionVolumeMl: pick('extractionVolumeMl'),
    temperatureCelsius: pick('temperatureCelsius'),
    brewerDetails: pick('brewerDetails'),
    grinder: pick('grinder'),
    preparationNotes: pick('preparationNotes') || 'Merged recipe',
    personalNotes: pick('personalNotes'),
    tasteNoteIds: getMergedTasteNoteIds(v1, v2, sel.tasteNotes),
    equipmentIds: getMergedEquipmentIds(v1, v2, sel.equipment),
    additionalPreparations: getMergedPreparations(v1, v2, sel.additionalPreparations),
  };

  const recipe = await createRecipe(authorId, mergedData);
  logger.debug({ authorId }, 'mergeRecipes completed');
  return recipe;
}

function getMergedTasteNoteIds(v1: any, v2: any, choice?: string): string[] {
  if (!choice || choice === 'none') return [];
  if (choice === 'v1') return v1.tasteNotes?.map((tn: any) => tn.tasteNoteId) ?? [];
  if (choice === 'v2') return v2.tasteNotes?.map((tn: any) => tn.tasteNoteId) ?? [];
  // 'both' — union of both
  const ids = new Set<string>();
  v1.tasteNotes?.forEach((tn: any) => ids.add(tn.tasteNoteId));
  v2.tasteNotes?.forEach((tn: any) => ids.add(tn.tasteNoteId));
  return Array.from(ids);
}

function getMergedEquipmentIds(v1: any, v2: any, choice?: string): string[] {
  if (!choice || choice === 'none') return [];
  if (choice === 'v1') return v1.equipment?.map((e: any) => e.equipmentId) ?? [];
  if (choice === 'v2') return v2.equipment?.map((e: any) => e.equipmentId) ?? [];
  const ids = new Set<string>();
  v1.equipment?.forEach((e: any) => ids.add(e.equipmentId));
  v2.equipment?.forEach((e: any) => ids.add(e.equipmentId));
  return Array.from(ids);
}

function getMergedPreparations(v1: any, v2: any, choice?: string): any[] {
  if (!choice || choice === 'none') return [];
  if (choice === 'v1') return v1.additionalPreparations ?? [];
  if (choice === 'v2') return v2.additionalPreparations ?? [];
  return [...(v1.additionalPreparations ?? []), ...(v2.additionalPreparations ?? [])];
}
```

### Model: New Model Functions

Add to `apps/api/src/modules/recipe/model.ts`:

```ts
/** Fetch a single recipe version with full relations (taste notes, equipment, preparations). */
export async function fetchRecipeVersionWithRelations(versionId: string) {
  return db.query.recipeVersions.findFirst({
    where: eq(recipeVersions.id, versionId),
    with: {
      tasteNotes: { with: { tasteNote: true } },
      equipment: { with: { equipment: true } },
      additionalPreparations: true,
    },
  });
}
```

### Frontend: DiffHighlighter Component

```tsx
// apps/web/src/components/recipe/DiffHighlighter.tsx
interface DiffHighlighterProps {
  label: string;
  value1: string | number | null;
  value2: string | number | null;
  formatter?: (val: string | number | null) => string;
}

export function DiffHighlighter({
  label,
  value1,
  value2,
  formatter,
}: DiffHighlighterProps) {
  const display1 = formatter ? formatter(value1) : (value1 ?? '-');
  const display2 = formatter ? formatter(value2) : (value2 ?? '-');
  const differs = display1 !== display2;

  return (
    <div
      className="grid grid-cols-3 gap-2 py-2 text-sm"
      style={{
        borderBottom: '1px solid var(--border-primary)',
        backgroundColor: differs ? 'var(--diff-highlight, rgba(255, 200, 0, 0.1))' : 'transparent',
      }}
    >
      <div style={{ color: differs ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
        {display1}
      </div>
      <div className="text-center font-medium" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </div>
      <div
        className="text-right"
        style={{ color: differs ? 'var(--accent-secondary)' : 'var(--text-primary)' }}
      >
        {display2}
      </div>
    </div>
  );
}
```

### Frontend: MergeSelector Component

```tsx
// apps/web/src/components/recipe/MergeSelector.tsx
import { useState } from 'react';

interface MergeField {
  key: string;
  label: string;
  value1: string | number | null;
  value2: string | number | null;
  type: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
}

interface MergeSelectorProps {
  fields: MergeField[];
  onMerge: (selections: Record<string, 'v1' | 'v2' | 'both' | 'none'>) => void;
}

export function MergeSelector({ fields, onMerge }: MergeSelectorProps) {
  const [selections, setSelections] = useState<Record<string, string>>({});

  function handleSelect(field: string, value: string) {
    setSelections((prev) => ({ ...prev, [field]: value }));
  }

  function handleMerge() {
    onMerge(selections as Record<string, 'v1' | 'v2' | 'both' | 'none'>);
  }

  return (
    <div className="card space-y-3">
      <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
        Select Parameters to Keep
      </h3>
      {fields.map((f) => (
        <div key={f.key} className="flex items-center gap-3 text-sm">
          <span className="w-40" style={{ color: 'var(--text-secondary)' }}>
            {f.label}
          </span>
          <div className="flex gap-2 flex-1">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name={f.key}
                value="v1"
                checked={selections[f.key] === 'v1'}
                onChange={() => handleSelect(f.key, 'v1')}
              />
              <span style={{ color: 'var(--accent-primary)' }}>
                {f.value1 ?? '-'}
              </span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name={f.key}
                value="v2"
                checked={selections[f.key] === 'v2'}
                onChange={() => handleSelect(f.key, 'v2')}
              />
              <span style={{ color: 'var(--accent-secondary)' }}>
                {f.value2 ?? '-'}
              </span>
            </label>
          </div>
        </div>
      ))}
      <button type="button" onClick={handleMerge} className="btn-primary w-full">
        Create Merged Recipe
      </button>
    </div>
  );
}
```

### Enhanced RecipeComparePage

Update `apps/web/src/pages/recipes/RecipeComparePage.tsx`:

```tsx
// Key changes:
// 1. Import DiffHighlighter and MergeSelector
// 2. Add diff highlighting to CompareTable
// 3. Add merge flow: selection → API call → navigate to edit page

// In CompareTable, replace CompareRow with DiffHighlighter:
function CompareTable({ v1, v2, tasteNotes1, tasteNotes2, equipment1, equipment2 }) {
  const fields = [
    { key: 'brewMethod', label: 'Brew Method', v1: v1.brewMethod, v2: v2.brewMethod },
    { key: 'drinkType', label: 'Drink Type', v1: v1.drinkType, v2: v2.drinkType },
    { key: 'groundWeightGrams', label: 'Dose', v1: v1.groundWeightGrams, v2: v2.groundWeightGrams },
    // ... more fields
  ];

  return (
    <div className="space-y-1">
      {fields.map((f) => (
        <DiffHighlighter
          key={f.key}
          label={f.label}
          value1={f.v1}
          value2={f.v2}
        />
      ))}
    </div>
  );
}
```

### Router Changes

No new routes needed — merge creates a recipe and navigates to the existing edit page.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/recipes/merge` | Required | Merge two recipe versions into a new draft |

## Frontend Components

| Component | File | Description |
|-----------|------|-------------|
| `DiffHighlighter` | `apps/web/src/components/recipe/DiffHighlighter.tsx` | Single row showing value1 vs value2 with diff highlighting |
| `MergeSelector` | `apps/web/src/components/recipe/MergeSelector.tsx` | Radio-button grid for selecting which params to keep |
| `RecipeComparePage` | `apps/web/src/pages/recipes/RecipeComparePage.tsx` | Updated with diff highlighting and merge flow |

## Modifications to Existing Files

| File | Change |
|------|--------|
| `packages/shared/src/schemas/recipe.ts` | Add `RecipeMergeSchema` |
| `packages/shared/src/schemas/index.ts` | Export `RecipeMergeSchema` |
| `apps/api/src/modules/recipe/index.ts` | Add `POST /recipes/merge` endpoint |
| `apps/api/src/modules/recipe/service.ts` | Add `mergeRecipes` function |
| `apps/web/src/pages/recipes/RecipeComparePage.tsx` | Add diff highlighting, merge button, merge flow |

## CSS Variables

Add to theme CSS (if not already present):

```css
:root {
  --diff-highlight: rgba(255, 200, 0, 0.1);
}
```

## Acceptance Criteria

- [ ] Parameters that differ between recipes are visually highlighted
- [ ] Identical parameters display without highlighting
- [ ] Merge button is visible on the comparison page
- [ ] Merge selector shows radio buttons for each parameter (v1 / v2)
- [ ] "Both" option available for taste notes, equipment, and preparations
- [ ] Merge creates a new draft recipe via `POST /recipes/merge`
- [ ] After merge, user is navigated to the new recipe's edit page
- [ ] `RecipeMergeSchema` validates merge payloads
- [ ] Users must be authenticated to merge
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)
- [ ] All tests pass (`make test`)

## Implementation Steps

1. Add `RecipeMergeSchema` to `packages/shared/src/schemas/recipe.ts`
2. Export `RecipeMergeSchema` from barrel file
3. Add `mergeRecipes` function to `apps/api/src/modules/recipe/service.ts`
4. Add `POST /recipes/merge` endpoint to `apps/api/src/modules/recipe/index.ts`
5. Create `apps/web/src/components/recipe/DiffHighlighter.tsx`
6. Create `apps/web/src/components/recipe/MergeSelector.tsx`
7. Update `apps/web/src/pages/recipes/RecipeComparePage.tsx` with diff highlighting
8. Add merge flow to `RecipeComparePage` (button → selector → API call → navigate)
9. Add CSS variable `--diff-highlight` to theme
10. Run `make check && make lint && make test`

## Dependencies

- Existing: `RecipeComparePage` at `apps/web/src/pages/recipes/RecipeComparePage.tsx`
- Existing: `recipeVersions` table with full relations
- Existing: `createRecipe` service function for creating the merged recipe
- Existing: `authMiddleware` for protected merge endpoint
