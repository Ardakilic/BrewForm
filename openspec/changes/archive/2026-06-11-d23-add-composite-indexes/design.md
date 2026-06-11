## Context

The BrewForm database schema defines 30+ tables in `packages/db/src/schema.ts`,
each with a Drizzle `index()` array in the third `pgTable` argument. With the
exception of the `reports` table (which has one composite index) and tables
with UNIQUE constraints (which serve as composite indexes implicitly), all
indexes are single-column.

The API follows a 3-layer pattern (model → service → controller). All database
queries live in the model layer (`apps/api/src/modules/**/model.ts`). The
existing query patterns were audited exhaustively; composite index opportunities
were identified by matching `WHERE` equality conditions + `ORDER BY` sort
columns against the existing single-column indexes.

## Goals / Non-Goals

**Goals:**

- Add composite indexes for all CRITICAL and HIGH priority query patterns
  identified in the audit.
- Add composite indexes for MEDIUM priority patterns where the cost/benefit
  is clearly favorable.
- Add the missing `deleted_at` single-column index on `taste_notes` for
  consistency with every other soft-delete table.
- Verify via schema-level tests.
- Pass `make ci` with zero regressions.

**Non-Goals:**

- Changing any existing index or UNIQUE constraint.
- Modifying any query logic, service layer, or controller code.
- Adding indexes for LOW priority patterns (`userRecipeRatings`, `vendors`).
- Introducing partial indexes, expression indexes, or covering indexes
  (future optimization).
- Index tuning based on production query statistics (this is a structural
  improvement based on static query-pattern analysis).

## Decisions

### Decision 1: Column ordering — equality first, then sort

**Rationale.** PostgreSQL B-tree indexes are most effective when equality
predicates precede range/sort predicates. For every composite index:

```
Equality column(s) → Sort column(s) → Optional additional equality
```

This ensures the query planner can seek directly on the equality prefix and
the remaining rows are already in sort order, avoiding a separate sort step.

**Examples:**

| Index | Columns | Query Pattern |
|-------|---------|--------------|
| `recipe_visibility_created_idx` | `(visibility, createdAt)` | `WHERE visibility = 'public' ORDER BY createdAt DESC` |
| `comment_recipe_parent_created_idx` | `(recipeId, parentCommentId, createdAt)` | `WHERE recipeId = ? AND parentCommentId IS NULL ORDER BY createdAt DESC` |
| `setup_user_created_idx` | `(userId, createdAt)` | `WHERE userId = ? ORDER BY createdAt DESC` |

The query planner can scan backwards when `ORDER BY ... DESC` is used, so
`ASC`-only index definitions are sufficient for both `ASC` and `DESC` sorts.

### Decision 2: All indexes use default B-tree, no `USING` clause

**Rationale.** All query patterns involve equality and/or range/sort on scalar
columns. B-tree (the default) is the optimal index type for these operations.
GIN, GiST, or HASH indexes are not indicated for any of the identified patterns.

### Decision 3: Index naming follows existing convention

**Rationale.** The codebase uses the pattern `table_name_column_name(s)_idx`
consistently:

```
table_short_name → entity meaning → _idx
```

Examples:
- `recipe_author_visibility_idx` (recipe, author + visibility)
- `comment_recipe_parent_created_idx` (comment, recipe + parent + created)
- `recipe_version_coffee_variety_idx` (recipe_version, coffee_variety)

This matches existing names like `report_entity_type_entity_id_idx`.

### Decision 4: `recipeVersions.coffeeVarietyId` gets `(coffeeVarietyId, recipeId)`, not single-column

**Rationale.** The dominant query pattern is a correlated subquery:

```sql
SELECT recipeId FROM recipeVersions WHERE coffeeVarietyId = ?
```

With `(coffeeVarietyId, recipeId)`, PostgreSQL can perform an **index-only
scan** — it reads `recipeId` directly from the index without touching the
heap. A single-column `(coffeeVarietyId)` index would still require a heap
lookup for each row to retrieve `recipeId`.

**Note on nullability.** `coffeeVarietyId` is a nullable `varchar(36)` column
(no `.notNull()` in its Drizzle definition at `schema.ts:173-174`). PostgreSQL
B-tree indexes handle NULL values correctly — rows where
`coffeeVarietyId IS NULL` are still indexed and searchable. All current
queries filter for a specific non-null variety ID (`eq(column, ?)`), so NULL
rows are simply not part of the result set. No special null-handling is
required.

### Decision 5: `tasteNotes` gets a `deleted_at` single-column index for parity

**Rationale.** Every other table with soft-delete semantics has a `deleted_at`
index. `tasteNotes` is the lone exception. While most queries don't heavily
filter by `deletedAt` on taste notes, the inconsistency makes query planning
unpredictable when the query planner considers bitmap index scans. Adding it
as a single-column index (matching every other table's convention) before
adding the composite indexes keeps the schema self-consistent.

### Decision 6: Migration strategy — standard Drizzle workflow, no `CONCURRENTLY`

**Rationale.** The default Drizzle migration (`make db-generate` →
`make db-migrate`) produces standard `CREATE INDEX` statements. `CREATE INDEX
CONCURRENTLY` would require splitting the migration into a separate
non-transactional step and is unnecessary for current data volumes (<100k rows
per table). If a specific table has enough data at migration time to cause
noticeable locking, `CONCURRENTLY` can be added as a manual follow-up.

### Decision 7: Full composite index list

Below is the complete list of indexes to be added in `packages/db/src/schema.ts`.

#### Recipe table (`recipes`)

| # | Index Name | Columns | Query Pattern Served |
|---|-----------|---------|---------------------|
| 1 | `recipe_author_visibility_idx` | `(authorId, visibility)` | User profile: `WHERE authorId = ? AND visibility = ?` via `buildListRecipesWhere` (`model.ts:187-200`) |
| 2 | `recipe_visibility_created_idx` | `(visibility, createdAt)` | Homepage/feed: `WHERE visibility = 'public' ORDER BY createdAt DESC` via `findMany` (`model.ts:270-293`), `getFeed` (`model.ts:679-684`) |
| 3 | `recipe_visibility_like_count_idx` | `(visibility, likeCount)` | Trending: `WHERE visibility = 'public' ORDER BY likeCount DESC` via `findMany` (`model.ts:277`) |

#### Recipe versions table (`recipeVersions`)

| # | Index Name | Columns | Query Pattern Served |
|---|-----------|---------|---------------------|
| 4 | `recipe_version_coffee_variety_idx` | `(coffeeVarietyId, recipeId)` | Variety filter subquery: `SELECT recipeId WHERE coffeeVarietyId = ?` (`recipe/model.ts:33-34`), variety detail page (`coffee-variety/model.ts:85-109`), admin variety counts (`admin/model.ts:613-624`) |

#### Comments table (`comments`)

| # | Index Name | Columns | Query Pattern Served |
|---|-----------|---------|---------------------|
| 5 | `comment_recipe_parent_created_idx` | `(recipeId, parentCommentId, createdAt)` | Top-level comment listing: `WHERE recipeId = ? AND parentCommentId IS NULL ORDER BY createdAt DESC` (`comment/model.ts:45-73`) |
| 6 | `comment_parent_created_idx` | `(parentCommentId, createdAt)` | Reply fetching: `WHERE parentCommentId IN (?) ORDER BY createdAt ASC` (`comment/model.ts:82-101`) |

#### User follows table (`userFollows`)

| # | Index Name | Columns | Query Pattern Served |
|---|-----------|---------|---------------------|
| 7 | `user_follow_following_created_idx` | `(followingId, createdAt)` | Follower list: `WHERE followingId = ? ORDER BY createdAt DESC` (`follow/model.ts:41-68`) |
| 8 | `user_follow_follower_created_idx` | `(followerId, createdAt)` | Following list: `WHERE followerId = ? ORDER BY createdAt DESC` (`follow/model.ts:78-105`) |

#### Setups table (`setups`)

| # | Index Name | Columns | Query Pattern Served |
|---|-----------|---------|---------------------|
| 9 | `setup_user_created_idx` | `(userId, createdAt)` | Setup listing: `WHERE userId = ? ORDER BY createdAt DESC` (`setup/model.ts:25-34`). Note: **no `createdAt` index exists** today — PostgreSQL sorts in memory. |

#### Beans table (`beans`)

| # | Index Name | Columns | Query Pattern Served |
|---|-----------|---------|---------------------|
| 10 | `bean_user_created_idx` | `(userId, createdAt)` | Bean listing: `WHERE userId = ? ORDER BY createdAt DESC` (`bean/model.ts:23-32`). Note: **no `createdAt` index exists** today. |

#### Photos table (`photos`)

| # | Index Name | Columns | Query Pattern Served |
|---|-----------|---------|---------------------|
| 11 | `photo_recipe_sort_order_idx` | `(recipeId, sortOrder)` | Photo listing: `WHERE recipeId = ? ORDER BY sortOrder ASC` (`photo/model.ts:19-23`). Note: **no `sortOrder` index exists** today. |

#### Taste notes table (`tasteNotes`)

| # | Index Name | Columns | Query Pattern Served |
|---|-----------|---------|---------------------|
| 12 | `taste_note_deleted_at_idx` | `(deletedAt)` | **Parity fix.** Single-column index matching every other soft-delete table's convention. |
| 13 | `taste_note_parent_name_idx` | `(parentId, name)` | Child note listing: `WHERE parentId = ? ORDER BY name ASC` (`taste/model.ts:19-23`) |
| 14 | `taste_note_depth_name_idx` | `(depth, name)` | Full tree load: `ORDER BY depth ASC, name ASC` (`taste/model.ts:13-16`, `taste/model.ts:40-43`) |

#### Reports table (`reports`)

| # | Index Name | Columns | Query Pattern Served |
|---|-----------|---------|---------------------|
| 15 | `report_status_created_idx` | `(status, createdAt)` | Report listing: `WHERE status = ? ORDER BY createdAt DESC` (`report/model.ts:38-50`, `admin/model.ts:388-408`) |

#### Equipment table (`equipment`)

| # | Index Name | Columns | Query Pattern Served |
|---|-----------|---------|---------------------|
| 16 | `equipment_type_name_idx` | `(type, name)` | Filter by type: `WHERE type = ? ORDER BY name ASC` (`equipment/model.ts:59-87`) |

#### Coffee varieties table (`coffeeVarieties`)

| # | Index Name | Columns | Query Pattern Served |
|---|-----------|---------|---------------------|
| 17 | `coffee_variety_category_name_idx` | `(category, name)` | Filter by category: `WHERE category = ? ORDER BY name ASC` (`coffee-variety/model.ts:13-46`, `admin/model.ts:551-586`) |

### Decision 8: Tests — schema-level index existence verification

A new test file `packages/db/src/schema-indexes.test.ts` verifies that each
composite index is defined in the Drizzle schema. It does NOT verify that the
indexes actually exist in the running PostgreSQL database (that's the
migration's responsibility) — it only validates the schema definition layer.

The test uses a straightforward approach: introspect the Drizzle schema object
to confirm the index definitions are present in the table's extra configurator
array. Each index is verified by name, columns, and uniqueness.

## Risks / Trade-offs

- **Write overhead.** Every composite index adds maintenance cost on
  INSERT/UPDATE/DELETE. The tables affected are read-heavy (recipes,
  comments, follows) or small (setups, beans, photos). Write overhead is
  negligible.
- **Index bloat.** 17 new indexes increase storage by ~2-5% on most tables.
  For current data volumes (<100k rows per table), this is immaterial.
- **Migration lock.** Standard `CREATE INDEX` takes an exclusive lock on the
  table. For active production databases, consider running the migration
  during a low-traffic window. The `recipeVersions` table may warrant
  `CONCURRENTLY` if it has significant row count at migration time.
- **Unused indexes.** PostgreSQL tracks index usage via `pg_stat_user_indexes`.
  A future cleanup pass can drop any composite index with `idx_scan = 0`
  after sufficient production runtime.

## Migration Plan

1. **Edit schema** — add all 17+1 index definitions to
   `packages/db/src/schema.ts`.
2. **Generate migration** — `make db-generate` produces the SQL migration
   file with all `CREATE INDEX` statements.
3. **Apply migration** — `make db-migrate` applies the indexes.
4. **Minimal test bootstrap** — write `packages/db/src/schema-indexes.test.ts`.
   Seed minimal rows in each table to validate that existing queries don't
   break. Verify that Drizzle index definitions are present.
5. **Full CI** — `make ci` must pass clean.

### Rollback

A single `git revert` of the merge commit + `make db-migrate` (to the
previous migration) drops all indexes. Standard Drizzle rollback.

## Open Questions

- **None.** The audit covered all query patterns in the codebase. Production
  query statistics may surface additional patterns not visible in static
  analysis, but that's orthogonal to this change.
