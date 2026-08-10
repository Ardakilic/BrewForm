# F11 — Advanced Search with Faceted Filters

> ✅ Shipped via OpenSpec change `f11-advanced-search` (2026-08-02).
> Implemented per the rebased spec: cursor pagination shipped via D27, equipment facet via D12, this change adds author/date/rating filters + relevance ranking + OpenAPI fix.

> **Validation status (2026-07-13): ⚠️ Outdated — corrections below (some scope already shipped)**
>
> - Cursor pagination shipped (D27). The real cursor is a base64 `(createdAt, id)` composite (`encodeCursor`), decoded in `findCursor` (apps/api/src/modules/recipe/model.ts:920) via `buildCursorWhere` (model.ts:884). Plan's `cursor: z.string().uuid()` + `findManyCursor` using `lt(recipes.id, cursor)` is wrong — drop `findManyCursor`, reuse `findCursor`.
> - Response envelope wrong: cursor lists emit `meta.cursor.{nextCursor,hasMore,total?}` via `cursorPaginated()` (apps/api/src/utils/response/index.ts:71-89); offset lists emit `meta.pagination` via `paginated()` (:41-56). The plan's flat `meta.nextCursor`/`meta.hasMore` does not exist.
> - `RecipeFilterSchema` is now packages/shared/src/schemas/recipe.ts:129-175 (not :140) and already carries `search`, `tasteNoteIds` + deprecated `tasteNoteId`, `sortBy` incl. `rating`, `cursor` (string, not uuid), `includeTotal`. Do NOT replace wholesale — extend additively (add author/dateFrom/dateTo/min-maxRating only).
> - Indexes: three of four already exist — `recipe_author_visibility_idx` (schema.ts:149), `recipe_visibility_created_idx` (:157, note actual name has no `_at`), `recipe_visibility_like_count_idx` (:166), plus cursor index `recipe_created_at_id_idx` (:174). The ONLY new index is `recipe_visibility_featured_idx`.
> - Equipment-compatibility facet (US-11.5) is ALREADY implemented: `buildRecipeFilters` maps `equipmentId` → `recipes.currentVersionId IN (recipeEquipment…)` (model.ts:151-160). Current keyword search (model.ts:113-128) ilikes `recipes.title` + `recipeVersions.productName` only; `personalNotes` column exists (schema.ts:208) if you widen it.
> - App-code ranking accessor `recipe.currentVersion?.productName` won't work — no `currentVersion` relation exists (recipesRelations, schema.ts:991 has only `versions` + `currentVersionId` column). Join/fetch the version explicitly.
> - `apps/web/src/api/types.ts` was DELETED (D42) — step 7 is stale; response types are z.infer from packages/shared. There is no `components/recipe/FilterSidebar.tsx`: filter UI lives in apps/web/src/components/recipe-list/ (FilterField.tsx, useRecipeFilters.ts, ActiveFilterBadge.tsx) + apps/web/src/utils/recipe-filters.ts; the proposed `ActiveFilterChips` duplicates existing `ActiveFilterBadge`.
> - tsvector/GIN still correctly avoided — conventions memory reaffirms "No raw SQL, no Postgres-specific operators"; the ilike approach stays valid. Salvageable net-new scope: author/date/rating facets + relevance ranking.

## Overview

Enhance the existing recipe listing with full-text search ranking, faceted filters (author, date range, rating range, equipment compatibility), and cursor-based pagination. Currently, search uses simple `ilike` on title/productName. This feature adds relevance ranking and multi-dimensional filtering.

## Goals

1. Full-text search with weighted ranking (title matches scored higher than content matches)
2. Faceted filters: author, date range, rating range, equipment compatibility
3. Cursor-based pagination for efficient infinite scroll
4. Maintain backward compatibility with existing `page`/`perPage` pagination
5. Sub-200ms response time on filtered queries with proper indexes

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| US-11.1 | As a user, I can search recipes by keyword and see most relevant results first | P0 |
| US-11.2 | As a user, I can filter recipes by author username | P0 |
| US-11.3 | As a user, I can filter recipes by date range (created after/before) | P1 |
| US-11.4 | As a user, I can filter recipes by average rating range | P1 |
| US-11.5 | As a user, I can filter recipes by equipment compatibility | P1 |
| US-11.6 | As a user, I can use cursor-based infinite scroll on recipe lists | P1 |
| US-11.7 | As a user, I can combine multiple filters simultaneously | P0 |
| US-11.8 | As a user, I see the active filter count and can clear filters individually | P2 |

## Technical Design

### Database Indexes (Drizzle Schema)

Add composite indexes to `packages/db/src/schema.ts` on the `recipes` table for efficient filtered queries:

```ts
// packages/db/src/schema.ts — add to recipes table indexes array
index('recipe_author_visibility_idx').on(table.authorId, table.visibility),
index('recipe_visibility_created_at_idx').on(table.visibility, table.createdAt),
index('recipe_visibility_like_count_idx').on(table.visibility, table.likeCount),
index('recipe_visibility_featured_idx').on(table.visibility, table.featured),
```

**Why not tsvector/GIN?** The project convention is "No Postgres-specific operators" and "No raw SQL." The plan uses Drizzle ORM `ilike` predicates exclusively and performs ranking in application code for database-agnostic portability.

### New Shared Schemas

Extend `packages/shared/src/schemas/recipe.ts` — `RecipeFilterSchema`:

```ts
export const RecipeFilterSchema = z.object({
  // Existing filters (keep all)
  brewMethod: BrewMethodEnum.optional(),
  drinkType: DrinkTypeEnum.optional(),
  visibility: VisibilityEnum.optional(),
  authorId: z.uuid().optional(),
  equipmentId: z.uuid().optional(),
  tasteNoteIds: z.string().optional(),
  tasteNoteId: z.uuid().optional(),
  grinder: z.string().optional(),
  mainBrewer: z.string().max(200).optional(),
  coffeeVarietyId: z.uuid().optional(),
  search: z.string().optional(),

  // NEW faceted filters
  author: z.string().max(100).optional(),          // username/displayName search
  dateFrom: z.coerce.date().optional(),             // recipes created after this date
  dateTo: z.coerce.date().optional(),               // recipes created before this date
  minRating: z.coerce.number().int().min(1).max(10).optional(),
  maxRating: z.coerce.number().int().min(1).max(10).optional(),

  // Cursor-based pagination (mutually exclusive with page/perPage)
  cursor: z.string().uuid().optional(),             // recipe ID to paginate from
  limit: z.coerce.number().int().positive().max(100).default(20),

  // Keep existing pagination for backward compatibility
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(['createdAt', 'likeCount', 'rating']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).refine(
  (data) => !(data.cursor && data.page !== 1),
  { message: 'Cannot use cursor and page pagination simultaneously' },
);
```

### API Changes

#### Enhanced `GET /recipes`

**New query parameters:**
- `author` (string) — filter by author username substring
- `dateFrom` (ISO date) — recipes created after this date
- `dateTo` (ISO date) — recipes created before this date
- `minRating` (1-10) — minimum average rating
- `maxRating` (1-10) — maximum average rating
- `cursor` (UUID) — cursor for pagination
- `limit` (number) — items per page for cursor mode

**Response format for cursor pagination:**

```ts
{
  data: Recipe[],
  meta: {
    nextCursor: string | null,  // null when no more results
    hasMore: boolean,
    total?: number,             // only in page mode
    page?: number,
    perPage?: number,
    totalPages?: number,
  }
}
```

#### Search Ranking Algorithm

In `apps/api/src/modules/recipe/service.ts` — `listRecipes()`:

```ts
// Drizzle-only ILIKE-based search (no raw SQL, no Postgres-specific operators)
if (filters.search) {
  const sanitized = filters.search.replace(/[%_]/g, '');
  if (sanitized) {
    const searchTerm = `%${sanitized}%`;

    // Apply ILIKE filters — ranking is done in application code
    conditions.push(
      or(
        ilike(recipes.title, searchTerm),
        inArray(
          recipes.id,
          db.select({ id: recipeVersions.recipeId }).from(recipeVersions).where(
            or(
              ilike(recipeVersions.productName, searchTerm),
              ilike(recipeVersions.personalNotes, searchTerm),
            ),
          ),
        ),
      ),
    );
  }
}
```

**Ranking in application code:** After fetching results, compute simple weights in JS:

```ts
// Application-level ranking (no raw SQL)
if (filters.search && results.length > 0) {
  const searchLower = filters.search.toLowerCase();
  results.sort((a, b) => {
    const scoreA = getSearchScore(a, searchLower);
    const scoreB = getSearchScore(b, searchLower);
    return scoreB - scoreA; // higher score first
  });
}

function getSearchScore(recipe: any, searchLower: string): number {
  let score = 0;
  if (recipe.title?.toLowerCase().includes(searchLower)) score += 3;
  if (recipe.currentVersion?.productName?.toLowerCase().includes(searchLower)) score += 2;
  return score;
}
```

#### Rating Filter

Join `userRecipeRatings` to compute average rating per recipe:

```ts
if (filters.minRating || filters.maxRating) {
  const ratingSubquery = db.select({
    recipeId: userRecipeRatings.recipeId,
    avgRating: sql<number>`avg(${userRecipeRatings.rating})`,
  }).from(userRecipeRatings)
    .groupBy(userRecipeRatings.recipeId);

  if (filters.minRating) {
    conditions.push(
      inArray(
        recipes.id,
        db.select({ recipeId: ratingSubquery.recipeId })
          .from(ratingSubquery)
          .where(gte(ratingSubquery.avgRating, filters.minRating)),
      ),
    );
  }
  if (filters.maxRating) {
    conditions.push(
      inArray(
        recipes.id,
        db.select({ recipeId: ratingSubquery.recipeId })
          .from(ratingSubquery)
          .where(lte(ratingSubquery.avgRating, filters.maxRating)),
      ),
    );
  }
}
```

### Model Layer Changes

`apps/api/src/modules/recipe/model.ts` — new function:

```ts
export async function findManyCursor(
  where: SQL | undefined,
  cursor: string | null,
  limit: number,
  sortBy: string = 'createdAt',
  sortOrder: string = 'desc',
  searchRank?: SQL,
) {
  const orderByColumn = sortBy === 'likeCount' ? recipes.likeCount : recipes.createdAt;
  const baseOrder = sortOrder === 'asc' ? asc(orderByColumn) : desc(orderByColumn);

  // If search is active, order by rank DESC then by the sort column
  const orderBy = searchRank
    ? [desc(searchRank), baseOrder]
    : [baseOrder];

  const cursorCondition = cursor
    ? sortOrder === 'desc'
      ? lt(recipes.id, cursor)
      : gt(recipes.id, cursor)
    : undefined;

  const finalWhere = cursorCondition
    ? and(isNull(recipes.deletedAt), where, cursorCondition)
    : and(isNull(recipes.deletedAt), where);

  const data = await db.query.recipes.findMany({
    where: finalWhere,
    orderBy,
    limit: limit + 1, // fetch one extra to detect hasMore
    with: {
      author: { columns: { id: true, username: true, displayName: true } },
    },
  });

  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return { recipes: items, nextCursor, hasMore };
}
```

### Service Layer Changes

`apps/api/src/modules/recipe/service.ts` — update `listRecipes()`:

```ts
export async function listRecipes(
  filters: any,
  page: number,
  perPage: number,
  _requestingUserId: string | null = null,
  isAdmin: boolean = false,
) {
  // ... existing condition building ...

  // NEW: author username filter
  if (filters.author) {
    const sanitized = filters.author.replace(/[%_]/g, '');
    if (sanitized) {
      const authorIds = db.select({ id: users.id }).from(users).where(
        or(
          ilike(users.username, `%${sanitized}%`),
          ilike(users.displayName, `%${sanitized}%`),
        ),
      );
      conditions.push(inArray(recipes.authorId, authorIds));
    }
  }

  // NEW: date range filter
  if (filters.dateFrom) {
    conditions.push(gte(recipes.createdAt, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(recipes.createdAt, filters.dateTo));
  }

  // ... existing filters ...

  // Branch: cursor vs page pagination
  if (filters.cursor) {
    return model.findManyCursor(where, filters.cursor, filters.limit, filters.sortBy, filters.sortOrder);
  }

  return model.findMany(where, page, perPage, filters.sortBy, filters.sortOrder);
}
```

### Frontend Components

#### Enhanced FilterSidebar

`apps/web/src/components/recipe/FilterSidebar.tsx` — extend with:

```tsx
// New filter sections
<FilterSection title="Author">
  <input
    type="text"
    placeholder="Search by author..."
    value={filters.author ?? ''}
    onChange={(e) => updateFilter('author', e.target.value || undefined)}
  />
</FilterSection>

<FilterSection title="Date Range">
  <input type="date" value={filters.dateFrom} onChange={...} />
  <input type="date" value={filters.dateTo} onChange={...} />
</FilterSection>

<FilterSection title="Rating">
  <RangeSlider
    min={1} max={10}
    value={[filters.minRating ?? 1, filters.maxRating ?? 10]}
    onChange={([min, max]) => {
      updateFilter('minRating', min);
      updateFilter('maxRating', max);
    }}
  />
</FilterSection>

<FilterSection title="Active Filters">
  <ActiveFilterChips filters={activeFilters} onRemove={removeFilter} />
  <button onClick={clearAllFilters}>Clear all</button>
</FilterSection>
```

#### Infinite Scroll

`apps/web/src/pages/recipes/RecipeListPage.tsx` — add cursor-based loading:

```tsx
// Use IntersectionObserver for infinite scroll
const loadMore = useCallback(() => {
  if (data?.meta.nextCursor && !isLoadingMore) {
    fetchNextPage({ cursor: data.meta.nextCursor });
  }
}, [data?.meta.nextCursor, isLoadingMore]);

// Render trigger element
<div ref={loadMoreRef} className="h-10" />
```

### Frontend API Client

`apps/web/src/api/client.ts` — extend recipe list function:

```ts
export async function listRecipes(filters: RecipeFilters) {
  const params = new URLSearchParams();
  // ... set all filter params including new ones ...
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (filters.author) params.set('author', filters.author);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.minRating) params.set('minRating', String(filters.minRating));
  if (filters.maxRating) params.set('maxRating', String(filters.maxRating));
  return api.get(`/recipes?${params.toString()}`);
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/recipes` | Enhanced with new filter params + cursor pagination |

**Request Example:**
```
GET /api/v1/recipes?search=espresso&author=coffee&dateFrom=2025-01-01&minRating=7&cursor=abc-123&limit=20
```

**Response (cursor mode):**
```json
{
  "data": [...],
  "meta": {
    "nextCursor": "def-456",
    "hasMore": true
  }
}
```

**Response (page mode — backward compatible):**
```json
{
  "data": [...],
  "meta": {
    "page": 1,
    "perPage": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

## Frontend Components

| Component | Location | Description |
|-----------|----------|-------------|
| `FilterSidebar` | `components/recipe/FilterSidebar.tsx` | Extended with date/author/rating filters |
| `ActiveFilterChips` | `components/recipe/ActiveFilterChips.tsx` | Visual chips showing active filters with remove |
| `RatingRangeSlider` | `components/ui/RatingRangeSlider.tsx` | Dual-thumb slider for rating range |
| `InfiniteScrollList` | `components/ui/InfiniteScrollList.tsx` | Reusable infinite scroll wrapper |
| `RecipeListPage` | `pages/recipes/RecipeListPage.tsx` | Updated to use cursor pagination + new filters |

## Acceptance Criteria

- [ ] Search returns results ranked by relevance (title > productName > notes)
- [ ] Author filter matches partial username/displayName (case-insensitive)
- [ ] Date range filter works with dateFrom and dateTo independently
- [ ] Rating filter computes average rating and filters correctly
- [ ] Equipment filter shows recipes using specific equipment
- [ ] Cursor pagination returns correct next page with `nextCursor`
- [ ] Page-based pagination still works (backward compatible)
- [ ] Combined filters produce correct AND logic
- [ ] Filter sidebar shows active filter count
- [ ] Clear individual filter or all filters works
- [ ] Infinite scroll loads next page on scroll threshold
- [ ] Query time < 200ms with proper indexes on datasets up to 10K recipes
- [ ] `make check` passes (type-check)
- [ ] `make lint` passes

## Implementation Steps

1. **Add composite indexes** to `packages/db/src/schema.ts` recipes table
2. **Run `make db-generate && make db-migrate`** to apply index changes
3. **Extend `RecipeFilterSchema`** in `packages/shared/src/schemas/recipe.ts` with new filter params
4. **Update `model.ts`** — add `findManyCursor()` function, add rating subquery support
5. **Update `service.ts`** — extend `listRecipes()` with author/date/rating/equipment filters
6. **Update `index.ts`** — adjust response to include `nextCursor` in cursor mode
7. **Add `listRecipes` type** to `apps/web/src/api/types.ts` for new response shape
8. **Update `FilterSidebar`** — add author search, date range picker, rating slider
9. **Add `ActiveFilterChips`** component
10. **Update `RecipeListPage`** — implement cursor-based infinite scroll with IntersectionObserver
11. **Add tests** for new filter logic in `service.test.ts`
12. **Run `make check && make lint && make test`**

## Dependencies

- Existing: recipe module (model/service/index), RecipeFilterSchema, FilterSidebar component
- External: `@std/testing/bdd` for tests
- No new package dependencies (rating slider is custom UI or use Base UI range)

## References

- [Drizzle ORM ORM docs](/drizzle-team/drizzle-orm-docs) — query building, indexes
- [Hono docs](/websites/hono_dev) — route handling, middleware
- [React docs](/reactjs/react.dev) — hooks, effects for infinite scroll
- Existing: `apps/api/src/modules/recipe/service.ts:469` — `listRecipes()` current implementation
- Existing: `apps/api/src/modules/recipe/model.ts:103` — `findMany()` current implementation
- Existing: `packages/shared/src/schemas/recipe.ts:140` — `RecipeFilterSchema` current definition
