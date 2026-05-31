# F13 — Trending / Popular Recipes & Explore Page

## Overview

Dedicated explore page with time-window trending recipes (today, week, month), category-based browsing, and admin-curated featured recipes. Computes trending from existing data (likes, ratings, comments) — no new tables.

## Goals

1. Trending recipes computed by engagement velocity within time windows
2. Featured recipes section curated by admins (already have `featured` column)
3. Category-based browsing by brew method, drink type
4. Dedicated `/explore` page as primary discovery entry point
5. Add "Explore" to main navbar navigation

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| US-13.1 | As a user, I can visit an Explore page to discover trending recipes | P0 |
| US-13.2 | As a user, I can switch between trending time windows (today, week, month) | P0 |
| US-13.3 | As a user, I can browse featured recipes curated by admins | P1 |
| US-13.4 | As a user, I can browse recipes by brew method or drink type category | P1 |
| US-13.5 | As a user, I see recipe cards with like count, rating, and brew method badge | P1 |
| US-13.6 | As an admin, I can mark recipes as featured from the admin panel | P0 (existing) |

## Technical Design

### Trending Algorithm

No new tables. Compute trending from existing `userRecipeLikes`, `userRecipeRatings`, `comments` within time windows:

```ts
// apps/api/src/modules/recipe/service.ts

type TrendingPeriod = 'day' | 'week' | 'month';

export async function getTrendingRecipes(
  period: TrendingPeriod,
  limit: number = 20,
): Promise<TrendingRecipe[]> {
  const since = getSinceDate(period);

  // 1. Get recipes with recent activity (likes + comments + ratings)
  const activeRecipes = await db
    .select({
      recipeId: recipes.id,
      recentLikes: sql<number>`coalesce(sum(case when ${userRecipeLikes.createdAt} >= ${since} then 1 else 0 end), 0)`,
      recentComments: sql<number>`coalesce(sum(case when ${comments.createdAt} >= ${since} then 1 else 0 end), 0)`,
      recentRatings: sql<number>`coalesce(sum(case when ${userRecipeRatings.createdAt} >= ${since} then 1 else 0 end), 0)`,
      avgRating: sql<number>`coalesce(avg(${userRecipeRatings.rating}), 0)`,
    })
    .from(recipes)
    .leftJoin(userRecipeLikes, eq(recipes.id, userRecipeLikes.recipeId))
    .leftJoin(comments, eq(recipes.id, comments.recipeId))
    .leftJoin(userRecipeRatings, eq(recipes.id, userRecipeRatings.recipeId))
    .where(
      and(
        eq(recipes.visibility, 'public'),
        isNull(recipes.deletedAt),
        gte(recipes.createdAt, since),
      ),
    )
    .groupBy(recipes.id)
    .orderBy(
      desc(sql`(
        ${sql.raw('coalesce(sum(case when ')} ${userRecipeLikes.createdAt} >= ${since} ${sql.raw(' then 1 else 0 end), 0)')} * 2
        + ${sql.raw('coalesce(sum(case when ')} ${comments.createdAt} >= ${since} ${sql.raw(' then 1 else 0 end), 0)')}
        + ${sql.raw('coalesce(avg(')} ${userRecipeRatings.rating} ${sql.raw('), 0)')}
      )`),
    )
    .limit(limit);

  // Fetch full recipe data for trending IDs
  const recipeIds = activeRecipes.map((r) => r.recipeId);
  if (recipeIds.length === 0) return [];

  return db.query.recipes.findMany({
    where: inArray(recipes.id, recipeIds),
    with: {
      author: { columns: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });
}

function getSinceDate(period: TrendingPeriod): Date {
  const now = new Date();
  switch (period) {
    case 'day':
      now.setDate(now.getDate() - 1);
      break;
    case 'week':
      now.setDate(now.getDate() - 7);
      break;
    case 'month':
      now.setMonth(now.getMonth() - 1);
      break;
  }
  return now;
}
```

### Featured Recipes

Already supported — `recipes.featured` is a boolean column. `toggleFeature()` exists in service.

```ts
export async function getFeaturedRecipes(limit: number = 20): Promise<Recipe[]> {
  return db.query.recipes.findMany({
    where: and(
      eq(recipes.visibility, 'public'),
      eq(recipes.featured, true),
      isNull(recipes.deletedAt),
    ),
    orderBy: desc(recipes.createdAt),
    limit,
    with: {
      author: { columns: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });
}
```

### Category Browsing

Reuse existing brew method enum values and drink type enum. No new queries needed — filter by brew method using existing `listRecipes` logic.

```ts
export async function getRecipesByCategory(
  brewMethod?: string,
  drinkType?: string,
  limit: number = 20,
): Promise<Recipe[]> {
  const conditions: SQL[] = [
    eq(recipes.visibility, 'public'),
    isNull(recipes.deletedAt),
  ];

  if (brewMethod) {
    conditions.push(
      inArray(
        recipes.id,
        db.select({ id: recipeVersions.recipeId }).from(recipeVersions).where(
          eq(recipeVersions.brewMethod, brewMethod),
        ),
      ),
    );
  }

  if (drinkType) {
    conditions.push(
      inArray(
        recipes.id,
        db.select({ id: recipeVersions.recipeId }).from(recipeVersions).where(
          eq(recipeVersions.drinkType, drinkType),
        ),
      ),
    );
  }

  return db.query.recipes.findMany({
    where: and(...conditions),
    orderBy: desc(recipes.likeCount),
    limit,
    with: {
      author: { columns: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });
}
```

### API Endpoints

`apps/api/src/modules/recipe/index.ts` — new routes:

```ts
recipe.get(
  '/trending',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Get trending recipes',
    description: 'Returns trending recipes for the given time period, ranked by engagement.',
    responses: { 200: { description: 'List of trending recipes' } },
  }),
  zValidator('query', z.object({
    period: z.enum(['day', 'week', 'month']).default('week'),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })),
  async (c) => {
    const { period, limit } = c.req.valid('query');
    const trending = await service.getTrendingRecipes(period, limit);
    return success(c, trending);
  },
);

recipe.get(
  '/featured',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Get featured recipes',
    description: 'Returns admin-curated featured recipes.',
    responses: { 200: { description: 'List of featured recipes' } },
  }),
  zValidator('query', z.object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })),
  async (c) => {
    const limit = c.req.valid('query').limit;
    const featured = await service.getFeaturedRecipes(limit);
    return success(c, featured);
  },
);
```

### Frontend

#### ExplorePage

`apps/web/src/pages/ExplorePage.tsx`:

```tsx
export function ExplorePage() {
  const [activeTab, setActiveTab] = useState<'trending' | 'featured' | 'new'>('trending');
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');

  const { data: trending } = useQuery({
    queryKey: ['trending', period],
    queryFn: () => api.get(`/recipes/trending?period=${period}&limit=20`),
  });

  const { data: featured } = useQuery({
    queryKey: ['featured'],
    queryFn: () => api.get('/recipes/featured?limit=20'),
  });

  const { data: newest } = useQuery({
    queryKey: ['newest'],
    queryFn: () => api.get('/recipes?sortBy=createdAt&sortOrder=desc&limit=20'),
  });

  const recipes = activeTab === 'trending' ? trending : activeTab === 'featured' ? featured : newest;

  return (
    <div>
      <h1>Explore</h1>

      {/* Period selector (only for trending) */}
      {activeTab === 'trending' && (
        <PeriodSelector value={period} onChange={setPeriod} />
      )}

      {/* Tab navigation */}
      <TabBar activeTab={activeTab} onChange={setActiveTab}>
        <Tab value="trending">Trending</Tab>
        <Tab value="featured">Featured</Tab>
        <Tab value="new">New</Tab>
      </TabBar>

      {/* Category filters */}
      <CategoryFilters />

      {/* Recipe grid */}
      <RecipeGrid recipes={recipes} />
    </div>
  );
}
```

#### CategoryFilters

`apps/web/src/components/recipe/CategoryFilters.tsx`:

```tsx
// Horizontal scrollable chips for brew methods and drink types
// Each chip links to the explore page filtered by that category
// Uses existing brew method and drink type enum values
```

#### Navbar Update

`apps/web/src/components/layout/` — add "Explore" link to main navigation:

```tsx
<NavLink to="/explore">Explore</NavLink>
```

#### Router Update

`apps/web/src/router.tsx`:

```tsx
{ path: 'explore', element: <ExplorePage /> },
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/recipes/trending` | Trending recipes by period |
| `GET` | `/api/v1/recipes/featured` | Admin-curated featured recipes |

**Trending Request:**
```
GET /api/v1/recipes/trending?period=week&limit=20
```

**Trending Response:**
```json
{
  "data": [
    {
      "id": "...",
      "slug": "...",
      "title": "...",
      "author": { "id": "...", "username": "...", "displayName": "..." },
      "likeCount": 42,
      "commentCount": 12,
      "featured": true,
      "createdAt": "2025-12-01T10:00:00Z"
    }
  ]
}
```

**Featured Response:** Same shape as trending.

## Frontend Components

| Component | Location | Description |
|-----------|----------|-------------|
| `ExplorePage` | `pages/ExplorePage.tsx` | Main explore page with tabs |
| `PeriodSelector` | `components/recipe/PeriodSelector.tsx` | Day/Week/Month toggle |
| `TabBar` | `components/ui/TabBar.tsx` | Generic tab bar component |
| `CategoryFilters` | `components/recipe/CategoryFilters.tsx` | Brew method & drink type filter chips |
| `RecipeGrid` | `components/recipe/RecipeGrid.tsx` | Grid of recipe cards |

## Acceptance Criteria

- [ ] Explore page accessible at `/explore`
- [ ] Trending tab shows recipes ranked by recent engagement
- [ ] Period selector switches between day/week/month
- [ ] Featured tab shows admin-curated recipes
- [ ] New tab shows most recently created recipes
- [ ] Category filters allow filtering by brew method
- [ ] Recipe cards show like count, rating, brew method badge
- [ ] "Explore" link appears in main navbar
- [ ] Empty states handled gracefully (no trending recipes yet)
- [ ] Response time < 200ms
- [ ] `make check` passes
- [ ] `make lint` passes

## Implementation Steps

1. **Add `getTrendingRecipes()`** to `apps/api/src/modules/recipe/service.ts`
2. **Add `getFeaturedRecipes()`** to `apps/api/src/modules/recipe/service.ts`
3. **Add `GET /trending` and `GET /featured` routes** to `apps/api/src/modules/recipe/index.ts`
4. **Create `ExplorePage`** in `apps/web/src/pages/ExplorePage.tsx`
5. **Create `PeriodSelector`** component
6. **Create `CategoryFilters`** component
7. **Add route** `/explore` to `apps/web/src/router.tsx`
8. **Add "Explore" link** to navbar
9. **Add API client functions** for trending and featured
10. **Add tests** for trending algorithm
11. **Run `make check && make lint && make test`**

## Dependencies

- Existing: recipe module, userRecipeLikes, comments, userRecipeRatings tables
- Existing: `recipes.featured` column, `toggleFeature()` service function
- Existing: brew method and drink type enums

## References

- [Drizzle ORM docs](/drizzle-team/drizzle-orm-docs) — aggregate queries, left joins
- Existing: `apps/api/src/modules/recipe/service.ts:469` — `listRecipes()` for filtering pattern
- Existing: `apps/api/src/modules/admin/model.ts:491` — `getUserGrowth()` for time-series pattern
- Existing: `packages/db/src/schema.ts:33` — `brewMethodEnum` values
