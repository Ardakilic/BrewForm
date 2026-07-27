# recipe-comparison Specification

## Purpose

Enhance the existing `RecipeComparePage` with visual diff highlighting (parameters that differ
between two recipes are visually marked) and a "merge" flow that creates a new draft recipe from
cherry-picked parameters of both. No new database tables — this is a frontend enhancement plus one
new API endpoint (`POST /api/v1/recipes/merge`). F09 (version diff) depends on the `DiffHighlighter`
component from this spec.

---

## ADDED Requirements

### Requirement: Shared Zod schema for merge payloads

The system SHALL add `RecipeMergeSchema` to `packages/shared/src/schemas/recipe.ts`:

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

The system SHALL re-export from `packages/shared/src/schemas/index.ts`:

```ts
export { RecipeMergeSchema } from './recipe.ts';
export type { RecipeMerge } from './recipe.ts';
```

Uses Zod v4 patterns: `z.uuid()` (not `z.string().uuid()`), `z.enum([...])` with literal arrays.

#### Scenario: RecipeMergeSchema validates a complete payload

- **WHEN** `RecipeMergeSchema.safeParse({ recipeVersionId1: crypto.randomUUID(), recipeVersionId2: crypto.randomUUID(), title: 'Merged', selections: { brewMethod: 'v1', tasteNotes: 'both' } })` is called
- **THEN** `result.success` is `true`
- **AND** `result.data.selections.brewMethod` is `'v1'`
- **AND** `result.data.selections.tasteNotes` is `'both'`

#### Scenario: RecipeMergeSchema rejects invalid UUID

- **WHEN** `RecipeMergeSchema.safeParse({ recipeVersionId1: 'not-a-uuid', recipeVersionId2: crypto.randomUUID(), title: 'X', selections: {} })` is called
- **THEN** `result.success` is `false`
- **AND** `result.error.issues` includes a path containing `'recipeVersionId1'`

#### Scenario: RecipeMergeSchema rejects empty title

- **WHEN** `RecipeMergeSchema.safeParse({ recipeVersionId1: crypto.randomUUID(), recipeVersionId2: crypto.randomUUID(), title: '', selections: {} })` is called
- **THEN** `result.success` is `false`

#### Scenario: RecipeMergeSchema rejects invalid selection value

- **WHEN** `RecipeMergeSchema.safeParse({ recipeVersionId1: crypto.randomUUID(), recipeVersionId2: crypto.randomUUID(), title: 'X', selections: { brewMethod: 'v3' } })` is called
- **THEN** `result.success` is `false`

#### Scenario: RecipeMergeSchema allows empty selections

- **WHEN** `RecipeMergeSchema.safeParse({ recipeVersionId1: crypto.randomUUID(), recipeVersionId2: crypto.randomUUID(), title: 'X', selections: {} })` is called
- **THEN** `result.success` is `true`

---

### Requirement: Model function to fetch a recipe version with all relations

The system SHALL add `fetchRecipeVersionWithRelations` to `apps/api/src/modules/recipe/model.ts`:

```ts
/**
 * Fetch a single recipe version by ID with its taste notes, equipment, and
 * additional preparations relations populated.
 * @param versionId - The recipe version UUID.
 * @returns The version row with nested relations, or undefined if not found.
 */
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

This function uses the existing `db` import and `recipeVersions` table already present in
`model.ts`. It follows the same relational query pattern as `findById` (which uses
`db.query.recipes.findFirst({ with: {...} })`). The `recipeVersions` table has Drizzle relations
defined at `packages/db/src/schema.ts` (lines ~1029-1031) for `tasteNotes`, `equipment`, and
`additionalPreparations`.

#### Scenario: fetchRecipeVersionWithRelations returns version with relations

- **WHEN** `fetchRecipeVersionWithRelations(existingVersionId)` is called for a version that has 2 taste notes and 1 equipment item
- **THEN** the returned object has `tasteNotes` array of length 2, each with a nested `tasteNote` object
- **AND** the returned object has `equipment` array of length 1, with a nested `equipment` object
- **AND** the returned object has `additionalPreparations` array

#### Scenario: fetchRecipeVersionWithRelations returns undefined for missing ID

- **WHEN** `fetchRecipeVersionWithRelations('nonexistent-id')` is called
- **THEN** the function returns `undefined`

---

### Requirement: Service function to merge two recipe versions

The system SHALL add `mergeRecipes` to `apps/api/src/modules/recipe/service.ts`:

```ts
/**
 * Merge two recipe versions into a new draft recipe by cherry-picking fields.
 * @param authorId - The authenticated user's ID.
 * @param data - Validated merge payload (RecipeMerge).
 * @returns The newly created recipe (RecipeDetailOutput shape via createRecipe).
 */
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
  log.debug({ authorId, recipeId: recipe?.id }, 'mergeRecipes completed');
  return recipe;
}
```

The system SHALL add two private helper functions in the same file:

```ts
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

**Key design decisions:**
- The merged recipe is always created as `visibility: 'draft'` so the user can review before publishing.
- `brewMethod` and `drinkType` fall back to v1's values when no selection is made (they are required fields on `recipeVersions`).
- `preparationNotes` falls back to `'Merged recipe'` when neither version has notes and no selection is made.
- The function delegates to the existing `createRecipe` service function, which handles slug generation, equipment compatibility validation, brew ratio computation, and returns the full `RecipeDetailOutput` shape.
- The service SHALL NOT import from `drizzle-orm` or `@brewform/db` directly — all DB access goes through `model.fetchRecipeVersionWithRelations` and `createRecipe` (per the `recipe-write` spec).
- Taste note intensities are NOT preserved during merge — `createRecipe` defaults all intensities to `1` when `tasteNoteIntensities` is not provided. This is acceptable since the merged recipe is a draft the user will review.

**Logging:** entry log with `{ authorId }`, exit log with `{ authorId, recipeId }`. Error path logs `{ err, authorId }` at error level. Never log the merge payload (may contain `personalNotes`).

#### Scenario: mergeRecipes creates a draft from v1 fields

- **WHEN** `mergeRecipes(authorId, { recipeVersionId1: v1Id, recipeVersionId2: v2Id, title: 'My Merge', selections: { brewMethod: 'v1', grindSize: 'v1' } })` is called
- **THEN** the returned recipe has `visibility === 'draft'`
- **AND** `title === 'My Merge'`
- **AND** `versions[0].brewMethod` equals v1's brewMethod
- **AND** `versions[0].grindSize` equals v1's grindSize

#### Scenario: mergeRecipes picks v2 fields when selected

- **WHEN** `mergeRecipes(authorId, { ..., selections: { temperatureCelsius: 'v2' } })` is called
- **THEN** `versions[0].temperatureCelsius` equals v2's temperatureCelsius

#### Scenario: mergeRecipes merges taste notes with 'both'

- **WHEN** v1 has taste notes [A, B] and v2 has taste notes [B, C], and `selections.tasteNotes === 'both'`
- **THEN** the merged recipe's taste notes include A, B, and C (deduplicated)

#### Scenario: mergeRecipes returns empty arrays for 'none'

- **WHEN** `selections.equipment === 'none'`
- **THEN** the merged recipe has no equipment entries

#### Scenario: mergeRecipes throws RECIPE_NOT_FOUND for missing version

- **WHEN** `mergeRecipes(authorId, { recipeVersionId1: 'nonexistent', ... })` is called
- **THEN** the function throws `new Error('RECIPE_NOT_FOUND')`

#### Scenario: mergeRecipes falls back to v1 for unselected required fields

- **WHEN** `selections` does not include `brewMethod` or `drinkType`
- **THEN** the merged recipe uses v1's `brewMethod` and `drinkType`

---

### Requirement: POST /api/v1/recipes/merge endpoint with full OpenAPI documentation

The system SHALL add a `POST /merge` route to `apps/api/src/modules/recipe/index.ts` (the existing
recipe Hono router, mounted at `/api/v1/recipes`):

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
      403: {
        description: 'Email not verified or equipment compatibility violation',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'One or both recipe versions not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  zValidator('json', RecipeMergeSchema, zodValidationHook),
  async (c) => {
    if (!isEmailVerified(c)) {
      return error(c, 'EMAIL_NOT_VERIFIED', 'Please verify your email to perform this action', 403);
    }
    const authorId = c.get('userId') as string;
    const body = c.req.valid('json');
    try {
      const merged = await service.mergeRecipes(authorId, body);
      return success(c, merged, 201);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not authorized', 403);
      throw err;
    }
  },
);
```

**Pattern compliance (per AGENTS.md and existing routes):**
- `describeRoute()` from `hono-openapi` precedes the route handler
- `authGuard` middleware (the existing auth middleware used by all recipe mutation routes)
- `zValidator('json', RecipeMergeSchema, zodValidationHook)` — NOT hono-openapi's `validator`
- `jsonRequestBody(Schema)` for request body — NOT `resolver()` (resolver is response-only in hono-openapi v1.3.0)
- `resolver(successEnvelope(RecipeDetailOutputSchema))` for 201 response
- `resolver(ErrorEnvelopeSchema)` for all error responses
- `success(c, data, 201)` and `error(c, code, message, status)` from `apps/api/src/utils/response/index.ts`
- `zodValidationHook` from `apps/api/src/utils/response/index.ts` (line ~151)

**New imports in `index.ts`:** `RecipeMergeSchema` from `@brewform/shared/schemas`. `isEmailVerified` is already imported (line 31).

**Route placement:** The `/merge` route MUST be registered BEFORE the `/:id` param routes to avoid
`merge` being captured as an `:id` parameter. Place it after `POST /` (create) and before
`GET /:slugOrId`.

#### Scenario: POST /recipes/merge returns 201 with success envelope

- **WHEN** an authenticated user POSTs a valid `RecipeMerge` payload to `/api/v1/recipes/merge`
- **THEN** the response is 201 with `{ success: true, data: { id, title, visibility: 'draft', versions: [...], author: {...} } }`

#### Scenario: POST /recipes/merge returns 401 without auth

- **WHEN** an unauthenticated request is made to `/api/v1/recipes/merge`
- **THEN** the response is 401 with `{ success: false, error: { code: 'UNAUTHORIZED', ... } }`

#### Scenario: POST /recipes/merge returns 403 when email not verified

- **WHEN** an authenticated user with unverified email POSTs a valid payload to `/api/v1/recipes/merge`
- **THEN** the response is 403 with `{ success: false, error: { code: 'EMAIL_NOT_VERIFIED', ... } }`

#### Scenario: POST /recipes/merge returns 404 for missing version

- **WHEN** an authenticated user POSTs with a non-existent `recipeVersionId1`
- **THEN** the response is 404 with `{ success: false, error: { code: 'NOT_FOUND', message: 'Recipe not found', ... } }`

#### Scenario: POST /recipes/merge returns 400 for invalid payload

- **WHEN** an authenticated user POSTs `{ title: '' }` (missing required fields)
- **THEN** the response is 400 with `{ success: false, error: { code: 'VALIDATION_ERROR', ... } }`

#### Scenario: OpenAPI spec includes the merge route

- **WHEN** `GET /api/v1/openapi.json` is fetched
- **THEN** the spec includes `POST /api/v1/recipes/merge` with `tags: ['Recipes']`, a `requestBody`, and `responses` for 201, 400, 401, 404

#### Scenario: OpenAPI coverage test passes

- **WHEN** `make test-specific filter=openapi.coverage.test.ts` runs
- **THEN** the merge route is documented, tagged with `Recipes`, and no orphan tags exist

---

### Requirement: DiffHighlighter frontend component

The system SHALL create `apps/web/src/components/recipe/DiffHighlighter.tsx`:

```tsx
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

**Design notes:**
- Three-column grid: value1 | label | value2
- When values differ: row gets a highlight background (`--diff-highlight` CSS var) and values use accent colors
- When values are identical: neutral styling
- `formatter` prop allows enum display values (e.g. `labelFor(BREW_METHODS, val)`)
- Uses existing `useTranslation` hook from `apps/web/src/contexts/I18nContext.tsx`
- Uses existing CSS variables (`--border-primary`, `--text-primary`, `--text-secondary`, `--accent-primary`, `--accent-secondary`)
- This component is also used by F09 (version diff) — keep it generic

#### Scenario: DiffHighlighter highlights differing values

- **WHEN** `<DiffHighlighter labelKey="recipe.dose" value1={18} value2={20} />` is rendered
- **THEN** the row has `backgroundColor` set to the diff highlight color
- **AND** value1 is styled with `--accent-primary` color
- **AND** value2 is styled with `--accent-secondary` color

#### Scenario: DiffHighlighter does not highlight identical values

- **WHEN** `<DiffHighlighter labelKey="recipe.dose" value1={18} value2={18} />` is rendered
- **THEN** the row has `backgroundColor: 'transparent'`
- **AND** both values use `--text-primary` color

#### Scenario: DiffHighlighter uses formatter when provided

- **WHEN** `<DiffHighlighter labelKey="recipe.brewMethod" value1="v60" value2="aeropress" formatter={(v) => labelFor(BREW_METHODS, v)} />` is rendered
- **THEN** the displayed values are the human-readable labels (e.g. "V60", "AeroPress"), not the raw enum values

#### Scenario: DiffHighlighter shows dash for null values

- **WHEN** `<DiffHighlighter labelKey="recipe.grindSize" value1={null} value2="medium" />` is rendered
- **THEN** value1 displays `'-'`
- **AND** the row is highlighted (values differ)

---

### Requirement: MergeSelector frontend component

The system SHALL create `apps/web/src/components/recipe/MergeSelector.tsx`:

```tsx
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

**Design notes:**
- Radio buttons per field: v1 or v2 (the "both"/"none" options for array fields are handled by the page passing appropriate field configs or by extending the component later if needed)
- Unselected fields default to v1 on the server side (the schema marks all selections as optional)
- Uses existing `card` and `btn-primary` CSS classes from the app's design system
- All strings use `t()` for i18n

#### Scenario: MergeSelector renders radio buttons for each field

- **WHEN** `<MergeSelector fields={[{ key: 'brewMethod', labelKey: 'recipe.brewMethod', value1: 'v60', value2: 'aeropress' }]} onMerge={fn} />` is rendered
- **THEN** a radio group named `brewMethod` with two options is displayed
- **AND** the label shows the translated `recipe.brewMethod` string

#### Scenario: MergeSelector calls onMerge with selections

- **WHEN** the user selects v1 for `brewMethod` and v2 for `grindSize`, then clicks "Create Merged Recipe"
- **THEN** `onMerge` is called with `{ brewMethod: 'v1', grindSize: 'v2' }`

#### Scenario: MergeSelector calls onMerge with empty object when nothing selected

- **WHEN** the user clicks "Create Merged Recipe" without selecting anything
- **THEN** `onMerge` is called with `{}`

---

### Requirement: Updated RecipeComparePage with diff highlighting and merge flow

The system SHALL update `apps/web/src/pages/recipes/RecipeComparePage.tsx`:

1. **Replace `CompareRow` with `DiffHighlighter`:** The existing private `CompareRow` component
   (a simple `<tr>` with label/value) SHALL be replaced by `DiffHighlighter` rows that visually
   mark differences. The `CompareTable` function SHALL build a fields array and map over it with
   `DiffHighlighter`.

2. **Add merge flow:** A "Merge Recipes" button (visible when both recipes are loaded) opens the
   `MergeSelector`. On merge submission, call `recipeApi.merge(...)` and navigate to the new
   recipe's edit page.

3. **Preserve existing enum display:** Continue using `labelFor(BREW_METHODS, val)` and
   `labelFor(DRINK_TYPES, val)` for human-readable enum values, passed as the `formatter` prop
   to `DiffHighlighter`.

**Structural changes:**

```tsx
import { DiffHighlighter } from '../../components/recipe/DiffHighlighter.tsx';
import { MergeSelector } from '../../components/recipe/MergeSelector.tsx';
import { recipeApi } from '../../api/index.ts';
import { useNavigate } from 'react-router-dom';

// In CompareTable — replace CompareRow usage:
function CompareTable({ v1, v2 }: { v1: RecipeDetailVersionOutput; v2: RecipeDetailVersionOutput }) {
  const { t } = useTranslation();
  const fields = [
    { key: 'brewMethod', labelKey: 'recipe.brewMethod', v1: v1.brewMethod, v2: v2.brewMethod, formatter: (v) => labelFor(BREW_METHODS, v) },
    { key: 'drinkType', labelKey: 'recipe.drinkType', v1: v1.drinkType, v2: v2.drinkType, formatter: (v) => labelFor(DRINK_TYPES, v) },
    { key: 'groundWeightGrams', labelKey: 'recipe.dose', v1: v1.groundWeightGrams, v2: v2.groundWeightGrams },
    { key: 'extractionVolumeMl', labelKey: 'recipe.yield', v1: v1.extractionVolumeMl, v2: v2.extractionVolumeMl },
    { key: 'extractionTimeSeconds', labelKey: 'recipe.time', v1: v1.extractionTimeSeconds, v2: v2.extractionTimeSeconds },
    { key: 'temperatureCelsius', labelKey: 'recipe.temperature', v1: v1.temperatureCelsius, v2: v2.temperatureCelsius },
    { key: 'grindSize', labelKey: 'recipe.grindSize', v1: v1.grindSize, v2: v2.grindSize },
  ];

  return (
    <div className="space-y-1">
      {fields.map((f) => (
        <DiffHighlighter key={f.key} labelKey={f.labelKey} value1={f.v1} value2={f.v2} formatter={f.formatter} />
      ))}
    </div>
  );
}

// In RecipeComparePage — merge flow:
const [showMerge, setShowMerge] = useState(false);
const [mergeError, setMergeError] = useState<string | null>(null);
const navigate = useNavigate();

async function handleMerge(selections: Record<string, 'v1' | 'v2' | 'both' | 'none'>) {
  setMergeError(null);
  try {
    const merged = await recipeApi.merge({
      recipeVersionId1: recipe1.currentVersion.id,
      recipeVersionId2: recipe2.currentVersion.id,
      title: `${recipe1.title} + ${recipe2.title}`,
      selections,
    });
    navigate(`/recipes/${merged.id}/edit`);
  } catch (err) {
    log.error({ err }, 'handleMerge failed');
    setMergeError(err instanceof Error ? err.message : 'Merge failed');
  }
}

// Render:
{recipe1 && recipe2 && (
  <button className="btn-primary" onClick={() => setShowMerge(true)}>
    {t('merge.button')}
  </button>
)}
{showMerge && recipe1 && recipe2 && (
  <MergeSelector fields={mergeFields} onMerge={handleMerge} />
)}
```

**Existing page structure (for context):** The current `RecipeComparePage` fetches two recipes by
slug (`:slug1`, `:slug2` URL params) via `recipeApi.get(slug)` in parallel, renders a two-column
grid with a `CompareTable` per recipe. The page uses `useTranslation()` and `labelFor()` from
`@brewform/shared/constants`. The private `CompareRow` is a `<tr>` with two `<td>` cells.

#### Scenario: Differing parameters are highlighted on the compare page

- **WHEN** a user navigates to `/compare/slug1/slug2` where the two recipes have different `groundWeightGrams`
- **THEN** the dose row has a highlighted background and accent-colored values

#### Scenario: Identical parameters are not highlighted

- **WHEN** both recipes have the same `temperatureCelsius`
- **THEN** the temperature row has a transparent background and neutral text color

#### Scenario: Merge button is visible when both recipes are loaded

- **WHEN** both recipes have been fetched successfully
- **THEN** a "Merge Recipes" button is rendered

#### Scenario: Merge creates a draft and navigates to edit

- **WHEN** the user selects parameters and clicks "Create Merged Recipe"
- **THEN** `recipeApi.merge(...)` is called with the correct version IDs and selections
- **AND** the user is navigated to `/recipes/${newRecipeId}/edit`

#### Scenario: Page logging

- **WHEN** `RecipeComparePage` mounts
- **THEN** a debug log `'RecipeComparePage mounted'` is emitted via `createLogger('RecipeComparePage')`
- **AND** on unmount, `'RecipeComparePage unmounted'` is logged

---

### Requirement: Frontend API client method for merge

The system SHALL add a `merge` method to the `recipeApi` object in `apps/web/src/api/index.ts`:

```ts
merge: (body: RecipeMerge) =>
  api.post<RecipeMerge, RecipeDetailOutput>('/recipes/merge', body),
```

Import `RecipeMerge` and `RecipeDetailOutput` from `@brewform/shared/schemas`.

**Pattern:** Matches existing methods like `create: (data: RecipeCreate) => api.post<RecipeDetailOutput>('/recipes', data)`. The `api` client auto-unwraps the success envelope, so the generic type is the `data` payload type.

#### Scenario: recipeApi.merge returns a typed RecipeDetailOutput

- **WHEN** `recipeApi.merge({ recipeVersionId1, recipeVersionId2, title, selections })` is called
- **THEN** the return type is `RecipeDetailOutput` (envelope auto-unwrapped)

---

### Requirement: i18n keys for merge UI

The system SHALL add these keys to `packages/shared/src/i18n/en.json`:

```json
{
  "merge.selectParams": "Select Parameters to Keep",
  "merge.create": "Create Merged Recipe",
  "merge.button": "Merge Recipes"
}
```

The system SHALL add these keys to `packages/shared/src/i18n/tr.json`:

```json
{
  "merge.selectParams": "Korunacak Parametreleri Seçin",
  "merge.create": "Birleştirilmiş Tarif Oluştur",
  "merge.button": "Tarifleri Birleştir"
}
```

Existing `recipe.*` keys (`recipe.brewMethod`, `recipe.drinkType`, `recipe.dose`, `recipe.yield`,
`recipe.time`, `recipe.temperature`, `recipe.grindSize`) are already present and SHALL be reused
for `DiffHighlighter` labels — do NOT duplicate them.

#### Scenario: All merge i18n keys resolve in both locales

- **WHEN** `t('merge.selectParams')` is called with locale `en`
- **THEN** it returns `"Select Parameters to Keep"`
- **WHEN** `t('merge.selectParams')` is called with locale `tr`
- **THEN** it returns `"Korunacak Parametreleri Seçin"`

---

### Requirement: CSS variable for diff highlighting

The system SHALL add a `--diff-highlight` CSS custom property to `apps/web/src/styles/globals.css`
in all three theme blocks (`:root`, `.dark`, `.coffee`):

```css
/* In :root */
--diff-highlight: rgba(255, 200, 0, 0.1);

/* In .dark */
--diff-highlight: rgba(255, 200, 0, 0.15);

/* In .coffee */
--diff-highlight: rgba(255, 200, 0, 0.12);
```

The `DiffHighlighter` component uses `var(--diff-highlight, rgba(255, 200, 0, 0.1))` with a
fallback, so the feature works even if the variable is not yet defined. Adding the variable allows
theme customization.

#### Scenario: Diff highlight variable is defined

- **WHEN** the app's root CSS is inspected
- **THEN** `--diff-highlight` is defined with a semi-transparent yellow value

---

### Requirement: Structured logging

The system SHALL follow the project's logging conventions (AGENTS.md):

**API service (`apps/api/src/modules/recipe/service.ts`):**
- The existing module-scoped `log = createLogger('recipe-service')` (or equivalent) SHALL be used.
- `mergeRecipes` entry: `log.debug({ authorId }, 'mergeRecipes started')`
- `mergeRecipes` exit: `log.debug({ authorId, recipeId }, 'mergeRecipes completed')`
- `mergeRecipes` error: `log.error({ err, authorId }, 'mergeRecipes failed')`
- Logs SHALL NOT include the merge payload (may contain `personalNotes`).

**Frontend page (`RecipeComparePage.tsx`):**
- `const log = createLogger('RecipeComparePage')` at module scope (import from `@/utils/logger.ts`)
- Mount/unmount `useEffect` with `log.debug({}, 'RecipeComparePage mounted')` / `'unmounted'`

#### Scenario: Service logs entry and exit without payload

- **WHEN** `mergeRecipes('user-1', mergePayload)` is called
- **THEN** a debug log `'mergeRecipes started'` with `{ authorId: 'user-1' }` is emitted
- **AND** a debug log `'mergeRecipes completed'` with `{ authorId: 'user-1', recipeId }` is emitted
- **AND** neither log includes `mergePayload` or `personalNotes`

---

### Requirement: Test coverage (>=85% for new code)

The system SHALL create these test files:

**Shared schema tests** — `packages/shared/src/schemas/recipe.merge.test.ts`:
- `RecipeMergeSchema` valid payload (all selections)
- `RecipeMergeSchema` valid payload (empty selections)
- Rejects invalid UUID
- Rejects empty title
- Rejects title > 200 chars
- Rejects invalid selection enum value (`'v3'`)
- Accepts `'both'` and `'none'` for array fields
- Rejects `'both'` for scalar fields (only `'v1'`/`'v2'` allowed)

**API service tests** — `apps/api/src/modules/recipe/merge.test.ts`:
- `mergeRecipes` creates a draft recipe with correct field picks
- `mergeRecipes` picks v2 fields when selected
- `mergeRecipes` deduplicates taste notes with `'both'`
- `mergeRecipes` returns empty arrays for `'none'`
- `mergeRecipes` throws `RECIPE_NOT_FOUND` for missing version
- `mergeRecipes` falls back to v1 for unselected required fields
- `getMergedIds` unit tests (v1, v2, both, none, undefined)
- `getMergedPreparations` unit tests (v1, v2, both, none, undefined)

**API route tests** — `apps/api/src/modules/recipe/merge.route.test.ts`:
- `POST /api/v1/recipes/merge` returns 201 with success envelope
- Returns 401 without auth token
- Returns 403 when email is not verified
- Returns 404 for non-existent version ID
- Returns 400 for invalid payload (missing title)

**Frontend component tests:**
- `apps/web/src/components/recipe/DiffHighlighter.test.tsx`:
  - Highlights differing values (background + accent colors)
  - Does not highlight identical values
  - Uses formatter when provided
  - Shows dash for null values
- `apps/web/src/components/recipe/MergeSelector.test.tsx`:
  - Renders radio buttons for each field
  - Calls onMerge with selections on button click
  - Calls onMerge with empty object when nothing selected

**Test patterns (per AGENTS.md and existing tests):**
- Framework: `jsr:@std/testing/bdd` (`describe`/`it`) + `jsr:@std/expect` (API tests)
- Frontend: Vitest + React Testing Library (matching existing `*.test.tsx` files)
- API tests: `import '../../test-setup.ts'` first line, `describe` options `{ sanitizeOps: false, sanitizeResources: false }`, `beforeEach`/`afterEach` with `crypto.randomUUID()` IDs, child-first `db.delete` cleanup
- Test files use `*.test.ts` / `*.test.tsx` naming (never `*_test.ts`)
- Tests run with `--no-check` (type-checking done separately)
- DB-backed tests target `brewform_test` database

#### Scenario: All new tests pass

- **WHEN** `make test` runs
- **THEN** all new test files pass with zero failures

#### Scenario: Coverage meets threshold

- **WHEN** coverage is measured for new files (`DiffHighlighter.tsx`, `MergeSelector.tsx`, `mergeRecipes` in service.ts, `fetchRecipeVersionWithRelations` in model.ts)
- **THEN** line coverage is >=85% for each new file/function

---

### Requirement: All verification commands pass

After implementation, the project's verification commands SHALL all pass with zero errors:

```
make fmt && make check && make lint && make test
```

Specifically:
- `make check` — type-check all workspaces (api, web, shared, db)
- `make lint` — lint all apps and packages
- `make fmt` — `deno fmt` (lineWidth 100, indentWidth 2, singleQuote, semiColons)
- `make test` — all tests pass
- OpenAPI coverage test passes (merge route is documented)

#### Scenario: Full gate is green

- **WHEN** `make fmt && make check && make lint && make test` is run
- **THEN** every command exits 0 with no errors and no warnings

---

## Files Modified

| File | Change |
|------|--------|
| `packages/shared/src/schemas/recipe.ts` | Add `RecipeMergeSchema` + `RecipeMerge` type |
| `packages/shared/src/schemas/index.ts` | Export `RecipeMergeSchema`, `RecipeMerge` |
| `packages/shared/src/i18n/en.json` | Add `merge.*` keys (3 keys) |
| `packages/shared/src/i18n/tr.json` | Add `merge.*` keys (3 keys) |
| `apps/api/src/modules/recipe/model.ts` | Add `fetchRecipeVersionWithRelations` |
| `apps/api/src/modules/recipe/service.ts` | Add `mergeRecipes` + `getMergedIds` + `getMergedPreparations` |
| `apps/api/src/modules/recipe/index.ts` | Add `POST /merge` route with OpenAPI docs |
| `apps/web/src/api/index.ts` | Add `recipeApi.merge(...)` method |
| `apps/web/src/pages/recipes/RecipeComparePage.tsx` | Diff highlighting + merge flow |
| Theme CSS file | Add `--diff-highlight` variable |

## Files Created

| File | Description |
|------|-------------|
| `apps/web/src/components/recipe/DiffHighlighter.tsx` | Diff row component (reused by F09) |
| `apps/web/src/components/recipe/MergeSelector.tsx` | Merge parameter selector |
| `packages/shared/src/schemas/recipe.merge.test.ts` | Schema validation tests |
| `apps/api/src/modules/recipe/merge.test.ts` | Service + model unit tests |
| `apps/web/src/components/recipe/DiffHighlighter.test.tsx` | Component tests |
| `apps/web/src/components/recipe/MergeSelector.test.tsx` | Component tests |

## Dependencies (all existing)

- `RecipeComparePage` at `apps/web/src/pages/recipes/RecipeComparePage.tsx`
- `recipeVersions` table with Drizzle relations (`packages/db/src/schema.ts`)
- `createRecipe` service function (returns `RecipeDetailOutput` shape)
- `authGuard`, `zodValidationHook`, `success`, `error` from `apps/api/src/utils/response/index.ts`
- `RecipeDetailOutputSchema` from `packages/shared/src/schemas/responses/recipe.ts`
- `recipeApi` typed client in `apps/web/src/api/index.ts`
- `useTranslation` hook from `apps/web/src/contexts/I18nContext.tsx`
- `labelFor` + `BREW_METHODS`/`DRINK_TYPES` from `@brewform/shared/constants`
- `describeRoute`, `resolver` from `hono-openapi`
- `jsonRequestBody` from `apps/api/src/utils/openapi/index.ts`
- `createLogger` from `apps/api/src/utils/logger/index.ts` (API) and `@/utils/logger.ts` (web)
