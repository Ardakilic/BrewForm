# F09 — Recipe Version Diff View

> **Validation status (2026-07-04): ✅ Valid (depends on F08 DiffHighlighter)**
>
> - Depends on F08's shared `DiffHighlighter` component — sequence after F08 (or merge).
> - Verified: `tds` (schema.ts:199), `emojiTag` (schema.ts:211) and `formatTemperature` all exist; the page fetches versions by id, so it is unaffected by the missing `currentVersion` relation.

## Overview

Side-by-side diff between any two versions of the same recipe, showing exactly which parameters changed. Similar to a git diff but for brewing parameters. No new database tables — a new API endpoint that compares two `recipe_version` records field-by-field, and a frontend view with color-coded changes.

## Goals

- Show users exactly what changed between two versions of their recipe
- Use color-coded visual indicators (added/removed/modified)
- Provide a side-by-side layout similar to git diff tools
- Reuse the existing version history page as the entry point

## User Stories

1. **As a user**, I want to select two versions from the version history and see a diff so I understand what changed.
2. **As a user**, I want added/removed/modified parameters highlighted in different colors.
3. **As a user**, I want the diff to show the brew ratio, taste notes, and equipment changes — not just scalar fields.

## Technical Design

### No New Tables

Uses existing `recipe_version`, `recipe_taste_note`, `recipe_equipment`, and `recipe_additional_preparation` tables.

### API Endpoint

Add to `apps/api/src/modules/recipe/index.ts`:

```ts
recipe.get(
  '/:slug/versions/diff',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Diff two recipe versions',
    description: 'Returns a field-by-field diff between two versions of the same recipe.',
    responses: {
      200: { description: 'Diff payload' },
      400: { description: 'Invalid version IDs' },
      404: { description: 'Recipe or versions not found' },
    },
  }),
  optionalAuthMiddleware,
  async (c) => {
    const { slug } = c.req.param();
    const v1Id = c.req.query('v1');
    const v2Id = c.req.query('v2');

    if (!v1Id || !v2Id) {
      return error(c, 'VALIDATION_ERROR', 'v1 and v2 query parameters required', 400);
    }

    try {
      const recipe: any = await service.getRecipe(slug);
      if (!recipe) return error(c, 'NOT_FOUND', 'Recipe not found', 404);

      if (recipe.visibility === 'draft' || recipe.visibility === 'private') {
        const userId = c.get('userId');
        if (userId !== recipe.authorId) return error(c, 'NOT_FOUND', 'Recipe not found', 404);
      }

      const diff = await service.diffVersions(recipe.id, v1Id, v2Id);
      return success(c, diff);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
      if (message === 'VERSION_NOT_FOUND') return error(c, 'NOT_FOUND', 'Version not found', 404);
      throw err;
    }
  },
);
```

### Service: Diff Logic

Add to `apps/api/src/modules/recipe/service.ts`:

```ts
interface DiffField {
  field: string;
  label: string;
  value1: string | number | null;
  value2: string | number | null;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
}

interface VersionDiff {
  version1: { id: string; versionNumber: number; brewDate: Date };
  version2: { id: string; versionNumber: number; brewDate: Date };
  fields: DiffField[];
  tasteNotes: { added: string[]; removed: string[]; unchanged: string[] };
  equipment: { added: string[]; removed: string[]; unchanged: string[] };
}

export async function diffVersions(
  recipeId: string,
  v1Id: string,
  v2Id: string,
): Promise<VersionDiff> {
  logger.debug({ recipeId, v1Id, v2Id }, 'diffVersions started');

  const versions = await model.getRecipeVersionsForDiff(recipeId, [v1Id, v2Id]);
  const [version1, version2] = versions;

  if (!version1 || !version2) throw new Error('VERSION_NOT_FOUND');

  // Scalar fields to compare
  const scalarFields: { field: string; label: string }[] = [
    { field: 'brewMethod', label: 'Brew Method' },
    { field: 'drinkType', label: 'Drink Type' },
    { field: 'productName', label: 'Product Name' },
    { field: 'coffeeBrand', label: 'Coffee Brand' },
    { field: 'coffeeProcessing', label: 'Processing' },
    { field: 'grindSize', label: 'Grind Size' },
    { field: 'grinder', label: 'Grinder' },
    { field: 'brewerDetails', label: 'Brewer Details' },
    { field: 'groundWeightGrams', label: 'Dose (g)' },
    { field: 'extractionTimeSeconds', label: 'Extraction Time (s)' },
    { field: 'extractionVolumeMl', label: 'Yield (ml)' },
    { field: 'temperatureCelsius', label: 'Temperature (°C)' },
    { field: 'brewRatio', label: 'Brew Ratio' },
    { field: 'flowRate', label: 'Flow Rate' },
    { field: 'preInfusionTimeSeconds', label: 'Pre-infusion (s)' },
    { field: 'tds', label: 'TDS' },
    { field: 'preparationNotes', label: 'Preparation Notes' },
    { field: 'personalNotes', label: 'Personal Notes' },
    { field: 'rating', label: 'Rating' },
    { field: 'emojiTag', label: 'Emoji Tag' },
  ];

  const fields: DiffField[] = scalarFields.map(({ field, label }) => {
    const val1 = (version1 as any)[field];
    const val2 = (version2 as any)[field];

    let status: DiffField['status'];
    if (val1 == null && val2 == null) {
      status = 'unchanged';
    } else if (val1 == null && val2 != null) {
      status = 'added';
    } else if (val1 != null && val2 == null) {
      status = 'removed';
    } else if (val1 !== val2) {
      status = 'modified';
    } else {
      status = 'unchanged';
    }

    return { field, label, value1: val1, value2: val2, status };
  });

  // Taste notes diff
  const tn1 = new Map(version1.tasteNotes.map((tn: any) => [tn.tasteNoteId, tn.tasteNote?.name]));
  const tn2 = new Map(version2.tasteNotes.map((tn: any) => [tn.tasteNoteId, tn.tasteNote?.name]));
  const allTnIds = new Set([...tn1.keys(), ...tn2.keys()]);
  const tasteNotes = {
    added: [] as string[],
    removed: [] as string[],
    unchanged: [] as string[],
  };
  for (const id of allTnIds) {
    if (!tn1.has(id)) tasteNotes.added.push(tn2.get(id) ?? id);
    else if (!tn2.has(id)) tasteNotes.removed.push(tn1.get(id) ?? id);
    else tasteNotes.unchanged.push(tn1.get(id) ?? id);
  }

  // Equipment diff
  const eq1 = new Map(version1.equipment.map((e: any) => [e.equipmentId, e.equipment?.name]));
  const eq2 = new Map(version2.equipment.map((e: any) => [e.equipmentId, e.equipment?.name]));
  const allEqIds = new Set([...eq1.keys(), ...eq2.keys()]);
  const equipment = {
    added: [] as string[],
    removed: [] as string[],
    unchanged: [] as string[],
  };
  for (const id of allEqIds) {
    if (!eq1.has(id)) equipment.added.push(eq2.get(id) ?? id);
    else if (!eq2.has(id)) equipment.removed.push(eq1.get(id) ?? id);
    else equipment.unchanged.push(eq1.get(id) ?? id);
  }

  logger.debug({ recipeId }, 'diffVersions completed');
  return {
    version1: { id: version1.id, versionNumber: version1.versionNumber, brewDate: version1.brewDate },
    version2: { id: version2.id, versionNumber: version2.versionNumber, brewDate: version2.brewDate },
    fields,
    tasteNotes,
    equipment,
  };
}
```

### Model: New Model Functions

Add to `apps/api/src/modules/recipe/model.ts`:

```ts
/** Fetch specific recipe versions with full relations for diff comparison. */
export async function getRecipeVersionsForDiff(recipeId: string, versionIds: string[]) {
  const results = await Promise.all(
    versionIds.map((id) =>
      db.query.recipeVersions.findFirst({
        where: and(eq(recipeVersions.id, id), eq(recipeVersions.recipeId, recipeId)),
        with: {
          tasteNotes: { with: { tasteNote: { columns: { id: true, name: true } } } },
          equipment: { with: { equipment: { columns: { id: true, name: true } } } },
          additionalPreparations: true,
        },
      })
    ),
  );
  return results;
}
```

### Frontend: VersionDiffPage

```tsx
// apps/web/src/pages/recipes/VersionDiffPage.tsx
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { api } from '../../api/client.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { DiffHighlighter } from '../../components/recipe/DiffHighlighter.tsx';
import { useUnitSystem } from '../../hooks/useUnitSystem.ts';
import { formatWeight, formatVolume, formatTemperature } from '@brewform/shared/utils';

interface DiffField {
  field: string;
  label: string;
  value1: string | number | null;
  value2: string | number | null;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
}

interface VersionDiff {
  version1: { id: string; versionNumber: number; brewDate: string };
  version2: { id: string; versionNumber: number; brewDate: string };
  fields: DiffField[];
  tasteNotes: { added: string[]; removed: string[]; unchanged: string[] };
  equipment: { added: string[]; removed: string[]; unchanged: string[] };
}

export function VersionDiffPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const v1Id = searchParams.get('v1');
  const v2Id = searchParams.get('v2');
  const unitSystem = useUnitSystem();
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug || !v1Id || !v2Id) return;
    setLoading(true);
    api.get<VersionDiff>(`/recipes/${slug}/versions/diff?v1=${v1Id}&v2=${v2Id}`)
      .then(setDiff)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug, v1Id, v2Id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-[color:var(--text-secondary)]">
        Loading diff...
      </div>
    );
  }

  if (error || !diff) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-[color:var(--text-secondary)]">
        {error || 'Could not load diff'}
      </div>
    );
  }

  const formatValue = (field: string, val: string | number | null): string => {
    if (val == null) return '-';
    if (field === 'groundWeightGrams') return formatWeight(val as number, unitSystem);
    if (field === 'extractionVolumeMl') return formatVolume(val as number, unitSystem);
    if (field === 'temperatureCelsius') {
      return formatTemperature(
        val as number,
        unitSystem === 'imperial' ? 'fahrenheit' : 'celsius',
      );
    }
    if (typeof val === 'string' && val.includes('_')) {
      return val.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return String(val);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <SEOHead title="Version Diff" />
      <h1 className="text-2xl font-bold mb-2 text-[color:var(--text-primary)]">
        Version Diff
      </h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        Comparing v{diff.version1.versionNumber} ({new Date(diff.version1.brewDate).toLocaleDateString()})
        {' vs '}
        v{diff.version2.versionNumber} ({new Date(diff.version2.brewDate).toLocaleDateString()})
      </p>

      {/* Scalar field diffs */}
      <div className="card mb-6">
        <h2 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Parameters
        </h2>
        <div className="grid grid-cols-3 gap-1 text-xs font-medium"
             style={{ color: 'var(--text-tertiary)' }}>
          <div>v{diff.version1.versionNumber}</div>
          <div className="text-center">Field</div>
          <div className="text-right">v{diff.version2.versionNumber}</div>
        </div>
        {diff.fields.map((f) => (
          <DiffHighlighter
            key={f.field}
            label={f.label}
            value1={f.value1}
            value2={f.value2}
            status={f.status}
            formatter={(val) => formatValue(f.field, val)}
          />
        ))}
      </div>

      {/* Taste notes diff */}
      <div className="card mb-6">
        <h2 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Taste Notes
        </h2>
        <DiffTagList
          added={diff.tasteNotes.added}
          removed={diff.tasteNotes.removed}
          unchanged={diff.tasteNotes.unchanged}
        />
      </div>

      {/* Equipment diff */}
      <div className="card">
        <h2 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Equipment
        </h2>
        <DiffTagList
          added={diff.equipment.added}
          removed={diff.equipment.removed}
          unchanged={diff.equipment.unchanged}
        />
      </div>
    </div>
  );
}

function DiffTagList({
  added,
  removed,
  unchanged,
}: {
  added: string[];
  removed: string[];
  unchanged: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {unchanged.map((name) => (
        <span
          key={name}
          className="px-2 py-1 rounded text-sm"
          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
        >
          {name}
        </span>
      ))}
      {added.map((name) => (
        <span
          key={name}
          className="px-2 py-1 rounded text-sm"
          style={{ backgroundColor: 'var(--diff-added, #d4edda)', color: '#155724' }}
        >
          + {name}
        </span>
      ))}
      {removed.map((name) => (
        <span
          key={name}
          className="px-2 py-1 rounded text-sm line-through"
          style={{ backgroundColor: 'var(--diff-removed, #f8d7da)', color: '#721c24' }}
        >
          - {name}
        </span>
      ))}
    </div>
  );
}
```

### Updated DiffHighlighter

Enhance `apps/web/src/components/recipe/DiffHighlighter.tsx` to accept a `status` prop:

```tsx
interface DiffHighlighterProps {
  label: string;
  value1: string | number | null;
  value2: string | number | null;
  status?: 'added' | 'removed' | 'modified' | 'unchanged';
  formatter?: (val: string | number | null) => string;
}

export function DiffHighlighter({
  label,
  value1,
  value2,
  status,
  formatter,
}: DiffHighlighterProps) {
  const display1 = formatter ? formatter(value1) : (value1 ?? '-');
  const display2 = formatter ? formatter(value2) : (value2 ?? '-');

  // Auto-detect status if not provided
  const effectiveStatus = status ?? (display1 === display2 ? 'unchanged' : 'modified');

  const bgMap = {
    added: 'var(--diff-added-bg, rgba(40, 167, 69, 0.08))',
    removed: 'var(--diff-removed-bg, rgba(220, 53, 69, 0.08))',
    modified: 'var(--diff-modified-bg, rgba(255, 193, 7, 0.08))',
    unchanged: 'transparent',
  };

  const textMap = {
    added: 'var(--diff-added-text, #28a745)',
    removed: 'var(--diff-removed-text, #dc3545)',
    modified: 'var(--diff-modified-text, #e0a800)',
    unchanged: 'var(--text-primary)',
  };

  return (
    <div
      className="grid grid-cols-3 gap-2 py-2 text-sm"
      style={{
        borderBottom: '1px solid var(--border-primary)',
        backgroundColor: bgMap[effectiveStatus],
      }}
    >
      <div style={{ color: textMap[effectiveStatus] }}>
        {effectiveStatus === 'removed' ? (
          <span className="line-through">{display1}</span>
        ) : (
          display1
        )}
      </div>
      <div className="text-center font-medium" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </div>
      <div className="text-right" style={{ color: textMap[effectiveStatus] }}>
        {effectiveStatus === 'added' ? (
          <span className="font-semibold">{display2}</span>
        ) : (
          display2
        )}
      </div>
    </div>
  );
}
```

### Router Changes

Add to `apps/web/src/router.tsx`:

```tsx
{
  path: 'recipes/:slug/versions/diff',
  lazy: async () => {
    const { VersionDiffPage } = await import('./pages/recipes/VersionDiffPage.tsx');
    return { Component: VersionDiffPage };
  },
},
```

### Entry Point: RecipeVersionsPage

Add "Compare" checkboxes and "Diff" button to `apps/web/src/pages/recipes/RecipeVersionsPage.tsx`:

```tsx
// Add to RecipeVersionsPage:
const [selectedVersions, setSelectedVersions] = useState<string[]>([]);

function toggleVersion(id: string) {
  setSelectedVersions((prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-2) // max 2
  );
}

// In the version list, add checkboxes:
<input
  type="checkbox"
  checked={selectedVersions.includes(v.id)}
  onChange={() => toggleVersion(v.id)}
/>

// Add diff button when 2 versions selected:
{selectedVersions.length === 2 && (
  <Link
    to={`/recipes/${slug}/versions/diff?v1=${selectedVersions[0]}&v2=${selectedVersions[1]}`}
    className="btn-primary"
  >
    Compare Selected
  </Link>
)}
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/recipes/:slug/versions/diff?v1=&v2=` | Optional | Field-by-field diff between two versions |

## Frontend Components

| Component | File | Description |
|-----------|------|-------------|
| `VersionDiffPage` | `apps/web/src/pages/recipes/VersionDiffPage.tsx` | Full diff view page |
| `DiffHighlighter` | `apps/web/src/components/recipe/DiffHighlighter.tsx` | Single diff row with color coding |
| `DiffTagList` | Inline in `VersionDiffPage` | Tag list for taste notes / equipment diff |

## CSS Variables

Add to theme:

```css
:root {
  --diff-added-bg: rgba(40, 167, 69, 0.08);
  --diff-added-text: #28a745;
  --diff-removed-bg: rgba(220, 53, 69, 0.08);
  --diff-removed-text: #dc3545;
  --diff-modified-bg: rgba(255, 193, 7, 0.08);
  --diff-modified-text: #e0a800;
}
```

## Modifications to Existing Files

| File | Change |
|------|--------|
| `apps/api/src/modules/recipe/index.ts` | Add `GET /recipes/:slug/versions/diff` endpoint |
| `apps/api/src/modules/recipe/service.ts` | Add `diffVersions` function |
| `apps/web/src/pages/recipes/RecipeVersionsPage.tsx` | Add version selection checkboxes and diff link |
| `apps/web/src/router.tsx` | Add `/recipes/:slug/versions/diff` route |
| `apps/web/src/components/recipe/DiffHighlighter.tsx` | Enhance with `status` prop and color coding |

## Acceptance Criteria

- [ ] `GET /recipes/:slug/versions/diff?v1=&v2=` returns correct diff payload
- [ ] Scalar field changes show color-coded highlighting (green=added, red=removed, yellow=modified)
- [ ] Unchanged fields display without color
- [ ] Taste notes and equipment show added/removed/unchanged tags
- [ ] Version history page has checkboxes to select two versions
- [ ] "Compare Selected" button navigates to diff page
- [ ] Diff page shows version numbers and dates in header
- [ ] Values formatted with unit system (metric/imperial)
- [ ] Non-public recipes only accessible to author
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)
- [ ] All tests pass (`make test`)

## Implementation Steps

1. Add `diffVersions` function to `apps/api/src/modules/recipe/service.ts`
2. Add `GET /recipes/:slug/versions/diff` endpoint to `apps/api/src/modules/recipe/index.ts`
3. Enhance `DiffHighlighter` component with `status` prop and color coding
4. Create `VersionDiffPage` component
5. Add diff route to `apps/web/src/router.tsx`
6. Update `RecipeVersionsPage` with version selection checkboxes and diff button
7. Add CSS variables for diff colors to theme
8. Run `make check && make lint && make test`

## Dependencies

- Existing: `recipeVersions` table with taste notes, equipment, preparations relations
- Existing: `getRecipe` service function for authorization checks
- Existing: `optionalAuthMiddleware` for public recipe access
- Existing: `useUnitSystem` hook for formatting
- Existing: `formatWeight`, `formatVolume`, `formatTemperature` from `@brewform/shared/utils`
