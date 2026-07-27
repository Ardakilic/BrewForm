# F08 — Recipe Comparison Improvements

> **Refreshed 2026-07-28.** Design unchanged; conventions updated to match the current codebase:
>
> - OpenAPI docs use `describeRoute()` + `resolver(successEnvelope(...))` + `jsonRequestBody()` + `ErrorEnvelopeSchema` (per AGENTS.md).
> - Merge response reuses `RecipeDetailOutputSchema` (`createRecipe` already returns that shape).
> - Frontend typed API: `recipeApi.merge(...)` in `apps/web/src/api/index.ts` (`api/types.ts` was deleted).
> - i18n: translations live in `packages/shared/src/i18n/{en,tr}.json`; all user-facing strings use `t()`.
> - No `any` types — proper model return types throughout.
> - Unit tests required for service + schema (AGENTS.md).
> - `zodValidationHook` confirmed at `apps/api/src/utils/response/index.ts:151`.
> - `z.uuid()` is the Zod v4 pattern used across all shared schemas.
> - F09 (version diff) depends on `DiffHighlighter` from this plan — land F08 first.

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

### Shared Schema

Add to `packages/shared/src/schemas/recipe.ts`:

```ts
export const RecipeMergeSchema = z.object({
  recipeVersionId1: z.uuid(),
  recipeVersionId2: z.uuid(),
  title: z.string().min(1).max(200),
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
    tasteNotes: z.enum(['v1', 'v2', 'both', 'none']).optional(),
    equipment: z.enum(['v1', 'v2', 'both', 'none']).optional(),
    additionalPreparations: z.enum(['v1', 'v2', 'both', 'none']).optional(),
  }),
});

export type RecipeMerge = z.infer<typeof RecipeMergeSchema>;
```

Export from `packages/shared/src/schemas/index.ts`:

```ts
export { RecipeMergeSchema, type RecipeMerge } from './recipe.ts';
```

### Model: New Model Function

Add to `apps/api/src/modules/recipe/model.ts`:

```ts
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

### Service: Merge Logic

Add to `apps/api/src/modules/recipe/service.ts`:

```ts
export async function mergeRecipes(authorId: string, data: RecipeMerge) {
  log.debug({ authorId }, 'mergeRecipes started');

  const v1 = await model.fetchRecipeVersionWithRelations(data.recipeVersionId1);
  const v2 = await model.fetchRecipeVersionWithRelations(data.recipeVersionId2);

  if (!v1 || !v2) throw new Error('RECIPE_NOT_FOUND');

  const sel = data.selections;
  const pick = <K extends keyof typeof v1>(field: K) => {
    const choice = sel[field as keyof typeof sel];
    if (!choice || choice === 'none') return null;
    if (choice === 'v2') return v2[field];
    return v1[field];
  };

  const mergedData = {
    title: data.title,
    visibility: 'draft' as const,
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
    tasteNoteIds: getMergedIds(v1.tasteNotes, v2.tasteNotes, sel.tasteNotes, 'tasteNoteId'),
    equipmentIds: getMergedIds(v1.equipment, v2.equipment, sel.equipment, 'equipmentId'),
    additionalPreparations: getMergedPreparations(v1, v2, sel.additionalPreparations),
  };

  const recipe = await createRecipe(authorId, mergedData);
  log.debug({ authorId, recipeId: recipe.id }, 'mergeRecipes completed');
  return recipe;
}

function getMergedIds(
  list1: { [key: string]: unknown }[] | undefined,
  list2: { [key: string]: unknown }[] | undefined,
  choice: string | undefined,
  idField: string,
): string[] {
  if (!choice || choice === 'none') return [];
  if (choice === 'v1') return (list1 ?? []).map((x) => x[idField] as string);
  if (choice === 'v2') return (list2 ?? []).map((x) => x[idField] as string);
  const ids = new Set<string>();
  (list1 ?? []).forEach((x) => ids.add(x[idField] as string));
  (list2 ?? []).forEach((x) => ids.add(x[idField] as string));
  return Array.from(ids);
}

function getMergedPreparations(
  v1: { additionalPreparations?: unknown[] },
  v2: { additionalPreparations?: unknown[] },
  choice?: string,
): unknown[] {
  if (!choice || choice === 'none') return [];
  if (choice === 'v1') return v1.additionalPreparations ?? [];
  if (choice === 'v2') return v2.additionalPreparations ?? [];
  return [...(v1.additionalPreparations ?? []), ...(v2.additionalPreparations ?? [])];
}
```

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
    requestBody: jsonRequestBody(RecipeMergeSchema, 'Merge selection payload'),
    responses: {
      201: {
        description: 'Merged recipe draft created',
        content: {
          'application/json': {
            schema: resolver(successEnvelope(RecipeDetailOutputSchema)),
          },
        },
      },
      400: {
        description: 'Invalid merge parameters',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      401: {
        description: 'Authentication required',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'One or both recipe versions not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
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

New imports needed in `index.ts`: `RecipeMergeSchema` from `@brewform/shared/schemas`.

### Frontend: DiffHighlighter Component

```tsx
// apps/web/src/components/recipe/DiffHighlighter.tsx
import { useTranslation } from '../../contexts/I18nContext.tsx';

interface DiffHighlighterProps {
  labelKey: string;
  value1: string | number | null;
  value2: string | number | null;
  formatter?: (val: string | number | null) => string;
}

export function DiffHighlighter({ labelKey, value1, value2, formatter }: DiffHighlighterProps) {
  const { t } = useTranslation();
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
        {t(labelKey)}
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
import { useTranslation } from '../../contexts/I18nContext.tsx';

interface MergeField {
  key: string;
  labelKey: string;
  value1: string | number | null;
  value2: string | number | null;
}

interface MergeSelectorProps {
  fields: MergeField[];
  onMerge: (selections: Record<string, 'v1' | 'v2' | 'both' | 'none'>) => void;
}

export function MergeSelector({ fields, onMerge }: MergeSelectorProps) {
  const { t } = useTranslation();
  const [selections, setSelections] = useState<Record<string, string>>({});

  function handleSelect(field: string, value: string) {
    setSelections((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="card space-y-3">
      <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
        {t('merge.selectParams')}
      </h3>
      {fields.map((f) => (
        <div key={f.key} className="flex items-center gap-3 text-sm">
          <span className="w-40" style={{ color: 'var(--text-secondary)' }}>
            {t(f.labelKey)}
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
              <span style={{ color: 'var(--accent-primary)' }}>{f.value1 ?? '-'}</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name={f.key}
                value="v2"
                checked={selections[f.key] === 'v2'}
                onChange={() => handleSelect(f.key, 'v2')}
              />
              <span style={{ color: 'var(--accent-secondary)' }}>{f.value2 ?? '-'}</span>
            </label>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onMerge(selections as Record<string, 'v1' | 'v2' | 'both' | 'none'>)}
        className="btn-primary w-full"
      >
        {t('merge.create')}
      </button>
    </div>
  );
}
```

### Frontend: recipeApi Method

Add to the `recipeApi` object in `apps/web/src/api/index.ts`:

```ts
merge: (body: RecipeMerge) =>
  api.post<RecipeMerge, RecipeDetailOutput>('/recipes/merge', body),
```

Import `RecipeMerge` and `RecipeDetailOutput` from `@brewform/shared/schemas`.

### Enhanced RecipeComparePage

Update `apps/web/src/pages/recipes/RecipeComparePage.tsx`:

1. Replace `CompareRow` usage in `CompareTable` with `DiffHighlighter` (pass `labelKey` instead of hardcoded label).
2. Add merge flow: "Merge" button → `MergeSelector` overlay → `recipeApi.merge(...)` → `navigate(/recipes/${newId}/edit)`.
3. Preserve existing `labelFor(BREW_METHODS/DRINK_TYPES)` for enum display values.

```tsx
// Key structural changes:
import { DiffHighlighter } from '../../components/recipe/DiffHighlighter.tsx';
import { MergeSelector } from '../../components/recipe/MergeSelector.tsx';
import { recipeApi } from '../../api/index.ts';

// In CompareTable, replace CompareRow with DiffHighlighter:
function CompareTable({ v1, v2 }: { v1: RecipeDetailVersionOutput; v2: RecipeDetailVersionOutput }) {
  const fields = [
    { key: 'brewMethod', labelKey: 'recipe.brewMethod', v1: v1.brewMethod, v2: v2.brewMethod },
    { key: 'drinkType', labelKey: 'recipe.drinkType', v1: v1.drinkType, v2: v2.drinkType },
    { key: 'groundWeightGrams', labelKey: 'recipe.dose', v1: v1.groundWeightGrams, v2: v2.groundWeightGrams },
    // ... remaining fields
  ];

  return (
    <div className="space-y-1">
      {fields.map((f) => (
        <DiffHighlighter key={f.key} labelKey={f.labelKey} value1={f.v1} value2={f.v2} />
      ))}
    </div>
  );
}

// Merge flow (in RecipeComparePage):
const [showMerge, setShowMerge] = useState(false);

async function handleMerge(selections: Record<string, 'v1' | 'v2' | 'both' | 'none'>) {
  const merged = await recipeApi.merge({
    recipeVersionId1: recipe1.currentVersion.id,
    recipeVersionId2: recipe2.currentVersion.id,
    title: `${recipe1.title} + ${recipe2.title}`,
    selections,
  });
  navigate(`/recipes/${merged.id}/edit`);
}
```

### Router Changes

No new routes needed — merge creates a recipe and navigates to the existing edit page.

### i18n Keys

Add to `packages/shared/src/i18n/en.json`:

```json
{
  "merge.selectParams": "Select Parameters to Keep",
  "merge.create": "Create Merged Recipe",
  "merge.button": "Merge Recipes"
}
```

Add to `packages/shared/src/i18n/tr.json`:

```json
{
  "merge.selectParams": "Korunacak Parametreleri Seçin",
  "merge.create": "Birleştirilmiş Tarif Oluştur",
  "merge.button": "Tarifleri Birleştir"
}
```

Existing `recipe.*` keys (brewMethod, drinkType, dose, etc.) are already present — reuse them for DiffHighlighter labels.

### CSS Variables

Add to theme CSS (if not already present):

```css
:root {
  --diff-highlight: rgba(255, 200, 0, 0.1);
}
```

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
| `packages/shared/src/schemas/recipe.ts` | Add `RecipeMergeSchema` + `RecipeMerge` type |
| `packages/shared/src/schemas/index.ts` | Export `RecipeMergeSchema`, `RecipeMerge` |
| `packages/shared/src/i18n/en.json` | Add `merge.*` keys |
| `packages/shared/src/i18n/tr.json` | Add `merge.*` keys |
| `apps/api/src/modules/recipe/model.ts` | Add `fetchRecipeVersionWithRelations` |
| `apps/api/src/modules/recipe/service.ts` | Add `mergeRecipes` + private helpers |
| `apps/api/src/modules/recipe/index.ts` | Add `POST /recipes/merge` endpoint with full OpenAPI docs |
| `apps/web/src/api/index.ts` | Add `recipeApi.merge(...)` method |
| `apps/web/src/pages/recipes/RecipeComparePage.tsx` | Diff highlighting via DiffHighlighter, merge flow |

## New Files

| File | Description |
|------|-------------|
| `apps/web/src/components/recipe/DiffHighlighter.tsx` | Diff row component (also used by F09) |
| `apps/web/src/components/recipe/MergeSelector.tsx` | Merge parameter selector |
| `apps/api/src/modules/recipe/merge.test.ts` | Unit tests for merge service + schema |

## Acceptance Criteria

- [ ] Parameters that differ between recipes are visually highlighted
- [ ] Identical parameters display without highlighting
- [ ] Merge button is visible on the comparison page
- [ ] Merge selector shows radio buttons for each parameter (v1 / v2)
- [ ] "Both" option available for taste notes, equipment, and preparations
- [ ] Merge creates a new draft recipe via `POST /recipes/merge`
- [ ] After merge, user is navigated to the new recipe's edit page
- [ ] `RecipeMergeSchema` validates merge payloads (Zod v4, `z.uuid()`)
- [ ] Users must be authenticated to merge (401 documented)
- [ ] OpenAPI spec at `/api/v1/openapi.json` includes the merge route with full docs
- [ ] All user-facing strings use `t()` with keys in en.json + tr.json
- [ ] Unit tests cover: merge service logic, schema validation, model function
- [ ] Structured logging on `mergeRecipes` entry/exit/error
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)
- [ ] Format passes (`make fmt`)
- [ ] All tests pass (`make test`)

## Implementation Steps

1. Add `RecipeMergeSchema` + type to `packages/shared/src/schemas/recipe.ts`; export from barrel
2. Add `merge.*` i18n keys to `packages/shared/src/i18n/{en,tr}.json`
3. Add `fetchRecipeVersionWithRelations` to `apps/api/src/modules/recipe/model.ts`
4. Add `mergeRecipes` + helpers to `apps/api/src/modules/recipe/service.ts`
5. Add `POST /recipes/merge` endpoint to `apps/api/src/modules/recipe/index.ts` (full OpenAPI docs)
6. Write unit tests (`apps/api/src/modules/recipe/merge.test.ts`)
7. Create `apps/web/src/components/recipe/DiffHighlighter.tsx`
8. Create `apps/web/src/components/recipe/MergeSelector.tsx`
9. Add `recipeApi.merge(...)` to `apps/web/src/api/index.ts`
10. Update `RecipeComparePage.tsx`: diff highlighting + merge flow
11. Add `--diff-highlight` CSS variable to theme
12. Run `make check && make lint && make fmt && make test`

## Dependencies

- Existing: `RecipeComparePage` at `apps/web/src/pages/recipes/RecipeComparePage.tsx`
- Existing: `recipeVersions` table with full relations (schema.ts:1029–1031)
- Existing: `createRecipe` service function (returns `RecipeDetailOutput` shape)
- Existing: `authMiddleware`, `zodValidationHook`, `success`, `error` from utils
- Existing: `RecipeDetailOutputSchema` for response docs
- Existing: `recipeApi` typed client in `apps/web/src/api/index.ts`
- Existing: `useTranslation` hook + `packages/shared/src/i18n/` locale files
- Existing: `labelFor` + `BREW_METHODS`/`DRINK_TYPES` from `@brewform/shared/constants`
