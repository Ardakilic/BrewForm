# D23 — Add Composite Indexes for Common Query Patterns

**Severity:** Medium
**Status:** Open
**File:** `packages/db/src/schema.ts`

---

## Validation Notes (against `main` as of this review)

| Claim in original plan | Status | Finding |
|---|---|---|
| Recipe table has only 7 single-column indexes | ✅ Correct | All 7 confirmed at lines 135–141 |
| None of the composite indexes exist yet | ✅ Correct | No composite indexes on the recipe table |
| `featured` / `authorId` / `visibility` / `likeCount` / `createdAt` columns exist | ✅ Correct | Confirmed in recipe table definition |
| Index location "~lines 215–225" | ❌ Wrong | Actual location: **lines 134–142** (index array at 135–141) |
| `recipe_visibility_featured_idx` covers a real query | ❌ Unsupported | `featured` is **never used in a WHERE clause** anywhere in the codebase — only in the `toggleFeature` mutation. No query filters by `featured`. This index has been removed from the fix. |
| Drizzle `.on(col1, col2)` composite-index syntax | ✅ Correct | Confirmed via Context7 / Drizzle ORM docs |
| `make db-generate` / `make db-migrate` targets exist | ✅ Correct | Both confirmed in Makefile |
| Final step `make check` + `make test` | ⚠️ Partial | Replaced with `make ci` — the full pipeline (`fmt-check lint check build-web check-tests test-coverage test-web`) |

---

## Issue Description

The `recipe` table currently has only single-column indexes (lines 135–141 of
`packages/db/src/schema.ts`):

```typescript
index('recipe_author_id_idx').on(table.authorId),
index('recipe_visibility_idx').on(table.visibility),
index('recipe_created_at_idx').on(table.createdAt),
index('recipe_like_count_idx').on(table.likeCount),
index('recipe_forked_from_id_idx').on(table.forkedFromId),
index('recipe_slug_idx').on(table.slug),
index('recipe_deleted_at_idx').on(table.deletedAt),
```

The most common query patterns filter by **visibility + sort by createdAt/likeCount**, or
filter by **author + visibility**. Single-column indexes force the query planner to intersect
multiple indexes or fall back to sequential scans on these high-traffic queries.

These patterns are implemented in `apps/api/src/modules/recipe/model.ts`:

- `buildListRecipesWhere` always sets `eq(recipes.visibility, 'public')` for non-admins and
  optionally adds `eq(recipes.authorId, filters.authorId)`.
- `findMany` sorts by `recipes.createdAt` or `recipes.likeCount` depending on `sortBy`.

---

## Impact

- **Query performance:** Homepage feed, explore page, and user profile recipe lists all query
  `WHERE visibility = 'public' ORDER BY createdAt DESC`. Without a composite index, this
  requires a visibility index scan + sort.
- **Scale:** As recipes grow, the performance gap between single-column and composite indexes
  widens.
- **Profile queries:** `WHERE authorId = ? AND visibility = ?` also lacks a composite index.

---

## Root Cause

Indexes were added individually during feature development without analyzing the composite
query patterns that emerged later.

---

## Affected Files

| File | Description |
|------|-------------|
| `packages/db/src/schema.ts` | Recipe table index definitions (lines 134–142) |

---

## Fix Approach

Add **three** composite indexes covering the highest-traffic query patterns actually present in
the codebase. (A fourth index on `visibility + featured` was originally proposed but was
removed: `featured` is never used as a query filter — it is only toggled via the
`toggleFeature` mutation. Add it only if a featured-recipes feed query is implemented.)

```typescript
// packages/db/src/schema.ts — recipe table index array (table) => [...]
// Add after the existing single-column indexes:
index('recipe_author_visibility_idx').on(table.authorId, table.visibility),
index('recipe_visibility_created_idx').on(table.visibility, table.createdAt),
index('recipe_visibility_like_count_idx').on(table.visibility, table.likeCount),
```

### Index Rationale

| Index | Covers Query |
|-------|-------------|
| `recipe_author_visibility_idx` | User profile: `WHERE authorId = ? AND visibility = ?` |
| `recipe_visibility_created_idx` | Homepage feed: `WHERE visibility = 'public' ORDER BY createdAt DESC` |
| `recipe_visibility_like_count_idx` | Trending: `WHERE visibility = 'public' ORDER BY likeCount DESC` |

### Drizzle ORM Reference

```typescript
import { index } from 'drizzle-orm/pg-core';

// Multi-column composite index — column order matters for query planner
const table = pgTable('posts', { ... }, (table) => [
  index('status_created_idx').on(table.status, table.createdAt),
]);
```

---

## Implementation Steps

1. **Edit** `packages/db/src/schema.ts` — locate the recipe table's `(table) => [...]` array
   at **lines 134–142**. Append the three composite indexes after the existing
   `recipe_deleted_at_idx` entry:

   ```typescript
   (table) => [
     index('recipe_author_id_idx').on(table.authorId),
     index('recipe_visibility_idx').on(table.visibility),
     index('recipe_created_at_idx').on(table.createdAt),
     index('recipe_like_count_idx').on(table.likeCount),
     index('recipe_forked_from_id_idx').on(table.forkedFromId),
     index('recipe_slug_idx').on(table.slug),
     index('recipe_deleted_at_idx').on(table.deletedAt),
     // Composite indexes for high-traffic query patterns
     index('recipe_author_visibility_idx').on(table.authorId, table.visibility),
     index('recipe_visibility_created_idx').on(table.visibility, table.createdAt),
     index('recipe_visibility_like_count_idx').on(table.visibility, table.likeCount),
   ],
   ```

2. **Run** `make db-generate` — Drizzle generates the `CREATE INDEX` migration SQL.

3. **Run** `make db-migrate` — applies the indexes to the database.

4. **Verify** with `EXPLAIN ANALYZE` on key queries (optional but recommended):

   ```sql
   EXPLAIN ANALYZE
     SELECT * FROM recipe
     WHERE visibility = 'public'
     ORDER BY created_at DESC
     LIMIT 20;

   EXPLAIN ANALYZE
     SELECT * FROM recipe
     WHERE visibility = 'public'
     ORDER BY like_count DESC
     LIMIT 20;

   EXPLAIN ANALYZE
     SELECT * FROM recipe
     WHERE author_id = '<uuid>'
       AND visibility = 'public'
     LIMIT 20;
   ```

5. **Run** `make ci` — full CI pipeline must pass clean.

---

## Testing Strategy

| Test | Expected |
|------|----------|
| Homepage feed query | Uses `recipe_visibility_created_idx` (check EXPLAIN) |
| Trending query | Uses `recipe_visibility_like_count_idx` (check EXPLAIN) |
| User profile recipes | Uses `recipe_author_visibility_idx` (check EXPLAIN) |
| Migration applies cleanly | No errors from `make db-migrate` |
| All existing queries return correct results | No regression |
| `make ci` | All checks pass |

---

## Risk Assessment

**Risk: Low**

- Additive change — only adds indexes, does not modify existing ones or any query logic.
- Indexes are non-destructive; they can be dropped with no data loss if not beneficial.
- Slight increase in write overhead (index maintenance on INSERT/UPDATE/DELETE) — acceptable
  for a read-heavy workload.

---

## Dependencies

- None. Standalone performance improvement.