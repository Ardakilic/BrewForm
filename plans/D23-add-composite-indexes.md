# D23 — Add Composite Indexes for Common Query Patterns (Phase 1 — Recipe Table Only)

**Severity:** Medium
**Status:** Implemented (Phase 1)
**File:** `packages/db/src/schema.ts`

> **Scope note:** This plan was originally written for the recipe table only. The full implementation (change `d23-add-composite-indexes`) covers **18 indexes across 11 tables**. See `openspec/changes/archive/2026-06-11-d23-add-composite-indexes/` for the complete set, or `openspec/specs/db-indexes/spec.md` for the full capability spec covering: `recipes`, `recipeVersions`, `comments`, `userFollows`, `setups`, `beans`, `photos`, `tasteNotes`, `reports`, `equipment`, and `coffeeVarieties`.

---

## Validation Notes (against `main` as of this review)

| Claim in original plan | Status | Finding |
|---|---|---|
| Recipe table has only 7 single-column indexes | ✅ Correct | Confirmed |
| None of the composite indexes exist yet | ✅ Correct | No composite indexes on the recipe table |
| `featured` / `authorId` / `visibility` / `likeCount` / `createdAt` columns exist | ✅ Correct | Confirmed in recipe table definition |
| Index location "~lines 215–225" | ❌ Wrong | Actual location in the index array is ~lines 135–141 |
| `recipe_visibility_featured_idx` covers a real query | ❌ Unsupported | `featured` is never used in a WHERE clause — only in `toggleFeature`. Index was removed from the implementation. |
| Drizzle `.on(col1, col2)` composite-index syntax | ✅ Correct | Confirmed via Drizzle ORM docs |
| `make db-generate` / `make db-migrate` targets exist | ✅ Correct | Both confirmed in Makefile |
| Final step `make check` + `make test` | ⚠️ Partial | Replaced with `make lint` + `make test` |

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
| `packages/db/src/schema.ts` | Recipe table index definitions |
| `packages/db/src/schema-indexes.test.ts` | Schema-level index verification tests |
| `openspec/specs/db-indexes/spec.md` | Full capability spec (all 11 tables) |

---

## Fix Approach (Phase 1)

Add **three** composite indexes on the recipe table covering the highest-traffic query patterns.

Originally a fourth index on `visibility + featured` was proposed but was removed:
`featured` is never used as a query filter — it is only toggled via the
`toggleFeature` mutation.

```typescript
index('recipe_author_visibility_idx').on(table.authorId, table.visibility),
index('recipe_visibility_created_idx').on(table.visibility, table.createdAt),
index('recipe_visibility_like_count_idx').on(table.visibility, table.likeCount),
```

### Index Names (for cross-referencing with spec)

| Index | Covers Query |
|-------|-------------|
| `recipe_author_visibility_idx` | User profile: `WHERE authorId = ? AND visibility = ?` |
| `recipe_visibility_created_idx` | Homepage feed: `WHERE visibility = 'public' ORDER BY createdAt DESC` |
| `recipe_visibility_like_count_idx` | Trending: `WHERE visibility = 'public' ORDER BY likeCount DESC` |

### Full-Scope Index Sets (other 10 tables)

The remaining tables and their indexes are defined in `openspec/specs/db-indexes/spec.md`:

- **recipeVersions**: `recipe_version_coffee_variety_idx` on `(coffeeVarietyId, recipeId)`
- **comments**: `comment_recipe_parent_created_idx` on `(recipeId, parentCommentId, createdAt)`, `comment_parent_created_idx` on `(parentCommentId, createdAt)`
- **userFollows**: `user_follow_following_created_idx` on `(followingId, createdAt)`, `user_follow_follower_created_idx` on `(followerId, createdAt)`
- **setups**: `setup_user_created_idx` on `(userId, createdAt)`
- **beans**: `bean_user_created_idx` on `(userId, createdAt)`
- **photos**: `photo_recipe_sort_order_idx` on `(recipeId, sortOrder)`
- **tasteNotes**: `taste_note_deleted_at_idx` on `(deletedAt)`, `taste_note_parent_name_idx` on `(parentId, name)`, `taste_note_depth_name_idx` on `(depth, name)`
- **reports**: `report_status_created_idx` on `(status, createdAt)`
- **equipment**: `equipment_type_name_idx` on `(type, name)`
- **coffeeVarieties**: `coffee_variety_category_name_idx` on `(category, name)`

---

## Implementation Steps (Phase 1)

1. **Edit** `packages/db/src/schema.ts` — locate the recipe table's `(table) => [...]` array.
   Append the three composite indexes after the existing `recipe_deleted_at_idx` entry.

2. **Run** `make db-generate` — Drizzle generates the `CREATE INDEX` migration SQL.

3. **Run** `make db-migrate` — applies the indexes to the database.

4. **Verify** with `make check` + `make test` — all checks must pass clean.

---

## Testing Strategy

| Test | Expected |
|------|----------|
| Schema-level index definition tests | `make test-specific filter=schema-indexes.test.ts` |
| Homepage feed query | Uses `recipe_visibility_created_idx` (check EXPLAIN) |
| Trending query | Uses `recipe_visibility_like_count_idx` (check EXPLAIN) |
| User profile recipes | Uses `recipe_author_visibility_idx` (check EXPLAIN) |
| Migration applies cleanly | No errors from `make db-migrate` |
| All existing queries return correct results | No regression |

---

## Risk Assessment

**Risk: Low**

- Additive change — only adds indexes, does not modify existing ones or any query logic.
- Indexes are non-destructive; they can be dropped with no data loss if not beneficial.
- Slight increase in write overhead (index maintenance on INSERT/UPDATE/DELETE) — acceptable
  for a read-heavy workload.

---

## Dependencies

- None. Standalone performance improvement. For multi-table scope, see `openspec/specs/db-indexes/spec.md`.