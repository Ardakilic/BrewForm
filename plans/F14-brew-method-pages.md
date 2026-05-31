# F14 — Brew Method Landing Pages

## Overview

Dedicated pages per brew method (espresso, v60, french press, etc.) showing top recipes, recommended equipment, community stats, and brew guides. Dynamic route at `/brew/:method`.

## Goals

1. Unique landing page for each of the 11 brew methods
2. Top recipes for each method (by likes/ratings)
3. Equipment count and recommendations
4. Community statistics (recipe count, average rating)
5. SEO-optimized with unique meta tags and JSON-LD
6. Entry point from filter chips on RecipeListPage

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| US-14.1 | As a user, I can visit `/brew/v60` to see V60-specific content | P0 |
| US-14.2 | As a user, I see top recipes for the brew method ranked by popularity | P0 |
| US-14.3 | As a user, I see recommended equipment for this brew method | P1 |
| US-14.4 | As a user, I see community stats (total recipes, avg rating) | P1 |
| US-14.5 | As a user, I can navigate from recipe list filter chips to brew method pages | P1 |
| US-14.6 | As a user, each brew method page has unique SEO metadata | P2 |

## Technical Design

### No New Tables

All data computed from existing tables: `recipes`, `recipeVersions`, `recipeEquipment`, `equipment`, `userRecipeRatings`.

### API Endpoint

`apps/api/src/modules/recipe/index.ts` — new route:

```ts
recipe.get(
  '/brew-method/:method',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Get brew method page data',
    description: 'Returns top recipes, equipment stats, and community stats for a specific brew method.',
    responses: {
      200: { description: 'Brew method page data' },
      400: { description: 'Invalid brew method' },
    },
  }),
  zValidator('param', z.object({
    method: BrewMethodEnum,
  })),
  zValidator('query', z.object({
    limit: z.coerce.number().int().min(1).max(50).default(12),
  })),
  async (c) => {
    const method = c.req.param('method');
    const limit = c.req.valid('query').limit;
    const data = await service.getBrewMethodPageData(method, limit);
    return success(c, data);
  },
);
```

### Service Layer

`apps/api/src/modules/recipe/service.ts` — new function:

```ts
export async function getBrewMethodPageData(
  method: string,
  limit: number,
): Promise<BrewMethodPageData> {
  const cache = cacheProvider;
  const cacheKey = `brew-method:${method}:${limit}`;

  const cached = await cache.get<BrewMethodPageData>(cacheKey);
  if (cached) return cached;

  const [topRecipes, recipeCount, averageRating, equipmentStats] = await Promise.all([
    getTopRecipesForMethod(method, limit),
    getRecipeCountForMethod(method),
    getAverageRatingForMethod(method),
    getEquipmentStatsForMethod(method),
  ]);

  const result: BrewMethodPageData = {
    method,
    topRecipes,
    recipeCount,
    averageRating,
    equipment: equipmentStats,
  };

  await cache.set(cacheKey, result, { ttl: 3600 }); // 1 hour
  return result;
}
```

### Model Layer

`apps/api/src/modules/recipe/model.ts` — new functions:

```ts
export async function getTopRecipesForMethod(method: string, limit: number) {
  // Get recipes using this brew method, ranked by likeCount
  const methodRecipeIds = db.select({ id: recipeVersions.recipeId })
    .from(recipeVersions)
    .where(eq(recipeVersions.brewMethod, method));

  return db.query.recipes.findMany({
    where: and(
      inArray(recipes.id, methodRecipeIds),
      eq(recipes.visibility, 'public'),
      isNull(recipes.deletedAt),
    ),
    orderBy: desc(recipes.likeCount),
    limit,
    with: {
      author: { columns: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });
}

export async function getRecipeCountForMethod(method: string) {
  const result = await db.select({ count: count() })
    .from(recipeVersions)
    .innerJoin(recipes, eq(recipeVersions.recipeId, recipes.id))
    .where(
      and(
        eq(recipeVersions.brewMethod, method),
        eq(recipes.visibility, 'public'),
        isNull(recipes.deletedAt),
      ),
    );
  return result[0].count;
}

export async function getAverageRatingForMethod(method: string) {
  const result = await db.select({
    avg: sql<number>`coalesce(avg(${userRecipeRatings.rating}), 0)`,
  })
    .from(userRecipeRatings)
    .innerJoin(recipes, eq(userRecipeRatings.recipeId, recipes.id))
    .innerJoin(recipeVersions, eq(recipeVersions.recipeId, recipes.id))
    .where(
      and(
        eq(recipeVersions.brewMethod, method),
        eq(recipes.visibility, 'public'),
        isNull(recipes.deletedAt),
      ),
    );
  return Number(result[0].avg) || null;
}

export async function getEquipmentStatsForMethod(method: string) {
  // Get equipment used in recipes of this brew method
  const equipmentForMethod = await db
    .select({
      equipmentId: recipeEquipment.equipmentId,
      name: equipment.name,
      type: equipment.type,
      usageCount: sql<number>`count(${recipeEquipment.id})`,
    })
    .from(recipeEquipment)
    .innerJoin(recipeVersions, eq(recipeEquipment.recipeVersionId, recipeVersions.id))
    .innerJoin(recipes, eq(recipeVersions.recipeId, recipes.id))
    .innerJoin(equipment, eq(recipeEquipment.equipmentId, equipment.id))
    .where(
      and(
        eq(recipeVersions.brewMethod, method),
        eq(recipes.visibility, 'public'),
        isNull(recipes.deletedAt),
        isNull(equipment.deletedAt),
      ),
    )
    .groupBy(recipeEquipment.equipmentId, equipment.name, equipment.type)
    .orderBy(desc(sql`count(${recipeEquipment.id})`))
    .limit(10);

  return {
    totalUsed: equipmentForMethod.length,
    topEquipment: equipmentForMethod,
  };
}
```

### Frontend

#### BrewMethodPage

`apps/web/src/pages/BrewMethodPage.tsx`:

```tsx
export function BrewMethodPage() {
  const { method } = useParams<{ method: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ['brewMethod', method],
    queryFn: () => api.get(`/recipes/brew-method/${method}?limit=12`),
  });

  if (isLoading) return <LoadingSkeleton />;
  if (!data) return <NotFoundPage />;

  return (
    <div>
      {/* Hero section */}
      <section className="bg-gradient-to-b from-amber-50 to-white py-12">
        <h1 className="text-4xl font-bold">{formatMethodName(method)}</h1>
        <p className="text-lg text-gray-600 mt-2">
          {data.recipeCount} recipes · Avg rating: {data.averageRating?.toFixed(1) ?? 'N/A'}
        </p>
      </section>

      {/* Top recipes grid */}
      <section>
        <h2>Top Recipes</h2>
        <RecipeGrid recipes={data.topRecipes} />
      </section>

      {/* Equipment recommendations */}
      <section>
        <h2>Popular Equipment</h2>
        <EquipmentGrid equipment={data.topEquipment} />
      </section>

      {/* Brew statistics */}
      <section>
        <h2>Brew Statistics</h2>
        <BrewStats recipeCount={data.recipeCount} avgRating={data.averageRating} />
      </section>
    </div>
  );
}
```

#### SEO

`apps/web/src/components/seo/BrewMethodSEO.tsx`:

```tsx
export function BrewMethodSEO({ method, data }: { method: string; data: BrewMethodPageData }) {
  const title = `${formatMethodName(method)} Recipes - BrewForm`;
  const description = `Discover the best ${formatMethodName(method)} coffee recipes. ${data.recipeCount} community recipes with an average rating of ${data.averageRating?.toFixed(1) ?? 'N/A'}.`;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <script type="application/ld+json">
        {JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: title,
          description,
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: data.topRecipes.slice(0, 5).map((recipe, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: recipe.title,
              url: `${window.location.origin}/recipes/${recipe.slug}`,
            })),
          },
        })}
      </script>
    </Helmet>
  );
}
```

#### Router

`apps/web/src/router.tsx`:

```tsx
{
  path: 'brew/:method',
  lazy: async () => {
    const { BrewMethodPage } = await import('./pages/BrewMethodPage.tsx');
    return { Component: BrewMethodPage };
  },
},
```

#### FilterChip Navigation

In `apps/web/src/components/recipe/FilterSidebar.tsx` — add clickable brew method chips that link to `/brew/:method`:

```tsx
<Chip
  key={method}
  onClick={() => navigate(`/brew/${method}`)}
  active={filters.brewMethod === method}
>
  {formatMethodName(method)}
</Chip>
```

### Types

`apps/web/src/api/types.ts`:

```ts
export interface BrewMethodPageData {
  method: string;
  topRecipes: Recipe[];
  recipeCount: number;
  averageRating: number | null;
  equipment: {
    totalUsed: number;
    topEquipment: Array<{
      equipmentId: string;
      name: string;
      type: string;
      usageCount: number;
    }>;
  };
}
```

### Helper Function

```ts
function formatMethodName(method: string): string {
  return method
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/recipes/brew-method/:method` | Brew method page data |

**Request:**
```http
GET /api/v1/recipes/brew-method/v60?limit=12
```

**Response:**
```json
{
  "data": {
    "method": "v60",
    "topRecipes": [...],
    "recipeCount": 245,
    "averageRating": 8.2,
    "equipment": {
      "totalUsed": 15,
      "topEquipment": [
        { "equipmentId": "...", "name": "Hario V60 Dripper", "type": "brewer", "usageCount": 89 }
      ]
    }
  }
}
```

## Frontend Components

| Component | Location | Description |
|-----------|----------|-------------|
| `BrewMethodPage` | `pages/BrewMethodPage.tsx` | Main brew method landing page |
| `BrewMethodSEO` | `components/seo/BrewMethodSEO.tsx` | SEO meta tags + JSON-LD |
| `BrewStats` | `components/recipe/BrewStats.tsx` | Statistics display |
| `EquipmentGrid` | `components/equipment/EquipmentGrid.tsx` | Equipment cards grid |

## Acceptance Criteria

- [ ] Each brew method has a unique page at `/brew/:method`
- [ ] Page shows hero section with method name and stats
- [ ] Top 12 recipes displayed as cards
- [ ] Equipment section shows top 10 used equipment
- [ ] Community stats show recipe count and average rating
- [ ] SEO meta tags are unique per brew method
- [ ] JSON-LD structured data included
- [ ] Invalid brew method shows 404
- [ ] Clicking brew method chips on RecipeListPage navigates to page
- [ ] Page is lazy-loaded (not in main bundle)
- [ ] Results cached for 1 hour
- [ ] Response time < 200ms
- [ ] `make check` passes
- [ ] `make lint` passes

## Implementation Steps

1. **Add model functions** (`getTopRecipesForMethod`, `getRecipeCountForMethod`, `getAverageRatingForMethod`, `getEquipmentStatsForMethod`) to `apps/api/src/modules/recipe/model.ts`
2. **Add `getBrewMethodPageData()`** to `apps/api/src/modules/recipe/service.ts`
3. **Add `GET /brew-method/:method` route** to `apps/api/src/modules/recipe/index.ts`
4. **Create `BrewMethodPage`** in `apps/web/src/pages/BrewMethodPage.tsx`
5. **Create `BrewMethodSEO`** component
6. **Create `BrewStats`** component
7. **Add route** `/brew/:method` to router (lazy-loaded)
8. **Update `FilterSidebar`** — add brew method chip navigation
9. **Add API types** to `apps/web/src/api/types.ts`
10. **Add tests** for brew method page data queries
11. **Run `make check && make lint && make test`**

## Dependencies

- Existing: recipe module, recipeVersions, recipeEquipment, equipment, userRecipeRatings tables
- Existing: brewMethodEnum (11 values), FilterSidebar component
- Existing: CacheProvider for caching

## References

- [Drizzle ORM docs](/drizzle-team/drizzle-orm-docs) — joins, aggregates
- [React docs](/reactjs/react.dev) — Helmet for SEO, lazy loading
- Existing: `packages/db/src/schema.ts:33` — `brewMethodEnum` (11 brew methods)
- Existing: `apps/api/src/modules/recipe/service.ts:469` — `listRecipes()` filtering pattern
