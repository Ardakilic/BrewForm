# Design — f11-advanced-search

## Architecture

### AS-IS (before F11)

```
┌──────────────────────────────────────────────────────────────┐
│  GET /api/v1/recipes                                          │
│                                                               │
│  Query Params (RecipeFilterSchema):                           │
│    brewMethod, drinkType, visibility, authorId, equipmentId,  │
│    tasteNoteIds, tasteNoteId (deprecated), grinder (DEAD),    │
│    mainBrewer, coffeeVarietyId, search,                       │
│    page, perPage, sortBy, sortOrder, cursor, includeTotal     │
│                                                               │
│  OpenAPI documented params:                                   │
│    page, perPage, sortBy, sortOrder, cursor, includeTotal,    │
│    tasteNoteId, tasteNoteIds                                  │
│    (9 of 17 params UNDOCUMENTED)                              │
│                                                               │
│  buildRecipeFilters (model.ts:88):                            │
│    brewMethod → inArray(recipeVersions.brewMethod)            │
│    drinkType → inArray(recipeVersions.drinkType)              │
│    search → or(ilike(title), inArray(ilike(productName)))     │
│    mainBrewer → inArray(ilike(brewerDetails))                 │
│    coffeeVarietyId → recipeCoffeeVarietyCondition()           │
│    equipmentId → inArray(recipeEquipment)                     │
│    tasteNoteIds → per-id inArray(recipeTasteNotes)            │
│    tasteNoteId → single inArray(recipeTasteNotes)             │
│    grinder → NOT HANDLED (dead field)                         │
│                                                               │
│  Pagination:                                                  │
│    cursor + sortBy=createdAt → findCursor (keyset)            │
│    cursor + sortBy=likeCount/rating → offset fallback         │
│    no cursor → offset                                         │
│                                                               │
│  Ranking: NONE (DB orderBy only)                              │
└──────────────────────────────────────────────────────────────┘
```

### TO-BE (after F11)

```
┌──────────────────────────────────────────────────────────────┐
│  GET /api/v1/recipes                                          │
│                                                               │
│  Query Params (RecipeFilterSchema):                           │
│    brewMethod, drinkType, visibility, authorId, equipmentId,  │
│    tasteNoteIds, tasteNoteId (deprecated),                    │
│    mainBrewer, coffeeVarietyId, search,                       │
│    author (NEW), dateFrom (NEW), dateTo (NEW),               │
│    minRating (NEW), maxRating (NEW),                         │
│    page, perPage, sortBy, sortOrder, cursor, includeTotal     │
│    (grinder REMOVED — was dead schema)                        │
│                                                               │
│  OpenAPI documented params: ALL 21 (was 8)                    │
│                                                               │
│  buildRecipeFilters (model.ts:88):                            │
│    ...existing branches unchanged...                          │
│    search → or(ilike(title), inArray(ilike(productName,       │
│              ilike(personalNotes)))) ← WIDENED                │
│    author (NEW) → inArray(authorId, users ilike subquery)     │
│    dateFrom (NEW) → gte(createdAt)                            │
│    dateTo (NEW) → lte(createdAt)                              │
│    minRating (NEW) → inArray(id, avg(rating) having gte)      │
│    maxRating (NEW) → inArray(id, avg(rating) having lte)      │
│                                                               │
│  Pagination:                                                  │
│    cursor + sortBy=createdAt + NO search → findCursor         │
│    cursor + sortBy=likeCount/rating → offset fallback         │
│    cursor + search active → offset fallback (NEW)             │
│    no cursor → offset                                         │
│                                                               │
│  Ranking:                                                     │
│    search active → rankRecipes() in JS (title=3, pn=2, pn=1)  │
│    no search → DB orderBy only                                │
└──────────────────────────────────────────────────────────────┘
```

## Key Decisions

### D1: Offset fallback when search is active (not SQL rank + keyset)

**Decision:** When `search` is active and `cursor` is provided, fall back to offset pagination. Ranking is applied in JavaScript after the DB query returns.

**Rationale:** A `(createdAt, id)` keyset cursor encodes position in createdAt-order. Relevance ranking reorders results by a computed score that has no relationship to `createdAt`. Using a keyset cursor with rank ordering would skip high-rank items on page 2 that have an older `createdAt` than the page-1 boundary. The offset fallback is correct, simple (one-line routing change), and matches user behaviour — search is shallow (users rarely scroll past page 2-3 of search results).

**Rejected alternatives:**
- **SQL CASE WHEN rank + 3-tuple cursor**: Deterministic rank via `CASE WHEN title ilike THEN 3 WHEN productName ilike THEN 2 ...` in SQL `orderBy`, with a cursor encoding `(rank, createdAt, id)`. Correct but needs a raw `sql` template in both ORDER BY and WHERE (D03 raw-SQL exception), a 3-field cursor payload, and a new composite index on `(rank, createdAt, id)` — but `rank` is a computed expression, not a column, so no index can cover it. Over-engineered for a recipe site with hundreds of recipes.
- **Rank in-app, cursor on createdAt**: Fetch by createdAt cursor, re-sort page by rank. WRONG — skips items (the keyset page boundary is on createdAt, but display order is rank-first).

### D2: rankRecipes lives in service.ts (not model.ts)

**Decision:** The `rankRecipes` helper is a pure JavaScript function that sorts an array of recipe rows. It lives in `service.ts` because it operates on the fetched result rows, not on SQL conditions. `model.ts` is for DB queries only.

**Rationale:** The 3-layer pattern (index.ts → service.ts → model.ts) keeps DB queries in model.ts and business logic in service.ts. Ranking is business logic (weighting, stability guarantee) applied to fetched data, so it belongs in service.ts.

### D3: Current version fields fetched via existing `with: { versions: ... }` relation

**Decision:** To access `productName` and `personalNotes` for ranking, the service fetches the recipe's current version via the existing `recipesRelations.versions` relation (many versions) and filters to the one matching `currentVersionId` in JS. No new `currentVersion` relation is added to the schema.

**Rationale:** Adding a `currentVersion` relation to `recipesRelations` would require a Drizzle schema change and migration. The existing `versions` relation already returns all versions; filtering in JS is O(versions per recipe) — typically 1-3, never more than ~10. The cost is negligible and avoids schema churn.

**Rejected alternative:** Add a `currentVersion` relation (`one(recipeVersions, { fields: [recipes.currentVersionId], references: [recipeVersions.id] })`) to `recipesRelations`. Cleaner accessor (`recipe.currentVersion?.productName`) but requires schema + migration work for a ranking helper that runs on already-fetched data. YAGNI — the JS filter is 1 line.

### D4: Native HTML inputs for date and rating (no libraries)

**Decision:** Use `<input type="date">` for date filters and `<input type="number">` for rating filters. No date-picker library, no slider library, no RangeSlider component.

**Rationale:** The project has no UI component library and no slider dependency. Adding one for 5 filter inputs is over-engineering. Native inputs are accessible, work on mobile, and require zero dependencies. The existing filter sidebar uses native `<select>` and `<input type="text">` — this matches.

### D5: grinder field removed (not wired)

**Decision:** Remove the `grinder` field from `RecipeFilterSchema`. It was declared but never read by `buildRecipeFilters` or any service code — it is dead schema.

**Rationale:** Wiring it would require adding a `grinder` branch to `buildRecipeFilters` (ilike on `recipeVersions.grinder`). But `grinder` as a free-text field is better served by the `search` filter (which now covers `personalNotes` and could be widened to `grinder` too). Keeping a dead field in the schema misleads API consumers into thinking `?grinder=Niche` does something. Removing it is the honest fix. If grinder-specific filtering is needed later, it can be re-added with a working implementation.

### D6: No facet counts (filter inputs only)

**Decision:** The spec does NOT include per-value facet counts (e.g. "Author: Alice (12)"). The sidebar shows filter inputs, not aggregate counts.

**Rationale:** Facet counts require N extra `GROUP BY` queries (one per facet) on every list request, doubling query complexity. User value is marginal for a recipe site with hundreds of recipes. Facet counts are a separate future change if usage data justifies them.

## Implementation Reference

### R1: RecipeFilterSchema extension

```ts
// packages/shared/src/schemas/recipe.ts — extend RecipeFilterSchema (current line ~130)
// ADD these fields INSIDE the existing z.object({ ... }), before the pagination fields:

/**
 * Author username or displayName substring filter (case-insensitive ilike).
 * Unlike `authorId` (exact UUID match), this is a free-text search on the
 * author's username or displayName. NEW in F11.
 */
author: z.string().max(100).optional(),

/**
 * Filter to recipes created on or after this date (inclusive).
 * Coerced from ISO 8601 date string. NEW in F11.
 */
dateFrom: z.coerce.date().optional(),

/**
 * Filter to recipes created on or before this date (inclusive).
 * Coerced from ISO 8601 date string. NEW in F11.
 */
dateTo: z.coerce.date().optional(),

/**
 * Minimum average rating (1-10 inclusive). Recipes with zero ratings
 * are excluded (NULL average fails gte). NEW in F11.
 */
minRating: z.coerce.number().int().min(1).max(10).optional(),

/**
 * Maximum average rating (1-10 inclusive). NEW in F11.
 */
maxRating: z.coerce.number().int().min(1).max(10).optional(),

// REMOVE this line (dead field — never read by buildRecipeFilters):
// grinder: z.string().optional(),
```

### R2: RecipeFilterCriteria interface

```ts
// apps/api/src/modules/recipe/model.ts — RecipeFilterCriteria interface (current line ~72)
export interface RecipeFilterCriteria {
  brewMethod?: BrewMethod;
  drinkType?: DrinkType;
  search?: string;
  equipmentId?: string;
  tasteNoteIds?: string;
  tasteNoteId?: string;
  mainBrewer?: string;
  coffeeVarietyId?: string;
  author?: string;        // NEW F11
  dateFrom?: Date;        // NEW F11
  dateTo?: Date;          // NEW F11
  minRating?: number;     // NEW F11
  maxRating?: number;     // NEW F11
}
```

### R3: DB index

```ts
// packages/db/src/schema.ts — recipes table indexes array (after recipe_visibility_like_count_idx ~line 185)

/**
 * Composite index covering "featured public recipes" queries
 * (WHERE visibility = 'public' AND featured = true).
 * Added by F11 — powers future trending/explore page.
 */
index('recipe_visibility_featured_idx').on(table.visibility, table.featured),
```

### R4: i18n keys

```json
// packages/shared/src/i18n/en.json — add to the "recipe.filter" namespace:
"author": "Author",
"authorPlaceholder": "Search by author...",
"dateFrom": "From date",
"dateTo": "To date",
"minRating": "Min rating",
"maxRating": "Max rating"

// packages/shared/src/i18n/tr.json — Turkish translations:
"author": "Yazar",
"authorPlaceholder": "Yazar ara...",
"dateFrom": "Başlangıç tarihi",
"dateTo": "Bitiş tarihi",
"minRating": "Min puan",
"maxRating": "Maks puan"
```

### R5: RecipeFilterSchema test

```ts
// packages/shared/src/schemas/recipe.test.ts — add to existing describe block

it('accepts author filter', () => {
  const result = RecipeFilterSchema.safeParse({ author: 'alice' });
  expect(result.success).toBe(true);
});

it('accepts dateFrom as ISO string and coerces to Date', () => {
  const result = RecipeFilterSchema.safeParse({ dateFrom: '2025-01-01' });
  expect(result.success).toBe(true);
  expect(result.data?.dateFrom).toBeInstanceOf(Date);
});

it('rejects minRating below 1', () => {
  const result = RecipeFilterSchema.safeParse({ minRating: 0 });
  expect(result.success).toBe(false);
});

it('rejects maxRating above 10', () => {
  const result = RecipeFilterSchema.safeParse({ maxRating: 11 });
  expect(result.success).toBe(false);
});

it('silently drops grinder (removed field)', () => {
  const result = RecipeFilterSchema.safeParse({ grinder: 'Niche' });
  expect(result.success).toBe(true);
  expect(result.data?.grinder).toBeUndefined();
  expect((result.data as Record<string, unknown>).grinder).toBeUndefined();
});
```

### R6: Widened search branch

```ts
// apps/api/src/modules/recipe/model.ts — buildRecipeFilters search branch (current ~line 113-128)
// WIDEN the existing or() to include personalNotes:

if (filters.search) {
  const sanitized = filters.search.replace(/[%_]/g, '');
  if (sanitized) {
    const searchTerm = `%${sanitized}%`;
    const searchCondition = or(
      ilike(recipes.title, searchTerm),
      inArray(
        recipes.id,
        db.select({ id: recipeVersions.recipeId }).from(recipeVersions).where(
          or(
            ilike(recipeVersions.productName, searchTerm),
            // F11: personalNotes added to search scope (weight 1)
            ilike(recipeVersions.personalNotes, searchTerm),
          ),
        ),
      ),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
}
```

### R7: Author filter branch

```ts
// apps/api/src/modules/recipe/model.ts — buildRecipeFilters (after mainBrewer branch ~line 143)
// NEW F11: author username/displayName substring filter

if (filters.author) {
  const sanitized = filters.author.replace(/[%_]/g, '');
  if (sanitized) {
    const searchTerm = `%${sanitized}%`;
    conditions.push(
      inArray(
        recipes.authorId,
        db.select({ id: users.id }).from(users).where(
          or(
            ilike(users.username, searchTerm),
            ilike(users.displayName, searchTerm),
          ),
        ),
      ),
    );
  }
}
```

### R8: Date range filter branch

```ts
// apps/api/src/modules/recipe/model.ts — buildRecipeFilters (after author branch)
// NEW F11: date range filter on recipes.createdAt

if (filters.dateFrom) {
  conditions.push(gte(recipes.createdAt, filters.dateFrom));
}
if (filters.dateTo) {
  conditions.push(lte(recipes.createdAt, filters.dateTo));
}
```

### R9: Rating range filter branch

```ts
// apps/api/src/modules/recipe/model.ts — buildRecipeFilters (after dateTo branch)
// NEW F11: rating range filter via avg(userRecipeRatings.rating) subquery
// Import: avg from 'drizzle-orm', userRecipeRatings from '@brewform/db/schema'

if (filters.minRating || filters.maxRating) {
  const havingConditions: SQL[] = [];
  if (filters.minRating) {
    havingConditions.push(gte(avg(userRecipeRatings.rating), filters.minRating));
  }
  if (filters.maxRating) {
    havingConditions.push(lte(avg(userRecipeRatings.rating), filters.maxRating));
  }
  conditions.push(
    inArray(
      recipes.id,
      db.select({ recipeId: userRecipeRatings.recipeId })
        .from(userRecipeRatings)
        .groupBy(userRecipeRatings.recipeId)
        .having(...havingConditions),
    ),
  );
}
```

### R10: rankRecipes helper

```ts
// apps/api/src/modules/recipe/service.ts — NEW F11
// Pure JS ranking helper. Stable sort: equal scores preserve DB order.

/**
 * Rank recipes by weighted relevance score against a search term.
 *
 * Score weights:
 * - title match: 3 (highest — title is the most prominent field)
 * - productName match: 2 (coffee name is the second most visible)
 * - personalNotes match: 1 (lowest — free-text notes are least prominent)
 *
 * The sort is STABLE: recipes with equal scores preserve their original
 * DB-query order (sortBy/sortOrder from the model query). This ensures
 * ranking does not re-shuffle equally-relevant items.
 *
 * @param recipes - Fetched recipe rows with their current version's fields.
 * @param searchTerm - The raw search string (lowercased internally).
 * @returns A new array sorted by rank DESC (original order preserved for ties).
 */
export function rankRecipes<T extends { title: string | null; currentVersionId: string | null; versions?: { productName: string | null; personalNotes: string | null }[] }>(
  recipes: T[],
  searchTerm: string,
): T[] {
  const searchLower = searchTerm.toLowerCase();
  const scored = recipes.map((recipe, index) => {
    const currentVersion = recipe.versions?.find((v) => v.id === recipe.currentVersionId) ?? recipe.versions?.[0];
    let score = 0;
    if (recipe.title?.toLowerCase().includes(searchLower)) score += 3;
    if (currentVersion?.productName?.toLowerCase().includes(searchLower)) score += 2;
    if (currentVersion?.personalNotes?.toLowerCase().includes(searchLower)) score += 1;
    return { recipe, score, index };
  });
  // Stable sort: by score DESC, then by original index ASC (preserves DB order for ties)
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((s) => s.recipe);
}
```

### R11: Model test skeleton

```ts
// apps/api/src/modules/recipe/model.test.ts — add to existing describe block

// --- F11: author filter ---
it('buildRecipeFilters: author generates users subquery condition', async () => {
  const conditions = buildRecipeFilters({ author: 'alice' });
  // Assert the condition SQL contains the users ilike subquery
  expect(conditions).toHaveLength(1);
});

it('buildRecipeFilters: empty author generates no condition', () => {
  const conditions = buildRecipeFilters({ author: '' });
  expect(conditions).toHaveLength(0);
});

it('buildRecipeFilters: author with wildcards stripped', () => {
  const conditions = buildRecipeFilters({ author: '%alice%' });
  expect(conditions).toHaveLength(1); // sanitized to 'alice', still generates a condition
});

// --- F11: date range filter ---
it('buildRecipeFilters: dateFrom generates gte condition', () => {
  const date = new Date('2025-01-01');
  const conditions = buildRecipeFilters({ dateFrom: date });
  expect(conditions).toHaveLength(1);
});

it('buildRecipeFilters: dateTo generates lte condition', () => {
  const date = new Date('2025-12-01');
  const conditions = buildRecipeFilters({ dateTo: date });
  expect(conditions).toHaveLength(1);
});

it('buildRecipeFilters: both dateFrom and dateTo generate two conditions', () => {
  const conditions = buildRecipeFilters({ dateFrom: new Date('2025-01-01'), dateTo: new Date('2025-12-01') });
  expect(conditions).toHaveLength(2);
});

// --- F11: rating range filter ---
it('buildRecipeFilters: minRating generates having-gte subquery', () => {
  const conditions = buildRecipeFilters({ minRating: 7 });
  expect(conditions).toHaveLength(1);
});

it('buildRecipeFilters: maxRating generates having-lte subquery', () => {
  const conditions = buildRecipeFilters({ maxRating: 9 });
  expect(conditions).toHaveLength(1);
});

it('buildRecipeFilters: both minRating and maxRating generate one subquery with two having conditions', () => {
  const conditions = buildRecipeFilters({ minRating: 5, maxRating: 9 });
  expect(conditions).toHaveLength(1); // single inArray with both having clauses
});

// --- F11: search personalNotes ---
it('buildRecipeFilters: search includes personalNotes in or() condition', () => {
  const conditions = buildRecipeFilters({ search: 'V60' });
  expect(conditions).toHaveLength(1);
  // The condition SQL should reference personalNotes
});

// --- F11: rankRecipes ---
it('rankRecipes: title match scores higher than productName match', () => {
  const recipes = [
    { title: 'Untitled', currentVersionId: 'v2', versions: [{ id: 'v2', productName: 'Espresso Blend', personalNotes: null }] },
    { title: 'Espresso', currentVersionId: 'v1', versions: [{ id: 'v1', productName: 'Generic', personalNotes: null }] },
  ];
  const ranked = rankRecipes(recipes, 'espresso');
  expect(ranked[0].title).toBe('Espresso'); // score 3 > score 2
});

it('rankRecipes: equal scores preserve DB order (stable sort)', () => {
  const recipes = [
    { title: 'Match A', currentVersionId: 'v1', versions: [{ id: 'v1', productName: null, personalNotes: null }] },
    { title: 'Match B', currentVersionId: 'v2', versions: [{ id: 'v2', productName: null, personalNotes: null }] },
  ];
  const ranked = rankRecipes(recipes, 'match');
  expect(ranked[0].title).toBe('Match A'); // original order preserved
  expect(ranked[1].title).toBe('Match B');
});

it('rankRecipes: personalNotes match scores lowest', () => {
  const recipes = [
    { title: 'Untitled', currentVersionId: 'v1', versions: [{ id: 'v1', productName: null, personalNotes: 'Try V60' }] },
    { title: 'V60 Recipe', currentVersionId: 'v2', versions: [{ id: 'v2', productName: null, personalNotes: null }] },
  ];
  const ranked = rankRecipes(recipes, 'v60');
  expect(ranked[0].title).toBe('V60 Recipe'); // score 3 > score 1
});
```

### R12: Service layer — offset fallback + ranking

```ts
// apps/api/src/modules/recipe/service.ts — listRecipes (current ~line 458)
// Add the search-active offset fallback BEFORE the existing cursor check:

const hasSearch = filters.search && filters.search.replace(/[%_]/g, '').length > 0;

if (filters.cursor && hasSearch) {
  // F11: search active → offset fallback (ranking reorders, keyset cursor non-deterministic)
  log.debug({ search: filters.search }, 'Search active, falling back to offset pagination for ranking');
  // Fall through to offset path (do NOT enter the cursor branch)
} else if (filters.cursor && filters.sortBy === 'createdAt') {
  // Existing D27 cursor path
  const result = await model.findCursor(/* ... */);
  // F11: apply ranking if search is active (hasSearch is false here, so no ranking)
  return result;
}

// Offset path
const result = await model.findMany(/* ... */);

// F11: apply ranking after fetch when search is active
if (hasSearch && result.recipes.length > 0) {
  result.recipes = rankRecipes(result.recipes, filters.search!);
}

return result;
```

### R13: OpenAPI parameters

```ts
// apps/api/src/modules/recipe/index.ts — describeRoute parameters (current ~line 63-85)
// REPLACE the parameters array with the complete list:

parameters: [
  { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
  { name: 'perPage', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100 } },
  { name: 'sortBy', in: 'query', required: false, schema: { type: 'string', enum: ['createdAt', 'likeCount', 'rating'] } },
  { name: 'sortOrder', in: 'query', required: false, schema: { type: 'string', enum: ['asc', 'desc'] } },
  { name: 'cursor', in: 'query', required: false, schema: { type: 'string' }, description: 'Base64 cursor for keyset pagination (sortBy=createdAt only)' },
  { name: 'includeTotal', in: 'query', required: false, schema: { type: 'boolean' } },
  { name: 'search', in: 'query', required: false, schema: { type: 'string' }, description: 'Full-text search (ilike on title, productName, personalNotes)' },
  { name: 'brewMethod', in: 'query', required: false, schema: { type: 'string' } },
  { name: 'drinkType', in: 'query', required: false, schema: { type: 'string' } },
  { name: 'visibility', in: 'query', required: false, schema: { type: 'string' } },
  { name: 'authorId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
  { name: 'equipmentId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
  { name: 'mainBrewer', in: 'query', required: false, schema: { type: 'string' } },
  { name: 'coffeeVarietyId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
  // F11 new params:
  { name: 'author', in: 'query', required: false, schema: { type: 'string', maxLength: 100 }, description: 'Author username/displayName substring (case-insensitive)' },
  { name: 'dateFrom', in: 'query', required: false, schema: { type: 'string', format: 'date' }, description: 'Recipes created on or after this date (inclusive)' },
  { name: 'dateTo', in: 'query', required: false, schema: { type: 'string', format: 'date' }, description: 'Recipes created on or before this date (inclusive)' },
  { name: 'minRating', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 10 }, description: 'Minimum average rating (1-10)' },
  { name: 'maxRating', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 10 }, description: 'Maximum average rating (1-10)' },
  {
    name: 'tasteNoteId',
    in: 'query',
    required: false,
    deprecated: true,
    description: 'Deprecated. Use tasteNoteIds instead. See D28.',
    schema: { type: 'string', format: 'uuid' },
  },
  {
    name: 'tasteNoteIds',
    in: 'query',
    required: false,
    description: 'Comma-separated taste note UUIDs (AND logic, max 10)',
    schema: { type: 'string' },
  },
],
```

### R14: Service test skeleton

```ts
// apps/api/src/modules/recipe/service.test.ts — add

// --- F11: search-active offset fallback ---
it('listRecipes: search + cursor falls back to offset', async () => {
  const result = await service.listRecipes(
    { search: 'espresso', cursor: 'eyJ...' } as RecipeFilters,
    1, 20, null, false,
  );
  // Assert offset pagination meta (not cursor)
  expect(result.meta?.pagination).toBeDefined();
  expect(result.meta?.cursor).toBeUndefined();
});

it('listRecipes: search without cursor uses offset', async () => {
  const result = await service.listRecipes(
    { search: 'espresso' } as RecipeFilters,
    1, 20, null, false,
  );
  expect(result.meta?.pagination).toBeDefined();
});

it('listRecipes: no search + cursor uses cursor pagination', async () => {
  const result = await service.listRecipes(
    { cursor: 'eyJ...', sortBy: 'createdAt' } as RecipeFilters,
    1, 20, null, false,
  );
  expect(result.meta?.cursor).toBeDefined();
});

// --- F11: ranking ---
it('listRecipes: ranking applied when search active', async () => {
  // Mock model.findMany to return recipes in DB order
  // Assert rankRecipes reorders them
});

it('listRecipes: no ranking when search absent', async () => {
  // Assert results are in DB order (no re-sort)
});
```

### R15: Route test skeleton

```ts
// apps/api/src/modules/recipe/index.test.ts — add

it('GET /recipes accepts author param', async () => {
  const res = await app.request('/api/v1/recipes?author=alice');
  expect(res.status).toBe(200);
});

it('GET /recipes accepts dateFrom param', async () => {
  const res = await app.request('/api/v1/recipes?dateFrom=2025-01-01');
  expect(res.status).toBe(200);
});

it('GET /recipes accepts minRating param', async () => {
  const res = await app.request('/api/v1/recipes?minRating=7');
  expect(res.status).toBe(200);
});

it('GET /recipes rejects minRating=0', async () => {
  const res = await app.request('/api/v1/recipes?minRating=0');
  expect(res.status).toBe(400);
});

it('GET /recipes silently drops grinder (removed field)', async () => {
  const res = await app.request('/api/v1/recipes?grinder=Niche');
  expect(res.status).toBe(200); // not 400 — Zod strips unknown keys
});
```

### R16: extractListParams

```ts
// apps/web/src/utils/recipe-filters.ts — extractListParams (current ~line 23)
// ADD the 5 new params to the recognized set:

if (params.author) result.author = params.author;
if (params.dateFrom) result.dateFrom = params.dateFrom;
if (params.dateTo) result.dateTo = params.dateTo;
if (params.minRating) result.minRating = Number(params.minRating);
if (params.maxRating) result.maxRating = Number(params.maxRating);
```

### R17: useRecipeFilters

```ts
// apps/web/src/components/recipe-list/useRecipeFilters.ts — add new params to the hook
// Read from URL search params:
const author = searchParams.get('author') ?? undefined;
const dateFrom = searchParams.get('dateFrom') ?? undefined;
const dateTo = searchParams.get('dateTo') ?? undefined;
const minRating = searchParams.get('minRating') ?? undefined;
const maxRating = searchParams.get('maxRating') ?? undefined;

// updateFilter already handles arbitrary key → URL param updates
// (verify it does — if it's hardcoded to known keys, add the 5 new ones)
```

### R18: RecipeListView filter sections

```tsx
// apps/web/src/components/recipe-list/RecipeListView.tsx — add to the filter sidebar JSX

{/* F11: Author filter */}
<FilterField label={t('recipe.filter.author')}>
  <input
    type="text"
    className="input-field"
    placeholder={t('recipe.filter.authorPlaceholder')}
    value={filters.author ?? ''}
    onChange={(e) => updateFilter('author', e.target.value || undefined)}
  />
</FilterField>

{/* F11: Date range filter */}
<FilterField label={t('recipe.filter.dateFrom')}>
  <input
    type="date"
    className="input-field"
    value={filters.dateFrom ?? ''}
    onChange={(e) => updateFilter('dateFrom', e.target.value || undefined)}
  />
</FilterField>
<FilterField label={t('recipe.filter.dateTo')}>
  <input
    type="date"
    className="input-field"
    value={filters.dateTo ?? ''}
    onChange={(e) => updateFilter('dateTo', e.target.value || undefined)}
  />
</FilterField>

{/* F11: Rating range filter */}
<div className="flex gap-2">
  <FilterField label={t('recipe.filter.minRating')}>
    <input
      type="number"
      min={1}
      max={10}
      className="input-field"
      value={filters.minRating ?? ''}
      onChange={(e) => updateFilter('minRating', e.target.value || undefined)}
    />
  </FilterField>
  <FilterField label={t('recipe.filter.maxRating')}>
    <input
      type="number"
      min={1}
      max={10}
      className="input-field"
      value={filters.maxRating ?? ''}
      onChange={(e) => updateFilter('maxRating', e.target.value || undefined)}
    />
  </FilterField>
</div>
```

### R19: ActiveFilterBadge entries

```tsx
// apps/web/src/components/recipe-list/RecipeListView.tsx — add badge entries
// (matching the existing ActiveFilterBadge pattern for equipment/mainBrewer)

{filters.author && (
  <ActiveFilterBadge
    label={t('recipe.filter.author')}
    value={filters.author}
    onClear={() => updateFilter('author', undefined)}
  />
)}
{filters.dateFrom && (
  <ActiveFilterBadge
    label={t('recipe.filter.dateFrom')}
    value={filters.dateFrom}
    onClear={() => updateFilter('dateFrom', undefined)}
  />
)}
{filters.dateTo && (
  <ActiveFilterBadge
    label={t('recipe.filter.dateTo')}
    value={filters.dateTo}
    onClear={() => updateFilter('dateTo', undefined)}
  />
)}
{filters.minRating && (
  <ActiveFilterBadge
    label={t('recipe.filter.minRating')}
    value={filters.minRating}
    onClear={() => updateFilter('minRating', undefined)}
  />
)}
{filters.maxRating && (
  <ActiveFilterBadge
    label={t('recipe.filter.maxRating')}
    value={filters.maxRating}
    onClear={() => updateFilter('maxRating', undefined)}
  />
)}
```

### R20: RecipeListView test skeleton

```tsx
// apps/web/src/components/recipe-list/RecipeListView.test.tsx — add

it('renders author filter input', () => {
  const { getByPlaceholderText } = render(<RecipeListView ... />);
  expect(getByPlaceholderText('Search by author...')).toBeInTheDocument();
});

it('renders date range inputs', () => {
  const { getByLabelText } = render(<RecipeListView ... />);
  expect(getByLabelText('From date')).toBeInTheDocument();
  expect(getByLabelText('To date')).toBeInTheDocument();
});

it('renders rating range inputs', () => {
  const { getByLabelText } = render(<RecipeListView ... />);
  expect(getByLabelText('Min rating')).toBeInTheDocument();
  expect(getByLabelText('Max rating')).toBeInTheDocument();
});

it('author input updates URL', async () => {
  const { getByPlaceholderText } = render(<RecipeListView ... />);
  const input = getByPlaceholderText('Search by author...');
  await userEvent.type(input, 'alice');
  // Assert URL search params include ?author=alice
});

it('active filter badge for author renders and clears', async () => {
  // Render with ?author=alice in the URL
  const { getByText } = render(<RecipeListView ... />);
  expect(getByText('Author: alice')).toBeInTheDocument();
  // Click clear → assert ?author removed from URL
});
```

### R21: recipe-filters.test.ts skeleton

```ts
// apps/web/src/utils/recipe-filters.test.ts — add

it('extractListParams passes author through', () => {
  const params = new URLSearchParams('?author=alice');
  const result = extractListParams(params);
  expect(result.author).toBe('alice');
});

it('extractListParams passes dateFrom through', () => {
  const params = new URLSearchParams('?dateFrom=2025-01-01');
  const result = extractListParams(params);
  expect(result.dateFrom).toBe('2025-01-01');
});

it('extractListParams passes minRating as number', () => {
  const params = new URLSearchParams('?minRating=7');
  const result = extractListParams(params);
  expect(result.minRating).toBe(7);
});

it('extractListParams drops empty values', () => {
  const params = new URLSearchParams('?author=');
  const result = extractListParams(params);
  expect(result.author).toBeUndefined();
});
```

## Testing Strategy

### Shared / package tests

- `packages/shared/src/schemas/recipe.test.ts` — new fields accepted, validated, coerced; `grinder` stripped; range bounds enforced.

### API tests

- `apps/api/src/modules/recipe/model.test.ts` — each new `buildRecipeFilters` branch (author, dateFrom/dateTo, minRating/maxRating, search personalNotes); `rankRecipes` helper (weights, stability, no-search no-sort).
- `apps/api/src/modules/recipe/service.test.ts` — search-active offset fallback (search + cursor → offset + debug log); ranking applied with search; no ranking without search.
- `apps/api/src/modules/recipe/index.test.ts` — new query params accepted; invalid values rejected (minRating=0 → 400); grinder silently dropped; OpenAPI coverage test passes.

### Web tests

- `apps/web/src/components/recipe-list/RecipeListView.test.tsx` — new filter sections render; input → URL update; active filter badges render + clear.
- `apps/web/src/utils/recipe-filters.test.ts` — `extractListParams` passes new params; drops empty values.

### Verification (mandatory before commit)

- `make check` (all workspaces type-check)
- `make lint` (all workspaces lint)
- `make test` (full suite via Docker)
- `make test-coverage` — verify new files >= 85% line coverage
- `make fmt` — formatting applied; `deno fmt --check` passes
- `openspec validate f11-advanced-search` — spec validation passes

### Plan docs (housekeeping)

- `plans/F11-advanced-search.md` — prepend shipped banner
- `plans/ROADMAP.md` — mark F11 shipped, update next candidates
