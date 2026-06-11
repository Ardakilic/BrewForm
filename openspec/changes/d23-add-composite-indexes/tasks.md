## 1. Add composite indexes to `recipes` table with docblocks

- [x] 1.1 Open `packages/db/src/schema.ts` and locate the `recipes` table's extra configurator array at lines 134-142 (the `(table) => [...]` callback). Append three composite index entries **with JSDoc docblocks** after the existing `recipe_deleted_at_idx` line:

  ```typescript
  (table) => [
    index('recipe_author_id_idx').on(table.authorId),
    index('recipe_visibility_idx').on(table.visibility),
    index('recipe_created_at_idx').on(table.createdAt),
    index('recipe_like_count_idx').on(table.likeCount),
    index('recipe_forked_from_id_idx').on(table.forkedFromId),
    index('recipe_slug_idx').on(table.slug),
    index('recipe_deleted_at_idx').on(table.deletedAt),
    /**
     * Composite index for user profile recipe listings.
     *
     * Serves `buildListRecipesWhere` (model.ts:187) when `authorId` filter
     * is combined with `visibility`. Equality columns first (authorId,
     * visibility) for direct B-tree seek.
     */
    index('recipe_author_visibility_idx').on(table.authorId, table.visibility),
    /**
     * Composite index for homepage feed and explore page queries.
     *
     * Serves `findMany` (model.ts:270) with default sortBy 'createdAt',
     * `getFeed` (model.ts:679), and `findStarred` (model.ts:700).
     * Visibility is equality; createdAt supports ORDER BY DESC without a
     * separate sort step.
     */
    index('recipe_visibility_created_idx').on(table.visibility, table.createdAt),
    /**
     * Composite index for trending / popular recipes queries.
     *
     * Serves `findMany` (model.ts:270) with `sortBy: 'likeCount'`.
     * Visibility is equality; likeCount supports ORDER BY DESC without a
     * separate sort step.
     */
    index('recipe_visibility_like_count_idx').on(table.visibility, table.likeCount),
  ],
  ```

  Notes:
  - Column order is deliberate: equality columns first, then sort columns.
  - `featured` is intentionally excluded — never used as a query filter.
  - No existing indexes are modified.
  - Only `authorId` is nullable in the first composite; PostgreSQL B-tree handles this correctly.

- [x] 1.2 Run `make check` — must pass with zero new type errors.

## 2. Add composite index to `recipeVersions` table (CRITICAL) with docblock

- [x] 2.1 Locate the `recipeVersions` table extra configurator array (around lines 183-193). Append the composite index **with a JSDoc docblock** after the existing `recipe_version_created_at_idx` entry:

  ```typescript
  (table) => [
    uniqueIndex('recipe_version_recipe_id_version_number_uq').on(table.recipeId, table.versionNumber),
    index('recipe_version_recipe_id_idx').on(table.recipeId),
    index('recipe_version_brew_method_idx').on(table.brewMethod),
    index('recipe_version_drink_type_idx').on(table.drinkType),
    index('recipe_version_created_at_idx').on(table.createdAt),
    /**
     * Composite index for coffee variety filtering subqueries. CRITICAL —
     * `coffeeVarietyId` had no index before, causing sequential scans on
     * every variety filter.
     *
     * Serves `recipeCoffeeVarietyCondition` (recipe/model.ts:30),
     * `getRecipesUsingVariety` (coffee-variety/model.ts:85),
     * `getVarietyRecipeCount` (admin/model.ts:613).
     *
     * `coffeeVarietyId` is nullable; PostgreSQL B-tree handles NULLs
     * correctly. Includes `recipeId` for index-only scans — the dominant
     * subquery selects only `recipeId`.
     */
    index('recipe_version_coffee_variety_idx').on(table.coffeeVarietyId, table.recipeId),
  ],
  ```

  Notes:
  - `coffeeVarietyId` is a nullable `varchar(36)` column — the index works correctly.
  - Do NOT modify the existing `uniqueIndex` or other indexes.

- [x] 2.2 Run `make check` — must pass.

## 3. Add composite indexes to `comments` table with docblocks

- [x] 3.1 Locate the `comments` table extra configurator array (around lines 462-468). Append two composite indexes **with JSDoc docblocks** after the existing `comment_deleted_at_idx` entry:

  ```typescript
  (table) => [
    index('comment_recipe_id_idx').on(table.recipeId),
    index('comment_author_id_idx').on(table.authorId),
    index('comment_parent_comment_id_idx').on(table.parentCommentId),
    index('comment_created_at_idx').on(table.createdAt),
    index('comment_deleted_at_idx').on(table.deletedAt),
    /**
     * Composite index for top-level comment listing on a recipe detail page.
     *
     * Serves `findByRecipe` (comment/model.ts:45) — filters by recipeId
     * equality, parentCommentId IS NULL, and sorts by createdAt DESC.
     * Columns ordered: equality (recipeId, parentCommentId), then sort (createdAt).
     */
    index('comment_recipe_parent_created_idx').on(table.recipeId, table.parentCommentId, table.createdAt),
    /**
     * Composite index for fetching replies to comments.
     *
     * Serves `findReplies` (comment/model.ts:82) — filters by
     * parentCommentId IN (...) and sorts by createdAt ASC.
     */
    index('comment_parent_created_idx').on(table.parentCommentId, table.createdAt),
  ],
  ```

- [x] 3.2 Run `make check` — must pass.

## 4. Add composite indexes to `userFollows` table with docblocks

- [x] 4.1 Locate the `userFollows` table extra configurator array (around lines 479-484). Append two composite indexes **with JSDoc docblocks** after the existing `user_follow_created_at_idx` entry:

  ```typescript
  (table) => [
    uniqueIndex('user_follow_follower_id_following_id_uq').on(table.followerId, table.followingId),
    index('user_follow_follower_id_idx').on(table.followerId),
    index('user_follow_following_id_idx').on(table.followingId),
    index('user_follow_created_at_idx').on(table.createdAt),
    /**
     * Composite index for paginated follower listings.
     *
     * Serves `getFollowers` (follow/model.ts:41) — filters by followingId
     * and sorts by createdAt DESC with an INNER JOIN on users.
     */
    index('user_follow_following_created_idx').on(table.followingId, table.createdAt),
    /**
     * Composite index for paginated following listings.
     *
     * Serves `getFollowing` (follow/model.ts:78) — filters by followerId
     * and sorts by createdAt DESC with an INNER JOIN on users.
     */
    index('user_follow_follower_created_idx').on(table.followerId, table.createdAt),
  ],
  ```

- [x] 4.2 Run `make check` — must pass.

## 5. Add composite index to `setups` table with docblock

- [x] 5.1 Locate the `setups` table extra configurator array (around lines 442-445). Append a composite index **with a JSDoc docblock** after the existing `setup_deleted_at_idx` entry:

  ```typescript
  (table) => [
    index('setup_user_id_idx').on(table.userId),
    index('setup_deleted_at_idx').on(table.deletedAt),
    /**
     * Composite index for user setup listings. No `createdAt` index existed
     * before — this eliminates the in-memory sort.
     *
     * Serves `findByUser` (setup/model.ts:25) — filters by userId and
     * sorts by createdAt DESC.
     */
    index('setup_user_created_idx').on(table.userId, table.createdAt),
  ],
  ```

- [x] 5.2 Run `make check` — must pass.

## 6. Add composite index to `beans` table with docblock

- [x] 6.1 Locate the `beans` table extra configurator array (around lines 336-339). Append a composite index **with a JSDoc docblock** after the existing `bean_deleted_at_idx` entry:

  ```typescript
  (table) => [
    index('bean_user_id_idx').on(table.userId),
    index('bean_deleted_at_idx').on(table.deletedAt),
    /**
     * Composite index for user bean listings. No `createdAt` index existed
     * before — this eliminates the in-memory sort.
     *
     * Serves `findByUser` (bean/model.ts:23) — filters by userId and
     * sorts by createdAt DESC.
     */
    index('bean_user_created_idx').on(table.userId, table.createdAt),
  ],
  ```

- [x] 6.2 Run `make check` — must pass.

## 7. Add composite index to `photos` table with docblock

- [x] 7.1 Locate the `photos` table extra configurator array (around lines 271-274). Append a composite index **with a JSDoc docblock** after the existing `photo_deleted_at_idx` entry:

  ```typescript
  (table) => [
    index('photo_recipe_id_idx').on(table.recipeId),
    index('photo_deleted_at_idx').on(table.deletedAt),
    /**
     * Composite index for recipe photo listings. No `sortOrder` index
     * existed before — this eliminates the in-memory sort.
     *
     * Serves `findByRecipe` (photo/model.ts:19) — filters by recipeId
     * and sorts by sortOrder ASC.
     */
    index('photo_recipe_sort_order_idx').on(table.recipeId, table.sortOrder),
  ],
  ```

- [x] 7.2 Run `make check` — must pass.

## 8. Add parity + composite indexes to `tasteNotes` table with docblocks

- [x] 8.1 Locate the `tasteNotes` table extra configurator array (around lines 417-421). Add a `deletedAt` single-column index (parity fix) and two composite indexes, all **with JSDoc docblocks**:

  ```typescript
  (table) => [
    index('taste_note_parent_id_idx').on(table.parentId),
    index('taste_note_name_idx').on(table.name),
    index('taste_note_depth_idx').on(table.depth),
    /**
     * Single-column index on `deletedAt` for parity. Every other
     * soft-delete table in the schema has this index; `tasteNotes` was
     * the lone exception.
     */
    index('taste_note_deleted_at_idx').on(table.deletedAt),
    /**
     * Composite index for fetching child taste notes of a parent.
     *
     * Serves `findChildren` (taste/model.ts:19) — filters by parentId
     * and sorts by name ASC.
     */
    index('taste_note_parent_name_idx').on(table.parentId, table.name),
    /**
     * Composite index for full taste-note hierarchy loading.
     *
     * Serves `findAll` and `getHierarchy` (taste/model.ts:13,40) —
     * orders by depth ASC, name ASC for tree rendering.
     */
    index('taste_note_depth_name_idx').on(table.depth, table.name),
  ],
  ```

- [x] 8.2 Run `make check` — must pass.

## 9. Add composite index to `reports` table with docblock

- [x] 9.1 Locate the `reports` table extra configurator array (around lines 679-684). Append a composite index **with a JSDoc docblock** after the existing `report_created_at_idx` entry:

  ```typescript
  (table) => [
    index('report_entity_type_entity_id_idx').on(table.entityType, table.entityId),
    index('report_status_idx').on(table.status),
    index('report_reporter_id_idx').on(table.reporterId),
    index('report_created_at_idx').on(table.createdAt),
    /**
     * Composite index for report listing filtered by status.
     *
     * Serves `findMany` (report/model.ts:38) and `listReports`
     * (admin/model.ts:388) — filters by status (most commonly 'pending')
     * and sorts by createdAt DESC.
     */
    index('report_status_created_idx').on(table.status, table.createdAt),
  ],
  ```

- [x] 9.2 Run `make check` — must pass.

## 10. Add composite index to `equipment` table with docblock

- [x] 10.1 Locate the `equipment` table extra configurator array (around lines 313-317). Append a composite index **with a JSDoc docblock** after the existing `equipment_deleted_at_idx` entry:

  ```typescript
  (table) => [
    index('equipment_type_idx').on(table.type),
    index('equipment_name_idx').on(table.name),
    index('equipment_deleted_at_idx').on(table.deletedAt),
    /**
     * Composite index for equipment filtered by type.
     *
     * Serves `findManyWithFilters` (equipment/model.ts:59) — filters by
     * type equality and sorts by name ASC.
     */
    index('equipment_type_name_idx').on(table.type, table.name),
  ],
  ```

- [x] 10.2 Run `make check` — must pass.

## 11. Add composite index to `coffeeVarieties` table with docblock

- [x] 11.1 Locate the `coffeeVarieties` table extra configurator array (around lines 381-384). Append a composite index **with a JSDoc docblock** after the existing `coffee_variety_deleted_at_idx` entry:

  ```typescript
  (table) => [
    index('coffee_variety_name_idx').on(table.name),
    index('coffee_variety_category_idx').on(table.category),
    index('coffee_variety_deleted_at_idx').on(table.deletedAt),
    /**
     * Composite index for coffee varieties filtered by category.
     *
     * Serves `findMany` (coffee-variety/model.ts:13) and
     * `listCoffeeVarieties` (admin/model.ts:551) — filters by category
     * equality and sorts by name ASC.
     */
    index('coffee_variety_category_name_idx').on(table.category, table.name),
  ],
  ```

- [x] 11.2 Run `make check` — must pass.

## 12. Generate and apply database migration

- [x] 12.1 Run `make db-generate`. Drizzle Kit reads the updated schema and produces a new migration SQL file (e.g., `0006_<codename>.sql`) in `packages/db/drizzle/`. Verify the generated file contains plain `CREATE INDEX` statements (not `CREATE INDEX IF NOT EXISTS` — that's the Drizzle default for fresh migrations) for each of the 18 indexes, with correct column lists. Running `make db-generate` twice should produce zero new files (idempotent diffs).

  ```
  make db-generate
  ```

- [x] 12.2 Run `make db-migrate` to apply the migration to the local development database.

  ```
  make db-migrate
  ```

- [x] 12.3 Verify locally (optional but recommended):

  ```sql
  SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'recipe' AND indexname LIKE 'recipe_%';
  ```

  Confirm all three recipe composite indexes appear. Repeat for other tables if desired.

## 13. Write schema-level index verification tests

- [x] 13.1 Create `packages/db/src/schema-indexes.test.ts` with the standard header matching the project convention:

  ```typescript
  // deno-lint-ignore-file no-explicit-any require-await

  /**
   * Tests that composite indexes are defined in the Drizzle schema.
   *
   * These tests validate the schema definition layer — they confirm that
   * the expected Drizzle `index(...)` calls exist with the correct names,
   * columns, and uniqueness. They do NOT verify that the indexes actually
   * exist in the running PostgreSQL database (that is the migration's
   * responsibility).
   *
   * Uses the public, stable `getTableConfig` function from
   * `drizzle-orm/pg-core` to introspect index configurations.
   *
   * Coverage:
   *  - All 17 new composite indexes across 11 tables
   *  - The 1 new single-column parity index on tasteNotes.deletedAt
   */

  import { describe, it } from 'jsr:@std/testing/bdd';
  import { expect } from 'jsr:@std/expect';
  import { getTableConfig } from 'drizzle-orm/pg-core';
  import type { PgTableWithColumns, IndexedColumn } from 'drizzle-orm/pg-core';
  import {
    beans,
    coffeeVarieties,
    comments,
    equipment,
    photos,
    recipes,
    recipeVersions,
    reports,
    setups,
    tasteNotes,
    userFollows,
  } from './schema.ts';
  ```

- [x] 13.2 Implement a helper to introspect index definitions from a Drizzle table using the **public `getTableConfig` API** (NOT internal `(config as any).extraConfig` hacks):

  ```typescript
  /**
   * Extract index definitions from a Drizzle `pgTable` instance.
   *
   * Uses the public, stable {@link getTableConfig} function from
   * `drizzle-orm/pg-core`. The returned `Index` objects expose a `.config`
   * property with `name`, `columns`, and `unique` fields.
   *
   * @param table - A Drizzle `pgTable` instance (e.g., `recipes`, `comments`)
   * @returns Array of `{ name, columns, isUnique }` for each defined index
   */
  function getTableIndexes(table: PgTableWithColumns<any>): {
    name: string;
    columns: (string | null)[];
    isUnique: boolean;
  }[] {
    const { indexes } = getTableConfig(table);
    return indexes.map((idx) => ({
      name: idx.config.name ?? '',
      columns: idx.config.columns.map((col) => {
        // IndexedColumn has a `.name` property; SQL expressions don't
        if ('name' in col) return (col as IndexedColumn).name ?? null;
        return null; // raw SQL expression — column name not extractable
      }),
      isUnique: idx.config.unique ?? false,
    }));
  }
  ```

  Notes:
  - The public `getTableConfig(table).indexes` returns `Index[]` — each with a `.config` property of type `IndexConfig` (`{ name, columns, unique, ... }`).
  - The helper handles expression-based indexes (raw SQL) by returning `null` for those entries — none of our new indexes use raw SQL.
  - `IndexedColumn` import from `drizzle-orm/pg-core` provides the `name` property type.

- [x] 13.3 Write test cases for each table. Each `describe` block covers one table:

  ```typescript
  describe('Recipe table composite indexes', () => {
    it('has recipe_author_visibility_idx on (authorId, visibility)', () => {
      const indexes = getTableIndexes(recipes);
      const idx = indexes.find((i) => i.name === 'recipe_author_visibility_idx');
      expect(idx).toBeDefined();
      expect(idx!.columns).toEqual(['authorId', 'visibility']);
      expect(idx!.isUnique).toBe(false);
    });

    it('has recipe_visibility_created_idx on (visibility, createdAt)', () => {
      const indexes = getTableIndexes(recipes);
      const idx = indexes.find((i) => i.name === 'recipe_visibility_created_idx');
      expect(idx).toBeDefined();
      expect(idx!.columns).toEqual(['visibility', 'createdAt']);
      expect(idx!.isUnique).toBe(false);
    });

    it('has recipe_visibility_like_count_idx on (visibility, likeCount)', () => {
      const indexes = getTableIndexes(recipes);
      const idx = indexes.find((i) => i.name === 'recipe_visibility_like_count_idx');
      expect(idx).toBeDefined();
      expect(idx!.columns).toEqual(['visibility', 'likeCount']);
      expect(idx!.isUnique).toBe(false);
    });
  });
  ```

- [x] 13.4 Repeat the pattern for all remaining tables. One `describe` per table, one `it` per new index, asserting `name`, `columns` (exact order), and `isUnique`. Cover:

  - `recipeVersions`: `recipe_version_coffee_variety_idx` on `['coffeeVarietyId', 'recipeId']`
  - `comments`: `comment_recipe_parent_created_idx` on `['recipeId', 'parentCommentId', 'createdAt']`, `comment_parent_created_idx` on `['parentCommentId', 'createdAt']`
  - `userFollows`: `user_follow_following_created_idx` on `['followingId', 'createdAt']`, `user_follow_follower_created_idx` on `['followerId', 'createdAt']`
  - `setups`: `setup_user_created_idx` on `['userId', 'createdAt']`
  - `beans`: `bean_user_created_idx` on `['userId', 'createdAt']`
  - `photos`: `photo_recipe_sort_order_idx` on `['recipeId', 'sortOrder']`
  - `tasteNotes`: `taste_note_deleted_at_idx` on `['deletedAt']` (single column), `taste_note_parent_name_idx` on `['parentId', 'name']`, `taste_note_depth_name_idx` on `['depth', 'name']`
  - `reports`: `report_status_created_idx` on `['status', 'createdAt']`
  - `equipment`: `equipment_type_name_idx` on `['type', 'name']`
  - `coffeeVarieties`: `coffee_variety_category_name_idx` on `['category', 'name']`

  Each test block should also include a `describe` for the table with a docblock explaining what queries the table's indexes serve.

- [x] 13.5 Run the schema index tests:

  ```
  make test-specific filter=packages/db/src/schema-indexes.test.ts
  ```

  Every test must pass.

## 14. Create PR description file (from scratch)

- [x] 14.1 Create `pr_description.md` at the project root (overwriting the existing unrelated file). The file SHALL be written from scratch with this structure:

  ```markdown
  # Add Composite Indexes for Common Query Patterns

  ## Summary

  Adds 18 database indexes (17 composite, 1 single-column parity fix) across
  11 tables to optimize the most common `WHERE` + `ORDER BY` query patterns
  that currently force PostgreSQL into bitmap index merges or in-memory sorts.

  ## Why

  The codebase has exclusively single-column indexes. As data grows, queries
  like the homepage feed (`WHERE visibility = 'public' ORDER BY createdAt DESC`)
  and coffee variety filters (`WHERE coffeeVarietyId = ?` with ZERO index) are
  becoming bottlenecks.

  ## What's Added

  ### Recipes (3 composite indexes)
  | Index | Columns | Query Served |
  |-------|---------|-------------|
  | `recipe_author_visibility_idx` | `(authorId, visibility)` | User profile: `WHERE authorId = ? AND visibility = ?` |
  | `recipe_visibility_created_idx` | `(visibility, createdAt)` | Homepage/feed: `WHERE visibility = 'public' ORDER BY createdAt DESC` |
  | `recipe_visibility_like_count_idx` | `(visibility, likeCount)` | Trending: `WHERE visibility = 'public' ORDER BY likeCount DESC` |

  ### Recipe Versions (1 composite index — CRITICAL)
  | Index | Columns | Query Served |
  |-------|---------|-------------|
  | `recipe_version_coffee_variety_idx` | `(coffeeVarietyId, recipeId)` | Coffee variety filters — `coffeeVarietyId` had NO index, causing sequential scans |

  ### Comments (2 composite indexes)
  | Index | Columns | Query Served |
  |-------|---------|-------------|
  | `comment_recipe_parent_created_idx` | `(recipeId, parentCommentId, createdAt)` | Top-level comments: `WHERE recipeId = ? AND parentCommentId IS NULL ORDER BY createdAt DESC` |
  | `comment_parent_created_idx` | `(parentCommentId, createdAt)` | Replies: `WHERE parentCommentId IN (?) ORDER BY createdAt ASC` |

  ### User Follows (2 composite indexes)
  | Index | Columns | Query Served |
  |-------|---------|-------------|
  | `user_follow_following_created_idx` | `(followingId, createdAt)` | Follower list: `WHERE followingId = ? ORDER BY createdAt DESC` |
  | `user_follow_follower_created_idx` | `(followerId, createdAt)` | Following list: `WHERE followerId = ? ORDER BY createdAt DESC` |

  ### Setups (1 composite index)
  | Index | Columns | Query Served |
  |-------|---------|-------------|
  | `setup_user_created_idx` | `(userId, createdAt)` | Setup listing: `WHERE userId = ? ORDER BY createdAt DESC` (no `createdAt` index before) |

  ### Beans (1 composite index)
  | Index | Columns | Query Served |
  |-------|---------|-------------|
  | `bean_user_created_idx` | `(userId, createdAt)` | Bean listing: `WHERE userId = ? ORDER BY createdAt DESC` (no `createdAt` index before) |

  ### Photos (1 composite index)
  | Index | Columns | Query Served |
  |-------|---------|-------------|
  | `photo_recipe_sort_order_idx` | `(recipeId, sortOrder)` | Photo listing: `WHERE recipeId = ? ORDER BY sortOrder ASC` (no `sortOrder` index before) |

  ### Taste Notes (2 composite + 1 parity single-column index)
  | Index | Columns | Query Served |
  |-------|---------|-------------|
  | `taste_note_deleted_at_idx` | `(deletedAt)` | Parity fix — every other soft-delete table has this; `tasteNotes` was the exception |
  | `taste_note_parent_name_idx` | `(parentId, name)` | Child notes: `WHERE parentId = ? ORDER BY name ASC` |
  | `taste_note_depth_name_idx` | `(depth, name)` | Full tree load: `ORDER BY depth ASC, name ASC` |

  ### Reports (1 composite index)
  | Index | Columns | Query Served |
  |-------|---------|-------------|
  | `report_status_created_idx` | `(status, createdAt)` | Report listing: `WHERE status = ? ORDER BY createdAt DESC` |

  ### Equipment (1 composite index)
  | Index | Columns | Query Served |
  |-------|---------|-------------|
  | `equipment_type_name_idx` | `(type, name)` | Filter by type: `WHERE type = ? ORDER BY name ASC` |

  ### Coffee Varieties (1 composite index)
  | Index | Columns | Query Served |
  |-------|---------|-------------|
  | `coffee_variety_category_name_idx` | `(category, name)` | Filter by category: `WHERE category = ? ORDER BY name ASC` |

  ## How to Apply

  ```bash
  make db-migrate
  ```

  This runs the generated migration (`0006_<name>.sql`) which creates all 18
  indexes.

  ## Verification (Optional)

  ```sql
  EXPLAIN ANALYZE SELECT * FROM recipe WHERE visibility = 'public' ORDER BY created_at DESC LIMIT 20;
  EXPLAIN ANALYZE SELECT recipe_id FROM recipe_version WHERE coffee_variety_id = '<any-uuid>';
  EXPLAIN ANALYZE SELECT * FROM comment WHERE recipe_id = '<any-uuid>' AND parent_comment_id IS NULL ORDER BY created_at DESC LIMIT 50;
  ```

  Expected: query plans show Index Scan or Index Only Scan using the new
  composite indexes.

  ## No Breaking Changes

  - Purely additive — no existing indexes modified, no query logic changed
  - No API changes, no frontend changes
  - Indexes can be dropped with zero data loss if needed

  ## Context

  Full design, spec, and task breakdown in:
  [`openspec/changes/d23-add-composite-indexes/`](openspec/changes/d23-add-composite-indexes/proposal.md)
  ```

  Notes:
  - Keep the table formatting simple (GitHub-flavored markdown).
  - The colons in the first column of each table should have a space after them for proper rendering.
  - The file should be ~100 lines, self-contained, and readable as a standalone PR description.

- [x] 14.2 Verify the file exists: `ls -la pr_description.md`.

## 15. Final verification

- [x] 15.1 Run `make ci` — full pipeline must pass clean:
  - `fmt-check` — formatting
  - `lint` — zero warnings
  - `check` — type-check all workspaces
  - `build-web` — web app builds
  - `check-tests` — test type-checks
  - `test-coverage` — all tests pass with coverage
  - `test-web` — web tests pass

- [x] 15.2 Run the index test specifically one more time to confirm:
  ```
  make test-specific filter=packages/db/src/schema-indexes.test.ts
  ```

- [x] 15.3 Manual verification (optional): With the API running, execute:
  ```sql
  EXPLAIN ANALYZE SELECT * FROM recipe WHERE visibility = 'public' ORDER BY created_at DESC LIMIT 20;
  EXPLAIN ANALYZE SELECT * FROM recipe WHERE visibility = 'public' ORDER BY like_count DESC LIMIT 20;
  EXPLAIN ANALYZE SELECT recipe_id FROM recipe_version WHERE coffee_variety_id = '<any-uuid>';
  ```
  Confirm the query plans use the new composite indexes.

- [x] 15.4 Confirm `pr_description.md` exists at the project root and is correct.
