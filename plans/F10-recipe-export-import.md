# F10 — Recipe Export / Import

> **Validation status (2026-08-13): refreshed — corrections below**
>
> **Note:** The body below this line is the pre-refresh draft (it includes an earlier 2026-07-13 banner whose line numbers have since drifted); treat the corrections below as authoritative. F10 is NOT shipped — no export/import routes in `apps/api/src/modules/recipe/index.ts`, no `exportRecipeAsJson` in `service.ts`, no `RecipeImportPage.tsx`, no `recipeApi.export`/`import` in `apps/web/src/api/index.ts`, no `/recipes/import` router entry.
>
> - **Import endpoint is redundant — skip it.** `POST /recipes` (apps/api/src/modules/recipe/index.ts:595-643) already validates `RecipeCreateSchema` via `zValidator('json', ..., zodValidationHook)` (:627), gates on `isEmailVerified` (:629), calls `service.createRecipe`, and returns `success(c, r, 201)` documented as `resolver(successEnvelope(RecipeDetailOutputSchema))`. Zod strips unknown keys (`_exportedAt`/`_exportVersion`/`_sourceSlug`) by default, so import = call the existing `recipeApi.create` (apps/web/src/api/index.ts:97) with the parsed file. Only add `POST /recipes/import` if a genuinely distinct contract appears.
> - **Export field list is stale.** `RecipeCreateObjectSchema` (packages/shared/src/schemas/recipe.ts:24-59) now also accepts `vendorId`, `roastDate`, `packageOpenDate`, `grindDate`, `brewDate`, `isFavourite`, `beanId`, `tasteNoteIntensities`, `setupId`; the plan's export omits all of them. Derive the export list from the current create schema, but note not all of these are stored: `vendorId`, `roastDate`, `packageOpenDate`, `grindDate`, `brewDate`, `isFavourite`, `beanId` are real `recipeVersions` columns (packages/db/src/schema.ts:211-235) and surface on `RecipeDetailVersionOutputSchema` (packages/shared/src/schemas/responses/recipe.ts:195-204, derived from `RecipeVersionRowSchema` at :63-98), so both the server-side and client-side export paths can include them. `tasteNoteIntensities` is join-table data (`recipe_taste_note.intensity`, packages/db/src/schema.ts:277) surfaced via `versions[].tasteNotes[].intensity` — exportable via relations, not a version column. `setupId` is NOT exportable: transient create-time input consumed at apps/api/src/modules/recipe/service.ts:177-178 to inherit `grinder`/`brewerDetails` from the user's setup, never stored.
> - **`additionalPreparations` IS exportable.** The plan skips it claiming "IDs are user-specific", but `recipe_additional_preparation` (packages/db/src/schema.ts:317) stores inline data (name/type/inputAmount/preparationType) matching `AdditionalPreparationSchema` (packages/shared/src/schemas/recipe.ts:16-21), not catalogue references. Skipping `tasteNoteIds`/`equipmentIds` (shared-catalogue UUIDs) remains a defensible choice.
> - **`service.getRecipe` throws, never returns null** (apps/api/src/modules/recipe/service.ts:61-72 throws `RECIPE_NOT_FOUND`) — the planned `if (!recipe)` null check is dead code; keep only the catch. The shape claim still holds: `versions` ordered by `versionNumber` DESC with no `currentVersion` (model.ts:301-347), so resolve via `versions.find(v => v.id === recipe.currentVersionId)` rather than `versions?.[0]`.
> - **Visibility gate:** reuse the canonical `service.canViewRecipe(recipe, userId)` (service.ts:767; used at index.ts:377,460,510,542) instead of the inline `visibility !== 'public'` + authorId check. Note it also permits `unlisted` recipes and (optionally) admins.
> - **Response-envelope conflict stands.** The planned export returns raw `c.json(exportData)`, but the web client unwraps the success envelope's `.data` (apps/web/src/api/client.ts:83-87) — wrap in `success()` or download via a raw fetch/Blob. Also, `describeRoute` responses must carry `resolver(successEnvelope(...))` / `resolver(ErrorEnvelopeSchema)` schemas and request bodies must use `jsonRequestBody()` (see POST /recipes, index.ts:597-625); the plan's bare `{ description }` responses fail the OpenAPI coverage test (apps/api/src/routes/openapi.coverage.test.ts).
> - **D42 still applies:** `apps/web/src/api/types.ts` remains deleted; type any new `recipeApi` methods with z.infer types from `@brewform/shared/schemas` (`RecipeCreate` for the import payload, `RecipeDetailOutput` for the result).
> - **i18n moved to shared.** Translations live in packages/shared/src/i18n/{en,tr}.json (consumed via `@brewform/shared/i18n`, see apps/web/src/contexts/I18nContext.tsx), not in apps/web. `recipe.export` already exists in both (en.json:131, tr.json:131) but is unused; `recipe.print` is already used (RecipeDetailPage.tsx:208). Add any new keys (Download JSON, Import Recipe, Preview, …) to BOTH shared JSON files.
> - **bodyLimit already enforced (D24 shipped):** global 1MB JSON limit via apps/api/src/middleware/bodyLimit.ts, registered in apps/api/src/main.ts:74 — covers the import body; nothing to add.
> - **Print button already exists** in the header action row (RecipeDetailPage.tsx:202-209, i18n key `recipe.print`), and the sidebar is marked `no-print` (:318). Don't add a second print button to the export card — it only needs "Download JSON".
> - **Stale line numbers in the 2026-07-13 banner:** `recipesRelations` is now at packages/db/src/schema.ts:1057 (was :997; still only `versions: many()` at :1062 plus the `currentVersionId` column at :138); GET /:slugOrId composes `currentVersion = versions[0]` at index.ts:551 (was :326); RecipeDetailPage `const v = recipe.currentVersion` at :121 (was :115) and ShareSection at :320 (was :314); `ApiError.details` at client.ts:99 (was :85).
> - Conventions unchanged and still binding: no raw SQL / no Postgres-specific operators, soft deletes, `*.test.ts` with jsr:@std/testing/bdd + @std/expect, structured logging (module logger `createLogger('recipe-service')` already exists at service.ts:50), and `make check && make lint && make test` plus `make fmt` before commit.

> **Validation status (2026-07-13): ⚠️ Outdated — corrections below**
>
> - Still stale (plan ~139): server-side `exportRecipeAsJson(recipe)` receives `service.getRecipe`'s shape (model.findBySlug/findById → `versions` ordered desc, NO `currentVersion`; recipesRelations still has only `versions: many()` + the `currentVersionId` column, schema.ts:120,997). So `recipe.currentVersion` is undefined server-side and it falls through to `versions?.[0]` — which happens to be the current version but is fragile; resolve via `versions.find(v => v.id === recipe.currentVersionId)`. (The FRONTEND `handleExportJson` uses `v = recipe.currentVersion`, which IS valid because the API response composes `currentVersion = versions[0]` at recipe/index.ts:326.)
> - Verified: RecipeDetailPage has `ShareSection` (:314) and an existing `globalThis.print()` button (:198) — the "print needs no extra work" claim holds; `const v = recipe.currentVersion` at :115. `ApiError.details` is `{ field, message }[]` (client.ts:85), matching the import error handler.
> - NEW — D42: `api/types.ts` is DELETED. Type `recipeApi.export`/`recipeApi.import` (import should return `RecipeDetailOutput` so `result.slug` isn't an untyped cast). Also the export endpoint returns RAW `c.json(exportData)` with no success envelope, but the web `api.get` unwraps `.data` — reconcile (use `success(c, exportData)`, or a raw fetch). Latent today since the export button builds JSON client-side rather than calling `recipeApi.export`.
> - NEW — D40 i18n: export-card + import-page strings ("Export"/"Download JSON"/"Print / PDF"/"Import Recipe"/"Preview"/…) must be added to both en.json + tr.json (RecipeImportPage imports `useTranslation` but then hardcodes English).

## Overview

Export recipes as JSON or PDF, share via link, and import from JSON. No new database tables — extends existing recipe API with export/import endpoints and adds client-side PDF generation.

## Goals

- Let users download recipe data as JSON for backup or sharing
- Let users print recipes as PDF via browser print or client-side generation
- Let users import recipes from JSON files
- Validate imported recipes through the same Zod schema as creation
- Provide shareable links for public recipes

## User Stories

1. **As a user**, I want to export a recipe as JSON so I can back it up or share the data.
2. **As a user**, I want to export a recipe as PDF so I can print it or save it offline.
3. **As a user**, I want to import a recipe from a JSON file so I can restore a backup or use someone else's recipe.
4. **As a user**, I want a shareable link that shows the recipe in a read-only view.

## Technical Design

### No New Tables

Uses existing `recipe` and `recipe_version` tables.

### API Endpoints

#### Export JSON

Add to `apps/api/src/modules/recipe/index.ts`:

```ts
recipe.get(
  '/:slug/export',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Export recipe as JSON',
    description: 'Returns the recipe data in a JSON format matching RecipeCreateInput.',
    responses: {
      200: { description: 'Recipe JSON' },
      404: { description: 'Recipe not found' },
    },
  }),
  optionalAuthMiddleware,
  async (c) => {
    const { slug } = c.req.param();
    const format = c.req.query('format') ?? 'json';

    try {
      const recipe: any = await service.getRecipe(slug);
      if (!recipe) return error(c, 'NOT_FOUND', 'Recipe not found', 404);

      if (recipe.visibility !== 'public') {
        const userId = c.get('userId');
        if (userId !== recipe.authorId) {
          return error(c, 'NOT_FOUND', 'Recipe not found', 404);
        }
      }

      if (format === 'json') {
        const exportData = service.exportRecipeAsJson(recipe);
        return c.json(exportData);
      }

      return error(c, 'VALIDATION_ERROR', 'Unsupported format. Use ?format=json', 400);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
      throw err;
    }
  },
);
```

#### Import JSON

```ts
recipe.post(
  '/import',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Import a recipe from JSON',
    description: 'Accepts a JSON body matching RecipeCreateInput and creates a new recipe.',
    security: [{ bearerAuth: [] }],
    responses: {
      201: { description: 'Recipe imported' },
      400: { description: 'Invalid recipe data' },
      401: { description: 'Unauthorized' },
    },
  }),
  authMiddleware,
  async (c) => {
    if (!isEmailVerified(c)) {
      return error(c, 'EMAIL_NOT_VERIFIED', 'Please verify your email to perform this action', 403);
    }

    const authorId = c.get('userId') as string;
    const body = await c.req.json();

    // Validate with the same schema as recipe creation
    const parsed = RecipeCreateSchema.safeParse(body);
    if (!parsed.success) {
      return error(c, 'VALIDATION_ERROR', parsed.error.issues.map((i) => i.message).join(', '), 400);
    }

    try {
      const recipe = await service.createRecipe(authorId, parsed.data);
      return success(c, recipe, 201);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('VALIDATION_ERROR')) {
        return error(c, 'VALIDATION_ERROR', message, 400);
      }
      throw err;
    }
  },
);
```

### Service: Export Logic

Add to `apps/api/src/modules/recipe/service.ts`:

```ts
/**
 * Transform a loaded recipe into a JSON export format matching RecipeCreateInput.
 *
 * This strips server-only fields (id, slug, authorId, timestamps, counts)
 * and returns a clean payload that can be imported via POST /recipes/import.
 */
export function exportRecipeAsJson(recipe: any) {
  const v = recipe.currentVersion ?? recipe.versions?.[0];

  return {
    // Metadata (for reference, not imported)
    _exportedAt: new Date().toISOString(),
    _exportVersion: '1.0',
    _sourceSlug: recipe.slug,

    // Importable fields (matches RecipeCreateInput)
    title: recipe.title,
    visibility: 'draft', // Imported recipes default to draft
    brewMethod: v?.brewMethod,
    drinkType: v?.drinkType,
    productName: v?.productName ?? undefined,
    coffeeBrand: v?.coffeeBrand ?? undefined,
    coffeeProcessing: v?.coffeeProcessing ?? undefined,
    grinder: v?.grinder ?? undefined,
    grindSize: v?.grindSize ?? undefined,
    brewerDetails: v?.brewerDetails ?? undefined,
    groundWeightGrams: v?.groundWeightGrams ?? undefined,
    extractionTimeSeconds: v?.extractionTimeSeconds ?? undefined,
    extractionVolumeMl: v?.extractionVolumeMl ?? undefined,
    temperatureCelsius: v?.temperatureCelsius ?? undefined,
    brewRatio: v?.brewRatio ?? undefined,
    flowRate: v?.flowRate ?? undefined,
    preInfusionTimeSeconds: v?.preInfusionTimeSeconds ?? undefined,
    tds: v?.tds ?? undefined,
    preparationNotes: v?.preparationNotes ?? '',
    personalNotes: v?.personalNotes ?? undefined,
    rating: v?.rating ?? undefined,
    emojiTag: v?.emojiTag ?? undefined,
    // Note: tasteNoteIds, equipmentIds, additionalPreparations
    // are not exported by reference — IDs are user-specific
  };
}
```

### Frontend: Export Button

Add to `apps/web/src/pages/recipes/RecipeDetailPage.tsx` sidebar:

```tsx
// In the sidebar, below ShareSection:
<div className="card">
  <h3 className="text-sm font-semibold uppercase tracking-widest mb-3"
      style={{ color: 'var(--text-tertiary)' }}>
    Export
  </h3>
  <div className="space-y-2">
    <button
      type="button"
      onClick={handleExportJson}
      className="btn-secondary w-full text-sm"
    >
      Download JSON
    </button>
    <button
      type="button"
      onClick={() => globalThis.print()}
      className="btn-secondary w-full text-sm"
    >
      Print / PDF
    </button>
  </div>
</div>
```

```tsx
// Handler function:
function handleExportJson() {
  if (!recipe) return;
  const exportData = {
    _exportedAt: new Date().toISOString(),
    _exportVersion: '1.0',
    _sourceSlug: recipe.slug,
    title: recipe.title,
    visibility: 'draft',
    brewMethod: v.brewMethod,
    drinkType: v.drinkType,
    productName: v.productName,
    coffeeBrand: v.coffeeBrand,
    coffeeProcessing: v.coffeeProcessing,
    grinder: v.grinder,
    grindSize: v.grindSize,
    brewerDetails: v.brewerDetails,
    groundWeightGrams: v.groundWeightGrams,
    extractionTimeSeconds: v.extractionTimeSeconds,
    extractionVolumeMl: v.extractionVolumeMl,
    temperatureCelsius: v.temperatureCelsius,
    brewRatio: v.brewRatio,
    flowRate: v.flowRate,
    preInfusionTimeSeconds: v.preInfusionTimeSeconds,
    tds: v.tds,
    preparationNotes: v.preparationNotes,
    personalNotes: v.personalNotes,
    rating: v.rating,
    emojiTag: v.emojiTag,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${recipe.slug}-export.json`;
  a.click();
  URL.revokeObjectURL(url);
}
```

### Frontend: Import Page

```tsx
// apps/web/src/pages/recipes/RecipeImportPage.tsx
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import { recipeApi } from '../../api/index.ts';
import { ApiError } from '../../api/client.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';

export function RecipeImportPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setError('Please select a JSON file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        setPreview(data);
        setError('');
      } catch {
        setError('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!preview) return;
    setLoading(true);
    setError('');

    try {
      // Strip export metadata
      const { _exportedAt, _exportVersion, _sourceSlug, ...importData } = preview;
      const result = await recipeApi.import(importData) as Record<string, unknown>;
      navigate(`/recipes/${result.slug}`);
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        setError(err.details.map((d) => `${d.field}: ${d.message}`).join('\n'));
      } else {
        setError(err instanceof Error ? err.message : 'Import failed');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <SEOHead title="Import Recipe" />
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        Import Recipe
      </h1>

      {error && (
        <div className="mb-4 rounded p-3 text-sm"
             style={{ backgroundColor: 'var(--error)', color: 'white' }}>
          {error}
        </div>
      )}

      <div className="card space-y-4">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Upload a BrewForm JSON export to create a new recipe draft.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="input-field"
        />

        {preview && (
          <div className="rounded-lg p-4 space-y-2"
               style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>
              Preview
            </h3>
            <div className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
              <p><strong>Title:</strong> {(preview as any).title || 'Untitled'}</p>
              <p><strong>Brew Method:</strong> {(preview as any).brewMethod || '-'}</p>
              <p><strong>Drink Type:</strong> {(preview as any).drinkType || '-'}</p>
              {(preview as any).groundWeightGrams && (
                <p><strong>Dose:</strong> {(preview as any).groundWeightGrams}g</p>
              )}
              {(preview as any).extractionVolumeMl && (
                <p><strong>Yield:</strong> {(preview as any).extractionVolumeMl}ml</p>
              )}
              {(preview as any)._sourceSlug && (
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Source: {preview._sourceSlug}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleImport}
            disabled={!preview || loading}
            className="btn-primary"
          >
            {loading ? 'Importing...' : 'Import Recipe'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Frontend: API Client

Add to `apps/web/src/api/index.ts`:

```ts
export const recipeApi = {
  // ... existing methods ...

  async export(slug: string, format: 'json' = 'json') {
    const response = await api.get(`/recipes/${slug}/export?format=${format}`);
    return response;
  },

  async import(data: Record<string, unknown>) {
    const response = await api.post('/recipes/import', data);
    return response;
  },
};
```

### Router Changes

Add to `apps/web/src/router.tsx`:

```tsx
{
  path: 'recipes/import',
  lazy: async () => {
    const { RecipeImportPage } = await import('./pages/recipes/RecipeImportPage.tsx');
    return {
      Component: function RecipeImportPageGuarded() {
        return (
          <RequireAuth>
            <RecipeImportPage />
          </RequireAuth>
        );
      },
    };
  },
},
```

### PDF Export

Two approaches — both viable:

#### Option A: Browser Print (Recommended)

Use `window.print()` with a print-specific CSS stylesheet. This is the simplest approach and produces high-quality PDFs.

```css
/* In global CSS or component styles */
@media print {
  .no-print { display: none !important; }
  body { background: white !important; }
  .card { border: 1px solid #ddd !important; box-shadow: none !important; }
}
```

The existing "Print" button on `RecipeDetailPage` already calls `globalThis.print()`. No additional work needed.

#### Option B: Client-side PDF (Optional Enhancement)

For direct PDF download without browser print dialog:

```tsx
// apps/web/src/utils/pdf.ts
// Use jsPDF or html2canvas + jsPDF for client-side PDF generation
// This is optional — browser print covers most use cases
```

If implementing, add `jspdf` to `apps/web/package.json` dependencies.

### Shareable Links

Public recipes already have shareable URLs (`/recipes/:slug`). The `ShareSection` component handles this. No additional work needed — the export feature adds data portability on top of the existing URL sharing.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/recipes/:slug/export?format=json` | Optional | Export recipe as JSON |
| `POST` | `/api/v1/recipes/import` | Required | Import recipe from JSON |

## Frontend Components

| Component | File | Description |
|-----------|------|-------------|
| `RecipeImportPage` | `apps/web/src/pages/recipes/RecipeImportPage.tsx` | Import page with file upload and preview |

## Modifications to Existing Files

| File | Change |
|------|--------|
| `apps/api/src/modules/recipe/index.ts` | Add `GET /recipes/:slug/export` and `POST /recipes/import` |
| `apps/api/src/modules/recipe/service.ts` | Add `exportRecipeAsJson` function |
| `apps/web/src/pages/recipes/RecipeDetailPage.tsx` | Add export card to sidebar (JSON download + print) |
| `apps/web/src/api/index.ts` | Add `export` and `import` methods to `recipeApi` |
| `apps/web/src/router.tsx` | Add `/recipes/import` route |

## JSON Export Schema

```json
{
  "_exportedAt": "2026-05-29T12:00:00.000Z",
  "_exportVersion": "1.0",
  "_sourceSlug": "my-morning-espresso",
  "title": "My Morning Espresso",
  "visibility": "draft",
  "brewMethod": "espresso_machine",
  "drinkType": "espresso",
  "productName": "Ethiopian Yirgacheffe",
  "coffeeBrand": "Blue Bottle",
  "coffeeProcessing": "washed",
  "grinder": "Niche Zero",
  "grindSize": "fine",
  "brewerDetails": "58mm portafilter",
  "groundWeightGrams": 18,
  "extractionTimeSeconds": 25,
  "extractionVolumeMl": 36,
  "temperatureCelsius": 93,
  "brewRatio": 2.0,
  "flowRate": 1.44,
  "preInfusionTimeSeconds": null,
  "tds": null,
  "preparationNotes": "Preheat portafilter. Distribute and tamp evenly.",
  "personalNotes": "Bright acidity, clean finish",
  "rating": 8,
  "emojiTag": "fire"
}
```

## Acceptance Criteria

- [ ] `GET /recipes/:slug/export?format=json` returns valid JSON matching the export schema
- [ ] Export JSON includes `_exportedAt`, `_exportVersion`, `_sourceSlug` metadata
- [ ] Export JSON strips server-only fields (id, slug, authorId, timestamps, counts)
- [ ] `POST /recipes/import` validates with `RecipeCreateSchema`
- [ ] Imported recipes are created as drafts (`visibility: 'draft'`)
- [ ] Import error messages are descriptive and field-specific
- [ ] RecipeDetailPage shows "Download JSON" and "Print / PDF" buttons
- [ ] JSON download triggers browser file save dialog
- [ ] Import page shows file preview before confirming
- [ ] Import page is protected by `RequireAuth`
- [ ] PDF export works via browser print with clean layout
- [ ] Public recipes can be exported without authentication
- [ ] Private/draft recipes can only be exported by the author
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)
- [ ] All tests pass (`make test`)

## Implementation Steps

1. Add `exportRecipeAsJson` function to `apps/api/src/modules/recipe/service.ts`
2. Add `GET /recipes/:slug/export` endpoint to `apps/api/src/modules/recipe/index.ts`
3. Add `POST /recipes/import` endpoint to `apps/api/src/modules/recipe/index.ts`
4. Add `export` and `import` methods to `apps/web/src/api/index.ts`
5. Create `apps/web/src/pages/recipes/RecipeImportPage.tsx`
6. Add export card to `RecipeDetailPage` sidebar
7. Add `/recipes/import` route to `apps/web/src/router.tsx`
8. Add print CSS for clean PDF output
9. Run `make check && make lint && make test`

## Dependencies

- Existing: `RecipeCreateSchema` from `@brewform/shared/schemas` (for import validation)
- Existing: `recipeApi` from `apps/web/src/api/index.ts`
- Existing: `authMiddleware`, `optionalAuthMiddleware` from API middleware
- Existing: `ShareSection` component on `RecipeDetailPage`
- Existing: Print button and `@media print` styles
