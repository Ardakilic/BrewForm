## ADDED Requirements

### Requirement: Brew log table composite indexes

The `brewLogs` table schema in `packages/db/src/schema.ts` SHALL define two composite indexes
covering its two list query patterns, plus the soft-delete convention index, each added to the
third-argument extra configurator array:

| # | Index Name | Columns | Drizzle Syntax |
|---|-----------|---------|---------------|
| 1 | `brew_log_user_brewed_idx` | `(userId, brewedAt)` | `index('brew_log_user_brewed_idx').on(table.userId, table.brewedAt)` |
| 2 | `brew_log_recipe_brewed_idx` | `(recipeId, brewedAt)` | `index('brew_log_recipe_brewed_idx').on(table.recipeId, table.brewedAt)` |
| 3 | `brew_log_deleted_at_idx` | `(deletedAt)` | `index('brew_log_deleted_at_idx').on(table.deletedAt)` |

No index SHALL be added on `recipeVersionId` because no query filters by it.

#### Scenario: User brew history uses `brew_log_user_brewed_idx`

- **WHEN** `findByUserId` executes `WHERE user_id = ? AND deleted_at IS NULL ORDER BY brewed_at DESC`
- **THEN** PostgreSQL SHALL be able to use `brew_log_user_brewed_idx` for an index seek on
  `user_id` followed by a presorted scan on `brewed_at` without a separate sort step

#### Scenario: Per-recipe brew history uses `brew_log_recipe_brewed_idx`

- **WHEN** `findByRecipeIdAndUser` executes
  `WHERE recipe_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY brewed_at DESC`
- **THEN** PostgreSQL SHALL be able to use `brew_log_recipe_brewed_idx` for an index seek on
  `recipe_id` with a `user_id` filter and presorted `brewed_at` output

#### Scenario: Index assertions pass

- **WHEN** `make test-specific filter=schema-indexes.test.ts` runs
- **THEN** assertions for `brew_log_user_brewed_idx` (columns `['user_id','brewed_at']`,
  `isUnique: false`), `brew_log_recipe_brewed_idx` (columns `['recipe_id','brewed_at']`,
  `isUnique: false`), and `brew_log_deleted_at_idx` pass
