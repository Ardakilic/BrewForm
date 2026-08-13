# F12 — "Similar Recipes" Recommendations

> **Validation status (2026-08-13): refreshed — corrections below**
>
> **Note:** The body below this line is the pre-refresh draft (it includes a 2026-07-13 banner whose line numbers have since drifted); treat the corrections below as authoritative. Core design (app-code weighted scoring, no new tables, 1h cache, card grid) remains valid — F11's shipped ranking proves the approach.
>
> - Still no `currentVersion` relation: `recipesRelations` (packages/db/src/schema.ts:1057) has only `versions` (:1062) + the `currentVersionId` column (:138). The model layer's `with: { currentVersion }` will THROW. Resolve the version via `recipes.currentVersionId` (the `buildRecipeFilters` pattern, apps/api/src/modules/recipe/model.ts:217); `recipeVersionsRelations` (schema.ts:1076) DOES have `tasteNotes` (:1094) and `equipment` (:1095), so the nested `with` works once you query from `recipeVersions`.
> - `service.getRecipe()` (apps/api/src/modules/recipe/service.ts:61) THROWS `RECIPE_NOT_FOUND` (:69), it does not return null — the route's `if (!recipe)` guard is dead code. Copy GET `/:slugOrId` (apps/api/src/modules/recipe/index.ts:540-544, :587-589): try/catch → 404, plus the `service.canViewRecipe` visibility gate (service.ts:767).
> - CacheProvider signature differs: `get/set(key: string[], …)` with `{ ttlMs }` in MILLISECONDS (apps/api/src/utils/cache/index.ts:11-13). The plan's string key + `{ ttl: 3600 }` won't compile — use e.g. `['similar', recipeId, String(limit)]` + `{ ttlMs: 3_600_000 }`.
> - No TanStack Query (absent from apps/web/package.json); react-router is now ^8.2.0. The detail page uses a loader + `useLoaderData` (apps/web/src/pages/recipes/RecipeDetailPage.tsx:61, :95): add `recipeApi.similar()` to `recipeApi` (apps/web/src/api/index.ts:87) and fetch in the loader's `Promise.all` (:79-84) instead of `useQuery`. Web types are z.infer from @brewform/shared (apps/web/src/api/types.ts deleted, D42).
> - RecipeCard lives at apps/web/src/components/recipe-list/RecipeCard.tsx (D36) and accepts a minimal `RecipeCardRecipe` projection (:35) — not components/recipe/.
> - Route placement: catch-all GET `/:slugOrId` is now at index.ts:526 (not :299); `/:slug/versions` at :360 (not :262). Register `/:slug/similar` before the catch-all, per the `/:slugOrId/collections` precedent (:479-482).
> - OpenAPI: `describeRoute` responses must carry `resolver(successEnvelope(...))` / `resolver(ErrorEnvelopeSchema)` content schemas — copy `/:slugOrId/collections` (index.ts:483-502). Reuse `RecipeWithAuthorOutputSchema` (packages/shared/src/schemas/responses/recipe.ts:42): it already matches the planned response shape (mini author incl. `avatarUrl` — users.avatarUrl at schema.ts:87 — plus likeCount/commentCount/featured).
> - Verified still correct: join tables `recipeTasteNotes` (schema.ts:268, `tasteNoteId` :276) and `recipeEquipment` (:293, `equipmentId` :301), both keyed by `recipeVersionId`; `optionalAuthMiddleware` (index.ts:24); `c.get('cache')`; `cacheProvider`/`setCacheProvider` (apps/api/src/utils/cache/singleton.ts:9, :15). The `listRecipes()` reference drifted to service.ts:486 (not :469).
> - Scope shipped elsewhere: F11 advanced search (2026-08-02) shipped app-code relevance ranking — `rankRecipes` (service.ts:441) + `findAllForRanking` (model.ts:400) — which validates F12's in-app scoring AND its "load all candidates into memory" scaling trade-off; the equipment/taste-note subquery filters (model.ts:214-234) are reusable for candidate selection. No similar-recipes spec exists in openspec/specs/ and no active change in openspec/changes/ — F12 itself is unshipped.
> - Conventions: plan uses no tsvector/pg_trgm/raw SQL — compliant with the no-raw-SQL/no-PG-operators rule; keep scoring in app code. Still required on implementation: entry/exit debug logging in new service functions (recipe module already has a `logger`), and tests named `*.test.ts`.

> **Validation status (2026-07-13): ⚠️ Outdated — corrections below**
>
> - `db.query… with: { currentVersion }` (getSourceRecipeData/getCandidateRecipes) will THROW — `recipesRelations` (schema.ts:991) has no `currentVersion` relation, only `versions` + the `currentVersionId` column (schema.ts:119). Query `recipeVersions` by `recipes.currentVersionId` (as `buildRecipeFilters` does, model.ts:151) or add the relation first.
> - No TanStack Query: `SimilarRecipesSection`'s `useQuery` must become a react-router v8 loader + `useLoaderData` (or `useEffect` + `api.get`); web client is a custom fetch wrapper (apps/web/src/api/client.ts), not axios. react-router is v8.0.1 (apps/web/package.json).
> - Wrong path: RecipeCard lives at apps/web/src/components/recipe-list/RecipeCard.tsx (D36 shared card), not components/recipe/.
> - Verified: `service.getRecipe(slug)` exists (recipe/service.ts) and resolves slug-or-id → RecipeWithRelations with `.id`; `optionalAuthMiddleware` exists; `c.get('cache')` valid; `cacheProvider`/`setCacheProvider` exported from apps/api/src/utils/cache/singleton.ts. Route `/:slug/similar` is 2-segment so won't be shadowed by `/:slugOrId` (index.ts:299), but register it beside the other `/:slug/*` routes (e.g. `/:slug/versions` at :262), before the catch-all.
> - Scaling caveat still applies: the approach loads all public recipes into memory.

## Overview

Show similar recipes on recipe detail pages based on brew method match, taste note overlap, equipment overlap, and drink type match. Computed from existing data — no new tables required.

## Goals

1. Compute recipe similarity using weighted scoring algorithm
2. Return 4-6 similar recipes per recipe detail page
3. Cache similarity results for 1 hour
4. Exclude the current recipe and non-public recipes from results
5. Response time < 100ms with caching

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| US-12.1 | As a user viewing a recipe, I see a "Similar Recipes" section with related recipes | P0 |
| US-12.2 | As a user, similar recipes prioritize matching brew method and taste profile | P0 |
| US-12.3 | As a user, I can click a similar recipe card to navigate to it | P0 |
| US-12.4 | As a user, the similar recipes section shows 4-6 recipes when available | P1 |
| US-12.5 | As a user, if fewer than 4 similar recipes exist, I see what's available | P2 |

## Technical Design

### Similarity Algorithm

**No new tables.** Compute similarity from existing recipe data:

```ts
// apps/api/src/modules/recipe/service.ts

interface SimilarityScore {
  recipeId: string;
  score: number;
  breaks: {
    brewMethod: number;
    drinkType: number;
    tasteNotes: number;
    equipment: number;
  };
}

export async function findSimilarRecipes(
  recipeId: string,
  limit: number = 6,
): Promise<Recipe[]> {
  // 1. Get source recipe's current version data
  // 2. Score all public recipes against source
  // 3. Return top N

  const source = await getSourceRecipeData(recipeId);
  if (!source) return [];

  // Get candidate recipes (public, not this recipe)
  const candidates = await getCandidateRecipes(recipeId);

  // Score each candidate
  const scored = candidates.map((candidate) => ({
    recipeId: candidate.id,
    score: computeSimilarityScore(source, candidate),
  }));

  // Sort by score descending, take top N
  scored.sort((a, b) => b.score - a.score);
  const topIds = scored.slice(0, limit).map((s) => s.recipeId);

  if (topIds.length === 0) return [];

  // Fetch full recipe data for top matches
  return db.query.recipes.findMany({
    where: inArray(recipes.id, topIds),
    with: {
      author: { columns: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });
}
```

### Scoring Formula

```ts
function computeSimilarityScore(source: SourceData, candidate: CandidateData): number {
  let score = 0;

  // Brew method match: +3
  if (source.brewMethod === candidate.brewMethod) {
    score += 3;
  }

  // Drink type match: +2
  if (source.drinkType === candidate.drinkType) {
    score += 2;
  }

  // Taste note overlap: +2 * (overlapping notes / total unique notes)
  const sourceNotes = new Set(source.tasteNoteIds);
  const candidateNotes = new Set(candidate.tasteNoteIds);
  const intersection = [...sourceNotes].filter((n) => candidateNotes.has(n));
  const union = new Set([...sourceNotes, ...candidateNotes]);
  if (union.size > 0) {
    score += 2 * (intersection.length / union.size);
  }

  // Equipment overlap: +1 * (overlapping equipment / total unique equipment)
  const sourceEquipment = new Set(source.equipmentIds);
  const candidateEquipment = new Set(candidate.equipmentIds);
  const equipIntersection = [...sourceEquipment].filter((e) => candidateEquipment.has(e));
  const equipUnion = new Set([...sourceEquipment, ...candidateEquipment]);
  if (equipUnion.size > 0) {
    score += 1 * (equipIntersection.length / equipUnion.size);
  }

  return score;
}
```

**Score range:** 0–8 (brewMethod:3 + drinkType:2 + tasteNotes:2 + equipment:1)

### Model Layer

`apps/api/src/modules/recipe/model.ts` — new functions:

```ts
export async function getSourceRecipeData(recipeId: string) {
  const recipe = await db.query.recipes.findFirst({
    where: and(eq(recipes.id, recipeId), isNull(recipes.deletedAt)),
    with: {
      currentVersion: {
        columns: { brewMethod: true, drinkType: true },
        with: {
          tasteNotes: { columns: { tasteNoteId: true } },
          equipment: { columns: { equipmentId: true } },
        },
      },
    },
  });

  if (!recipe?.currentVersion) return null;

  return {
    id: recipe.id,
    brewMethod: recipe.currentVersion.brewMethod,
    drinkType: recipe.currentVersion.drinkType,
    tasteNoteIds: recipe.currentVersion.tasteNotes.map((tn) => tn.tasteNoteId),
    equipmentIds: recipe.currentVersion.equipment.map((e) => e.equipmentId),
  };
}

export async function getCandidateRecipes(excludeRecipeId: string) {
  const recipesWithVersions = await db.query.recipes.findMany({
    where: and(
      eq(recipes.visibility, 'public'),
      isNull(recipes.deletedAt),
      ne(recipes.id, excludeRecipeId),
    ),
    with: {
      currentVersion: {
        columns: { brewMethod: true, drinkType: true },
        with: {
          tasteNotes: { columns: { tasteNoteId: true } },
          equipment: { columns: { equipmentId: true } },
        },
      },
    },
  });

  return recipesWithVersions
    .filter((r) => r.currentVersion)
    .map((r) => ({
      id: r.id,
      brewMethod: r.currentVersion!.brewMethod,
      drinkType: r.currentVersion!.drinkType,
      tasteNoteIds: r.currentVersion!.tasteNotes.map((tn) => tn.tasteNoteId),
      equipmentIds: r.currentVersion!.equipment.map((e) => e.equipmentId),
    }));
}
```

### Caching

Use existing `CacheProvider` interface (from `apps/api/src/utils/cache/singleton.ts`):

```ts
export async function findSimilarRecipes(
  recipeId: string,
  limit: number = 6,
  cache?: CacheProvider,
): Promise<Recipe[]> {
  const cacheKey = `similar:${recipeId}:${limit}`;

  if (cache) {
    const cached = await cache.get<Recipe[]>(cacheKey);
    if (cached) return cached;
  }

  // ... compute similarity ...

  if (cache) {
    await cache.set(cacheKey, result, { ttl: 3600 }); // 1 hour
  }

  return result;
}
```

### API Endpoint

`apps/api/src/modules/recipe/index.ts` — new route:

```ts
recipe.get(
  '/:slug/similar',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Get similar recipes',
    description: 'Returns recipes similar to the given recipe based on brew method, taste notes, equipment, and drink type.',
    responses: {
      200: { description: 'List of similar recipes' },
      404: { description: 'Recipe not found' },
    },
  }),
  optionalAuthMiddleware,
  zValidator('query', z.object({
    limit: z.coerce.number().int().min(1).max(12).default(6),
  })),
  async (c) => {
    const slug = c.req.param('slug')!;
    const limit = c.req.valid('query').limit;
    const cache = c.get('cache');

    // Resolve slug to recipe ID
    const recipe = await service.getRecipe(slug);
    if (!recipe) return error(c, 'NOT_FOUND', 'Recipe not found', 404);

    const similar = await service.findSimilarRecipes(recipe.id, limit, cache);
    return success(c, similar);
  },
);
```

### Frontend Component

`apps/web/src/components/recipe/SimilarRecipesSection.tsx`:

```tsx
interface SimilarRecipesSectionProps {
  recipeSlug: string;
}

export function SimilarRecipesSection({ recipeSlug }: SimilarRecipesSectionProps) {
  const { data: similarRecipes, isLoading } = useQuery({
    queryKey: ['similarRecipes', recipeSlug],
    queryFn: () => api.get(`/recipes/${recipeSlug}/similar?limit=6`),
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  if (isLoading || !similarRecipes?.length) return null;

  return (
    <section>
      <h2>Similar Recipes</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {similarRecipes.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>
    </section>
  );
}
```

Add to `apps/web/src/pages/recipes/RecipeDetailPage.tsx`:

```tsx
// After recipe details section
<SimilarRecipesSection recipeSlug={recipe.slug} />
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/recipes/:slug/similar` | Get similar recipes |

**Query params:** `limit` (1-12, default 6)

**Response:**
```json
{
  "data": [
    {
      "id": "...",
      "slug": "...",
      "title": "...",
      "author": { "id": "...", "username": "...", "displayName": "..." },
      "likeCount": 12,
      "commentCount": 3,
      "featured": false
    }
  ]
}
```

## Frontend Components

| Component | Location | Description |
|-----------|----------|-------------|
| `SimilarRecipesSection` | `components/recipe/SimilarRecipesSection.tsx` | Grid of 4-6 similar recipe cards |
| `RecipeCard` | `components/recipe/RecipeCard.tsx` | Existing — reused for similar recipes |

## Acceptance Criteria

- [ ] Similar recipes section appears on recipe detail page
- [ ] Section shows 4-6 recipes when available
- [ ] Brew method match contributes highest to similarity score
- [ ] Taste note overlap is factored into similarity
- [ ] Equipment overlap contributes to similarity
- [ ] Current recipe is excluded from results
- [ ] Non-public recipes are excluded from results
- [ ] Results are cached for 1 hour
- [ ] Section hides gracefully when no similar recipes exist
- [ ] Clicking a similar recipe card navigates to that recipe
- [ ] Response time < 100ms (with cache hit)
- [ ] `make check` passes
- [ ] `make lint` passes

## Implementation Steps

1. **Add `getSourceRecipeData()` and `getCandidateRecipes()`** to `apps/api/src/modules/recipe/model.ts`
2. **Add `computeSimilarityScore()` and `findSimilarRecipes()`** to `apps/api/src/modules/recipe/service.ts`
3. **Add `GET /:slug/similar` route** to `apps/api/src/modules/recipe/index.ts`
4. **Create `SimilarRecipesSection`** component in `apps/web/src/components/recipe/`
5. **Add `SimilarRecipesSection`** to `RecipeDetailPage`
6. **Add API client function** for fetching similar recipes
7. **Add tests** for similarity scoring logic
8. **Run `make check && make lint && make test`**

## Dependencies

- Existing: recipe module, recipe detail page, RecipeCard component, CacheProvider
- Uses: `recipeVersions`, `recipeTasteNotes`, `recipeEquipment` tables (existing)

## References

- [Drizzle ORM docs](/drizzle-team/drizzle-orm-docs) — query building, relations
- Existing: `apps/api/src/modules/recipe/model.ts` — current recipe model
- Existing: `apps/api/src/modules/recipe/service.ts:469` — `listRecipes()` pattern
- Existing: `apps/web/src/pages/recipes/RecipeDetailPage.tsx` — detail page to extend
