# D23 — Add Composite Indexes for Common Query Patterns

**Severity:** Medium  
**Status:** Open  
**File:** `packages/db/src/schema.ts`

---

## Issue Description

The `recipe` table currently has only single-column indexes:

```typescript
index('recipe_author_id_idx').on(table.authorId),
index('recipe_visibility_idx').on(table.visibility),
index('recipe_created_at_idx').on(table.createdAt),
index('recipe_like_count_idx').on(table.likeCount),
index('recipe_forked_from_id_idx').on(table.forkedFromId),
index('recipe_slug_idx').on(table.slug),
index('recipe_deleted_at_idx').on(table.deletedAt),
```

The most common query patterns filter by **visibility + sort by createdAt/likeCount**, or filter by **author + visibility**. Single-column indexes force the query planner to intersect multiple indexes or fall back to sequential scans on these high-traffic queries.

---

## Impact

- **Query performance:** Homepage feed, explore page, and user profile recipe lists all query `WHERE visibility = 'public' ORDER BY createdAt DESC`. Without a composite index, this requires a visibility index scan + sort.
- **Scale:** As recipes grow, the performance gap between single-column and composite indexes widens.
- **Admin queries:** `WHERE authorId = ? AND visibility = ?` also lacks a composite index.

---

## Root Cause

Indexes were added individually during feature development without analyzing the composite query patterns that emerged later.

---

## Affected Files

| File | Description |
|------|-------------|
| `packages/db/src/schema.ts` | Recipe table index definitions |

---

## Fix Approach

Add four composite indexes that cover the highest-traffic query patterns:

```typescript
// packages/db/src/schema.ts — recipe table indexes
(table) => [
  // ... existing single-column indexes ...
  index('recipe_author_visibility_idx').on(table.authorId, table.visibility),
  index('recipe_visibility_created_idx').on(table.visibility, table.createdAt),
  index('recipe_visibility_like_count_idx').on(table.visibility, table.likeCount),
  index('recipe_visibility_featured_idx').on(table.visibility, table.featured),
],
```

### Index Rationale

| Index | Covers Query |
|-------|-------------|
| `recipe_author_visibility_idx` | User profile: `WHERE authorId = ? AND visibility = ?` |
| `recipe_visibility_created_idx` | Homepage feed: `WHERE visibility = 'public' ORDER BY createdAt DESC` |
| `recipe_visibility_like_count_idx` | Trending: `WHERE visibility = 'public' ORDER BY likeCount DESC` |
| `recipe_visibility_featured_idx` | Featured: `WHERE visibility = 'public' AND featured = true` |

### Drizzle ORM Reference

From Context7 (`/drizzle-team/drizzle-orm-docs`):

```typescript
import { index } from 'drizzle-orm/pg-core';

const table = pgTable('posts', { ... }, (table) => [
  index('status_created_idx').on(table.status, table.createdAt),
]);
```

---

## Implementation Steps

1. **Read** `packages/db/src/schema.ts` — locate the recipe table's indexes array (~lines 215-225).
2. **Add** the four composite indexes after the existing single-column indexes.
3. **Run** `make db-generate` — Drizzle generates the CREATE INDEX migration.
4. **Run** `make db-migrate` — applies the indexes.
5. **Verify** with `EXPLAIN ANALYZE` on key queries:
   ```sql
   EXPLAIN ANALYZE SELECT * FROM recipe WHERE visibility = 'public' ORDER BY created_at DESC LIMIT 20;
   ```
6. **Run** `make check` — type-check all workspaces.
7. **Run** `make test` — all tests pass.

---

## Testing Strategy

| Test | Expected |
|------|----------|
| Homepage feed query | Uses `recipe_visibility_created_idx` (check EXPLAIN) |
| Trending query | Uses `recipe_visibility_like_count_idx` (check EXPLAIN) |
| User profile recipes | Uses `recipe_author_visibility_idx` (check EXPLAIN) |
| Featured recipes | Uses `recipe_visibility_featured_idx` (check EXPLAIN) |
| Migration applies cleanly | No errors |
| All existing queries return correct results | No regression |

---

## Risk Assessment

**Risk: Low**

- Additive change — only adds indexes, does not modify existing ones.
- Indexes are non-destructive.
- Slight increase in write overhead (index maintenance) — acceptable for read-heavy workload.
- Can be dropped if not beneficial.

---

## Dependencies

- None. Standalone performance improvement.
