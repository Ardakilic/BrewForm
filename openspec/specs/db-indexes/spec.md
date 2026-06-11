# db-indexes Specification

## Purpose

Ensure database schemas define composite and single-column indexes for common query patterns (WHERE + ORDER BY) to optimize read performance, avoid bitmap index merges, and prevent sequential scans. Covers B-tree index strategy, column ordering for seek + sort, JSDoc documentation on every index definition, automated migration generation, and schema-level verification tests.
## Requirements
### Requirement: Recipe table composite indexes

The `recipes` table schema in `packages/db/src/schema.ts` SHALL define three composite indexes covering the highest-traffic query patterns. Each composite SHALL be added to the third-argument extra configurator array (the `(table) => [...]` callback), immediately after the existing `recipe_deleted_at_idx` entry.

The indexes SHALL be:

| # | Index Name | Columns | Drizzle Syntax |
|---|-----------|---------|---------------|
| 1 | `recipe_author_visibility_idx` | `(authorId, visibility)` | `index('recipe_author_visibility_idx').on(table.authorId, table.visibility)` |
| 2 | `recipe_visibility_created_idx` | `(visibility, createdAt)` | `index('recipe_visibility_created_idx').on(table.visibility, table.createdAt)` |
| 3 | `recipe_visibility_like_count_idx` | `(visibility, likeCount)` | `index('recipe_visibility_like_count_idx').on(table.visibility, table.likeCount)` |

No existing single-column index SHALL be modified or removed. The `featured` column SHALL NOT be included in any composite index because it is never used as a query filter in the codebase (only toggled via the `toggleFeature` mutation).

#### Scenario: `recipe_author_visibility_idx` covers user profile queries

- **WHEN** `buildListRecipesWhere` composes `eq(recipes.visibility, 'public') AND eq(recipes.authorId, ?)` OR an admin filters by `eq(recipes.visibility, ?) AND eq(recipes.authorId, ?)`
- **THEN** PostgreSQL SHALL be able to use `recipe_author_visibility_idx` for an index seek on `authorId` followed by a visibility filter, eliminating the bitmap merge between the existing `recipe_author_id_idx` and `recipe_visibility_idx`

#### Scenario: `recipe_visibility_created_idx` covers homepage feed queries

- **WHEN** `findMany` executes `WHERE visibility = 'public' ORDER BY createdAt DESC` (via `listRecipes` with default `sortBy: 'createdAt'`, `sortOrder: 'desc'`) OR `getFeed` executes `WHERE visibility = 'public' AND authorId IN (...) ORDER BY createdAt DESC`
- **THEN** PostgreSQL SHALL use `recipe_visibility_created_idx` to filter by `visibility` and return rows in `createdAt` order without a separate sort step

#### Scenario: `recipe_visibility_like_count_idx` covers trending queries

- **WHEN** `findMany` executes `WHERE visibility = 'public' ORDER BY likeCount DESC` (via `listRecipes` with `sortBy: 'likeCount'`)
- **THEN** PostgreSQL SHALL use `recipe_visibility_like_count_idx` to filter by `visibility` and return rows in `likeCount` DESC order without a separate sort step

### Requirement: Recipe versions table `coffeeVarietyId` index

The `recipeVersions` table SHALL define a composite index on `(coffeeVarietyId, recipeId)` because `coffeeVarietyId` currently has **no index at all**, causing sequential scans on every coffee-variety filter.

| Index Name | Columns | Drizzle Syntax |
|-----------|---------|---------------|
| `recipe_version_coffee_variety_idx` | `(coffeeVarietyId, recipeId)` | `index('recipe_version_coffee_variety_idx').on(table.coffeeVarietyId, table.recipeId)` |

#### Scenario: Coffee variety filter subquery uses index-only scan

- **WHEN** `buildRecipeFilters` generates `inArray(recipes.id, db.select({ id: recipeVersions.recipeId }).from(recipeVersions).where(eq(recipeVersions.coffeeVarietyId, ?)))` via `recipeCoffeeVarietyCondition`
- **THEN** PostgreSQL SHALL use `recipe_version_coffee_variety_idx` for an index-only scan, reading both `coffeeVarietyId` and `recipeId` directly from the index without heap access

#### Scenario: Coffee variety detail page counts recipes efficiently

- **WHEN** `coffee-variety/model.ts:98-109` executes `SELECT count(distinct recipes.id) WHERE recipeVersions.coffeeVarietyId = ?`
- **THEN** PostgreSQL SHALL use `recipe_version_coffee_variety_idx` instead of a sequential scan on `recipeVersions`

### Requirement: Comments table composite indexes

The `comments` table SHALL define two composite indexes covering the top-level comment listing and reply fetching patterns.

| # | Index Name | Columns | Drizzle Syntax |
|---|-----------|---------|---------------|
| 1 | `comment_recipe_parent_created_idx` | `(recipeId, parentCommentId, createdAt)` | `index('comment_recipe_parent_created_idx').on(table.recipeId, table.parentCommentId, table.createdAt)` |
| 2 | `comment_parent_created_idx` | `(parentCommentId, createdAt)` | `index('comment_parent_created_idx').on(table.parentCommentId, table.createdAt)` |

#### Scenario: Top-level comments listing uses composite index

- **WHEN** `comment/model.ts:findByRecipe` executes `WHERE recipeId = ? AND deletedAt IS NULL AND parentCommentId IS NULL ORDER BY createdAt DESC`
- **THEN** PostgreSQL SHALL seek on `recipeId`, filter on `parentCommentId IS NULL`, and return rows in `createdAt` DESC order using `comment_recipe_parent_created_idx`

#### Scenario: Reply fetching uses composite index

- **WHEN** `comment/model.ts:findReplies` executes `WHERE parentCommentId IN (?) AND deletedAt IS NULL ORDER BY createdAt ASC`
- **THEN** PostgreSQL SHALL use `comment_parent_created_idx` to seek on each `parentCommentId` and return rows in `createdAt` ASC order without a sort

### Requirement: User follows table composite indexes

The `userFollows` table SHALL define two composite indexes covering follower and following paginated listings.

| # | Index Name | Columns | Drizzle Syntax |
|---|-----------|---------|---------------|
| 1 | `user_follow_following_created_idx` | `(followingId, createdAt)` | `index('user_follow_following_created_idx').on(table.followingId, table.createdAt)` |
| 2 | `user_follow_follower_created_idx` | `(followerId, createdAt)` | `index('user_follow_follower_created_idx').on(table.followerId, table.createdAt)` |

#### Scenario: Follower list uses composite index

- **WHEN** `follow/model.ts:getFollowers` executes `WHERE followingId = ? ORDER BY createdAt DESC` (paginated, with INNER JOIN on users)
- **THEN** PostgreSQL SHALL use `user_follow_following_created_idx` to seek on `followingId` and return rows in `createdAt` DESC order

#### Scenario: Following list uses composite index

- **WHEN** `follow/model.ts:getFollowing` executes `WHERE followerId = ? ORDER BY createdAt DESC` (paginated, with INNER JOIN on users)
- **THEN** PostgreSQL SHALL use `user_follow_follower_created_idx` to seek on `followerId` and return rows in `createdAt` DESC order

### Requirement: Setups table composite index

The `setups` table SHALL define a composite index on `(userId, createdAt)` because no `createdAt` index currently exists on this table.

| Index Name | Columns | Drizzle Syntax |
|-----------|---------|---------------|
| `setup_user_created_idx` | `(userId, createdAt)` | `index('setup_user_created_idx').on(table.userId, table.createdAt)` |

#### Scenario: Setup listing uses composite index

- **WHEN** `setup/model.ts:findByUser` executes `WHERE userId = ? AND deletedAt IS NULL ORDER BY createdAt DESC`
- **THEN** PostgreSQL SHALL use `setup_user_created_idx` to seek on `userId` and return rows in `createdAt` DESC order without an in-memory sort

### Requirement: Beans table composite index

The `beans` table SHALL define a composite index on `(userId, createdAt)` because no `createdAt` index currently exists on this table.

| Index Name | Columns | Drizzle Syntax |
|-----------|---------|---------------|
| `bean_user_created_idx` | `(userId, createdAt)` | `index('bean_user_created_idx').on(table.userId, table.createdAt)` |

#### Scenario: Bean listing uses composite index

- **WHEN** `bean/model.ts:findByUser` executes `WHERE userId = ? AND deletedAt IS NULL ORDER BY createdAt DESC`
- **THEN** PostgreSQL SHALL use `bean_user_created_idx` to seek on `userId` and return rows in `createdAt` DESC order without an in-memory sort

### Requirement: Photos table composite index

The `photos` table SHALL define a composite index on `(recipeId, sortOrder)` because no `sortOrder` index currently exists on this table.

| Index Name | Columns | Drizzle Syntax |
|-----------|---------|---------------|
| `photo_recipe_sort_order_idx` | `(recipeId, sortOrder)` | `index('photo_recipe_sort_order_idx').on(table.recipeId, table.sortOrder)` |

#### Scenario: Photo listing uses composite index

- **WHEN** `photo/model.ts:findByRecipe` executes `WHERE recipeId = ? AND deletedAt IS NULL ORDER BY sortOrder ASC`
- **THEN** PostgreSQL SHALL use `photo_recipe_sort_order_idx` to seek on `recipeId` and return rows in `sortOrder` ASC order without an in-memory sort

### Requirement: Taste notes table parity index and composites

The `tasteNotes` table SHALL define one single-column `deletedAt` index (parity with every other soft-delete table) and two composite indexes covering sort-heavy queries.

| # | Index Name | Columns | Drizzle Syntax |
|---|-----------|---------|---------------|
| 1 | `taste_note_deleted_at_idx` | `(deletedAt)` | `index('taste_note_deleted_at_idx').on(table.deletedAt)` |
| 2 | `taste_note_parent_name_idx` | `(parentId, name)` | `index('taste_note_parent_name_idx').on(table.parentId, table.name)` |
| 3 | `taste_note_depth_name_idx` | `(depth, name)` | `index('taste_note_depth_name_idx').on(table.depth, table.name)` |

#### Scenario: Child taste notes use composite index

- **WHEN** `taste/model.ts:findChildren` executes `WHERE parentId = ? AND deletedAt IS NULL ORDER BY name ASC`
- **THEN** PostgreSQL SHALL use `taste_note_parent_name_idx` to seek on `parentId` and return rows in `name` ASC order without a sort

#### Scenario: Full taste note hierarchy uses composite index

- **WHEN** `taste/model.ts:findAll` or `getHierarchy` executes `ORDER BY depth ASC, name ASC WHERE deletedAt IS NULL`
- **THEN** PostgreSQL SHALL use `taste_note_depth_name_idx` for an index scan that returns rows in `(depth, name)` order without a sort step

### Requirement: Reports table composite index

The `reports` table SHALL define a composite index on `(status, createdAt)` for the common pattern of filtering pending reports by newest-first.

| Index Name | Columns | Drizzle Syntax |
|-----------|---------|---------------|
| `report_status_created_idx` | `(status, createdAt)` | `index('report_status_created_idx').on(table.status, table.createdAt)` |

#### Scenario: Report listing uses composite index

- **WHEN** `report/model.ts:findMany` or `admin/model.ts:listReports` executes `WHERE status = ? ORDER BY createdAt DESC`
- **THEN** PostgreSQL SHALL use `report_status_created_idx` to seek on `status` and return rows in `createdAt` DESC order

### Requirement: Equipment table composite index

The `equipment` table SHALL define a composite index on `(type, name)` for the pattern of filtering equipment by type and sorting by name.

| Index Name | Columns | Drizzle Syntax |
|-----------|---------|---------------|
| `equipment_type_name_idx` | `(type, name)` | `index('equipment_type_name_idx').on(table.type, table.name)` |

#### Scenario: Equipment filtered by type uses composite index

- **WHEN** `equipment/model.ts:findManyWithFilters` executes `WHERE type = ? AND deletedAt IS NULL ORDER BY name ASC`
- **THEN** PostgreSQL SHALL use `equipment_type_name_idx` to seek on `type` and return rows in `name` ASC order

### Requirement: Coffee varieties table composite index

The `coffeeVarieties` table SHALL define a composite index on `(category, name)` for filtering by category and sorting by name.

| Index Name | Columns | Drizzle Syntax |
|-----------|---------|---------------|
| `coffee_variety_category_name_idx` | `(category, name)` | `index('coffee_variety_category_name_idx').on(table.category, table.name)` |

#### Scenario: Coffee varieties filtered by category use composite index

- **WHEN** `coffee-variety/model.ts:findMany` or `admin/model.ts:listCoffeeVarieties` executes `WHERE category = ? AND deletedAt IS NULL ORDER BY name ASC`
- **THEN** PostgreSQL SHALL use `coffee_variety_category_name_idx` to seek on `category` and return rows in `name` ASC order

### Requirement: Migration generation and application

The Drizzle schema changes SHALL produce a valid migration when `make db-generate` is executed. The migration SHALL be applicable without errors when `make db-migrate` is executed. The generated SQL SHALL contain exactly the expected `CREATE INDEX` statements — one per new index definition, with no unexpected statements.

#### Scenario: Migration generates cleanly

- **WHEN** `make db-generate` is executed after all schema changes
- **THEN** a new migration SQL file (e.g., `0006_<codename>.sql`) is created in `packages/db/drizzle/` containing `CREATE INDEX` statements for each new index, and the Drizzle meta snapshot (`_journal.json` + `snapshot.json`) is updated

#### Scenario: Migration applies cleanly

- **WHEN** `make db-migrate` is executed
- **THEN** all new indexes are created in the database without errors, and no existing constraints are violated

### Requirement: Docblocks on all new index definitions

Every new `index(...)` entry added to `packages/db/src/schema.ts` SHALL be preceded by a JSDoc comment block that documents:

1. **Which query pattern(s) the index serves** — referencing the specific model function(s) and file:line
2. **The column ordering rationale** — why columns are in this order
3. **Whether the index covers nullable columns** — if any key column is nullable, note that PostgreSQL B-tree handles it correctly

The docblock format SHALL match the project's JSDoc convention — a `/** ... */` block immediately before the `index(...)` call. Example:

```typescript
/**
 * Composite index for user profile recipe listings.
 *
 * Serves `buildListRecipesWhere` (model.ts:187) when `authorId` filter
 * is combined with visibility. Equality columns first (authorId,
 * visibility) for direct B-tree seek.
 */
index('recipe_author_visibility_idx').on(table.authorId, table.visibility),
```

At minimum, every new composite index SHALL have a docblock. The single-column `taste_note_deleted_at_idx` parity fix SHALL also have a docblock noting it's added for consistency with all other soft-delete tables.

#### Scenario: Every new index has a docblock

- **WHEN** `packages/db/src/schema.ts` is inspected after implementation
- **THEN** every newly added `index(...)` line is immediately preceded by a `/** ... */` JSDoc comment block explaining the query pattern it serves

### Requirement: Schema-level index definition verification

A test file `packages/db/src/schema-indexes.test.ts` SHALL exist and SHALL verify that each new composite index is defined in the Drizzle schema. The test SHALL use the **public, stable** `getTableConfig` function from `drizzle-orm/pg-core` to introspect index configurations. No internal or unstable APIs SHALL be used.

The test file SHALL contain:
- A `getTableIndexes(table)` helper function with a JSDoc docblock that extracts `{ name, columns, isUnique }` from a `PgTable` instance via `getTableConfig(table).indexes`.
- A `describe` block per table, with one `it` per new composite index.
- Each test case SHALL assert: (a) the index exists by name, (b) the column list matches exactly, (c) the index is not unique.

The test SHALL cover at minimum:
- All 3 recipe table composite indexes
- The `recipe_version_coffee_variety_idx` composite index
- All other composite and parity indexes added by this change (18 total)

#### Scenario: Test helper uses public Drizzle API

- **WHEN** `packages/db/src/schema-indexes.test.ts` is inspected
- **THEN** it imports `getTableConfig` from `drizzle-orm/pg-core` (not from any internal path), and the `getTableIndexes` helper accesses `config.name`, `config.columns`, and `config.unique` on the `Index` objects returned by `getTableConfig(table).indexes`

#### Scenario: Schema index tests pass

- **WHEN** `make test` or `make test-specific filter=packages/db/src/schema-indexes.test.ts` is executed
- **THEN** every test case passes, confirming each index is defined with the correct name, column order, and uniqueness

### Requirement: PR description file

A `pr_description.md` file SHALL be created at the project root. It SHALL summarize the change, list every index added (grouped by table with rationale), include the command to apply locally (`make db-migrate`), note that no query logic is changed, and reference this OpenSpec change folder for full context. The file SHALL be written from scratch (the existing unrelated `pr_description.md` is overwritten).

#### Scenario: `pr_description.md` exists at project root

- **WHEN** the project root is inspected after implementation
- **THEN** `pr_description.md` exists, is self-contained, and contains the index list and migration instructions

