# F24 — Recipe Version Immutability Guards

## Overview

Ensure version snapshots are truly immutable with application-level guards and change tracking. Versions cannot be modified after creation, and users can see exactly what changed between versions.

## Goals

1. Prevent modification of existing recipe versions
2. Track changes between consecutive versions
3. Show visual diff indicators in the UI
4. Provide structured diff data in the API
5. Maintain version history integrity

## User Stories

| # | As a… | I want to… | So that… |
|---|-------|-----------|----------|
| US-1 | Authenticated user | Know that recipe versions cannot be changed | I can trust the version history is reliable |
| US-2 | Authenticated user | See what changed between two versions | I can understand how the recipe evolved |
| US-3 | Authenticated user | See which fields changed at a glance | I can quickly identify modifications |
| US-4 | Developer | Receive structured diff data from the API | I can build custom diff visualizations |

## Technical Design

### No New Tables

This feature enhances the existing `recipeVersions` module with application-level guards and computed diff fields.

### Immutability Guard

Modify `apps/api/src/modules/recipe/service.ts`:

```ts
/**
 * Guard: prevent updates to recipe versions that are currently active.
 * Recipe versions are immutable once created.
 */
export async function guardVersionImmutability(
  recipeId: string,
  versionId: string
): Promise<void> {
  const recipe = await recipeModel.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');

  // Reject ANY attempt to modify an existing version — versions are immutable
  const versionExists = recipe.versions?.some((v: any) => v.id === versionId);
  if (versionExists || recipe.currentVersionId === versionId) {
    throw new Error('VERSION_IS_IMMUTABLE');
  }
}

/**
 * Reject any PATCH/PUT to recipe_version endpoint.
 * Versions are immutable.
 */
export async function rejectVersionUpdate(
  userId: string,
  recipeId: string,
  versionId: string
): Promise<void> {
  const recipe = await recipeModel.findById(recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (recipe.authorId !== userId) throw new Error('FORBIDDEN');

  // Always reject — versions are immutable
  throw new Error('VERSION_IMMUTABLE');
}
```

### Diff Computation

Create `apps/api/src/modules/recipe/version-diff.ts`:

```ts
/**
 * Compute diff between two recipe versions.
 * Returns changed fields with old/new values.
 */

export interface VersionDiffField {
  field: string;
  label: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface VersionDiff {
  versionNumber: number;
  previousVersionNumber: number;
  changedFields: VersionDiffField[];
  summary: string;
}

// Human-readable field labels
const FIELD_LABELS: Record<string, string> = {
  productName: 'Product Name',
  coffeeBrand: 'Coffee Brand',
  coffeeProcessing: 'Processing',
  brewMethod: 'Brew Method',
  drinkType: 'Drink Type',
  brewerDetails: 'Brewer Details',
  grinder: 'Grinder',
  grindSize: 'Grind Size',
  groundWeightGrams: 'Dose Weight',
  extractionTimeSeconds: 'Extraction Time',
  extractionVolumeMl: 'Extraction Volume',
  temperatureCelsius: 'Temperature',
  tds: 'TDS',
  brewRatio: 'Brew Ratio',
  flowRate: 'Flow Rate',
  preInfusionTimeSeconds: 'Pre-infusion Time',
  beanId: 'Bean',
  coffeeVarietyName: 'Coffee Variety',
  personalNotes: 'Personal Notes',
  preparationNotes: 'Preparation Notes',
  isFavourite: 'Favourite',
  rating: 'Rating',
  emojiTag: 'Emoji Tag',
};

/**
 * Compare two version objects and return changed fields.
 */
export function computeVersionDiff(
  current: Record<string, unknown>,
  previous: Record<string, unknown>
): VersionDiffField[] {
  const changes: VersionDiffField[] = [];

  for (const [field, label] of Object.entries(FIELD_LABELS)) {
    const oldVal = previous[field];
    const newVal = current[field];

    // Skip undefined/null comparisons (both null = no change)
    if (oldVal === newVal) continue;
    if (oldVal == null && newVal == null) continue;

    // Skip default values
    if (field === 'isFavourite' && !newVal) continue;
    if (field === 'emojiTag' && !newVal) continue;

    changes.push({
      field,
      label,
      oldValue: oldVal,
      newValue: newVal,
    });
  }

  return changes;
}

/**
 * Generate human-readable summary of changes.
 */
export function generateDiffSummary(changes: VersionDiffField[]): string {
  if (changes.length === 0) return 'No changes';
  if (changes.length === 1) return `Changed ${changes[0].label.toLowerCase()}`;
  if (changes.length <= 3) {
    const names = changes.map(c => c.label.toLowerCase());
    return `Changed ${names.join(', ')}`;
  }
  return `Changed ${changes.length} fields`;
}
```

### Enhanced Version Listing

Modify `apps/api/src/modules/recipe/model.ts`:

```ts
/**
 * Get versions with diff from previous version.
 * Uses window function to compare consecutive versions.
 */
export async function getVersionsWithDiff(recipeId: string) {
  const versions = await db.select()
    .from(recipeVersions)
    .where(eq(recipeVersions.recipeId, recipeId))
    .orderBy(desc(recipeVersions.versionNumber));

  // Compute diffs
  const versionsWithDiff = versions.map((version, index) => {
    const previous = versions[index + 1]; // Next in desc order = previous version
    const diff = previous
      ? computeVersionDiff(version as Record<string, unknown>, previous as Record<string, unknown>)
      : [];
    const summary = generateDiffSummary(diff);

    return {
      ...version,
      diffFromPrevious: {
        changedFields: diff,
        summary,
        previousVersionNumber: previous?.versionNumber ?? null,
      },
    };
  });

  return versionsWithDiff;
}
```

### API Enhancement

Modify `GET /recipes/:slug/versions` endpoint:

```ts
recipe.get('/:slug/versions', optionalAuthMiddleware, zValidator('query', PaginationSchema), async (c) => {
  const slug = c.req.param('slug')!;
  const { page, perPage } = c.req.valid('query');

  const recipe = await service.getRecipe(slug);
  if (!recipe) return error(c, 'NOT_FOUND', 'Recipe not found', 404);

  const versions = await service.getVersionsWithDiff(recipe.id);
  // Apply pagination to versions
  const start = (page - 1) * perPage;
  const paginatedVersions = versions.slice(start, start + perPage);

  return paginated(c, paginatedVersions, {
    page,
    perPage,
    total: versions.length,
    totalPages: Math.ceil(versions.length / perPage),
  });
});
```

### Shared Schemas

Add to `packages/shared/src/schemas/recipe.ts`:

```ts
export const VersionDiffSchema = z.object({
  field: z.string(),
  label: z.string(),
  oldValue: z.unknown(),
  newValue: z.unknown(),
});

export const VersionWithDiffSchema = z.object({
  id: z.string(),
  versionNumber: z.number(),
  diffFromPrevious: z.object({
    changedFields: z.array(VersionDiffSchema),
    summary: z.string(),
    previousVersionNumber: z.number().nullable(),
  }),
  // ... other version fields
});
```

### Frontend Components

#### Diff Indicators

Create `apps/web/src/components/recipe/VersionDiffBadge.tsx`:

```tsx
interface VersionDiffBadgeProps {
  summary: string;
  changedFields: Array<{ field: string; label: string }>;
}

export function VersionDiffBadge({ summary, changedFields }: VersionDiffBadgeProps) {
  if (changedFields.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500">{summary}</span>
      <div className="flex gap-1">
        {changedFields.slice(0, 3).map(({ field, label }) => (
          <span
            key={field}
            className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded"
          >
            {label}
          </span>
        ))}
        {changedFields.length > 3 && (
          <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded">
            +{changedFields.length - 3} more
          </span>
        )}
      </div>
    </div>
  );
}
```

#### Version Detail with Diff

Create `apps/web/src/components/recipe/VersionDetail.tsx`:

```tsx
interface VersionDetailProps {
  version: VersionWithDiff;
  isCurrent: boolean;
}

export function VersionDetail({ version, isCurrent }: VersionDetailProps) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">
          Version {version.versionNumber}
          {isCurrent && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">
              Current
            </span>
          )}
        </h3>
        <VersionDiffBadge
          summary={version.diffFromPrevious.summary}
          changedFields={version.diffFromPrevious.changedFields}
        />
      </div>
      {/* ... version details */}
    </div>
  );
}
```

#### Modifications to Existing Pages

- **RecipeVersionsPage**: Use `VersionDetail` with diff badges
- Add expandable diff details for each version

### Route Protection

Modify `apps/api/src/modules/recipe/index.ts`:

```ts
// Reject any update to recipe versions
recipe.patch('/:slug/versions/:versionId', authMiddleware, async (c) => {
  return error(c, 'FORBIDDEN', 'Recipe versions are immutable', 403);
});

recipe.put('/:slug/versions/:versionId', authMiddleware, async (c) => {
  return error(c, 'FORBIDDEN', 'Recipe versions are immutable', 403);
});
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/recipes/:slug/versions` | Optional | List versions with diff data |
| `PATCH` | `/api/v1/recipes/:slug/versions/:id` | Required | **Rejected** — versions immutable |
| `PUT` | `/api/v1/recipes/:slug/versions/:id` | Required | **Rejected** — versions immutable |

## Acceptance Criteria

- [ ] PATCH/PUT to version endpoints return 403
- [ ] Version listing includes diff from previous version
- [ ] Diff shows changed fields with old/new values
- [ ] Diff summary is human-readable
- [ ] Visual diff badges show changed field names
- [ ] Current version is clearly indicated
- [ ] Versions cannot be modified even by recipe owner
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)
- [ ] Tests pass (`make test`)

## Implementation Steps

1. Create `apps/api/src/modules/recipe/version-diff.ts`
2. Add `getVersionsWithDiff` to `apps/api/src/modules/recipe/model.ts`
3. Modify `GET /recipes/:slug/versions` endpoint to include diff data
4. Add immutability guard routes (reject PATCH/PUT)
5. Add `VersionDiffSchema` to shared schemas
6. Create `apps/web/src/components/recipe/VersionDiffBadge.tsx`
7. Create `apps/web/src/components/recipe/VersionDetail.tsx`
8. Modify `RecipeVersionsPage` to use new components
9. Write tests for diff computation and immutability guards
10. Run `make check && make lint && make test`

## Dependencies

- Existing `recipeVersions` table
- Existing `recipes` table (for currentVersionId check)
- Existing `authMiddleware`
- Existing response helpers
