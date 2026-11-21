## MODIFIED Requirements

### Requirement: Raw SQL is confined to an accepted-exception registry

Raw SQL in production code under `apps/*/src` and `packages/*/src` SHALL be confined to the accepted-exception registry below: every Drizzle `` sql`…` `` fragment (plain or typed, `` sql<T>`…` ``) and every raw postgres-js statement SHALL match a registry row, SHALL interpolate only Drizzle tables, columns, expressions and bound values (never concatenated text), and SHALL carry a `// D03 raw-SQL exception: <why>` comment within the 10 lines above it; `sql.raw(` and postgres-js `.unsafe(` SHALL NOT appear there.

| Accepted exception | Where | Why Drizzle cannot express it |
|---|---|---|
| Atomic counter updates | `apps/api/src/modules/recipe/model.ts`: `forkCount` in `forkRecipe`, `commentCount` in `incrementComments` (+1) and `decrementComments` (minus the number of comments a delete removed, a bound value), `likeCount` in both branches of `toggleLike` | `.set()` has no increment helper; `` sql`${col} + 1` `` (or `` sql`${col} - ${by}` `` with a bound amount) keeps the update atomic in one statement |
| Correlated `EXISTS` | `apps/api/src/modules/equipment/model.ts` `getRecipesUsingEquipment` (`equipmentExists`) | `exists()` correlates against the physical table name, not the relational query's `recipes` alias (see `equipment-recipe-query`) |
| Relevance score (`CASE`, `COALESCE`) | `apps/api/src/modules/recipe/model.ts` `buildListPageQuery` (two fragments) | no `CASE` or `COALESCE` builder (ADR-017) |
| `NULLS LAST` ordering | `apps/api/src/modules/recipe/model.ts` `buildListPageQuery` (the asc/desc pair) | `asc()`/`desc()` take no nulls option (ADR-017) |
| Row-value keyset comparison | `apps/api/src/modules/recipe/model.ts` `buildCursorWhere` (the asc/desc pair) | no row-value operator; `(created_at, id) < ($1, $2)` keeps `recipe_created_at_id_idx` sargable |
| `lower()` | `packages/db/src/schema.ts` `lower()` helper over a column or a bound value (one fragment), used by the `user_email_lower_unique`/`user_username_lower_unique` expression indexes and both sides of identifier lookups | no `lower()` builder (Drizzle's own case-insensitive email guide defines the same helper) |
| Schema `check()` expressions | `packages/db/src/schema.ts` (the seven `check()` constraints) | `check()` takes an SQL expression by API |
| Partial-index predicates | `packages/db/src/schema.ts` `setup_user_default_unique` `.where()` | index `.where()` takes an SQL expression, and DDL cannot carry bound parameters |
| Migration pre-flight catalog query | `packages/db/src/preflight.ts` `assertMigrationPreflight` (one postgres-js tagged template with fixed text and no interpolated values) | it runs before any migration against catalog views (`pg_extension`, `pg_available_extensions`) and `has_database_privilege()`, which have no Drizzle model |

`packages/shared/src/lint-policy.test.ts` SHALL enforce this requirement. It scans the production files of the four source trees (it skips `*.test.ts`, `*.test.tsx`, `test-helpers.ts`, `test-setup.ts`, `test-fixtures/` and comment lines) and fails with `file:line` when a fragment has no D03 comment within the 10 lines above it, when `sql.raw(` or `.unsafe(` appears, or when a file's fragment count differs from its entry in the test's `RAW_SQL_REGISTRY` map (a file without an entry allows none). A new exception therefore changes this table and that map in the same change. Developer scripts outside the source trees (`apps/api/scripts/flush-db.ts` truncates tables by schema-derived names with `.unsafe`) are out of scope.

**Reason:** The D-series waves established the registry; D99.16 converted the five sites that had drifted outside it by 2026-07-19 (`count()`, `max()`, `isNull()`, and `not()` for the featured toggle). Wave 6 then added `lower()`, the partial-index predicate and the migration pre-flight without registry rows, while the table still listed a health-probe `SELECT 1` and a featured-toggle row that no longer exist, and a `count(distinct …)` row although drizzle-orm has shipped `countDistinct()` since 0.29.1 (0.45.4 is installed, and `brew-log/model.ts` already uses it). A grep-only rule drifted twice, so the meta-test makes the registry executable.

#### Scenario: Every raw sql site is a registry entry

- **WHEN** `make test-shared` runs `lint-policy.test.ts` on the repository
- **THEN** every raw-SQL fragment it finds is in a file listed in `RAW_SQL_REGISTRY` with a matching count, each fragment has a `// D03 raw-SQL exception:` comment within the 10 lines above it, and the test passes

#### Scenario: Converted sites behave identically

- **WHEN** the three `` sql<number>`count(distinct ${recipes.id})` `` selects in `coffee-variety/model.ts`, `admin/model.ts` and `equipment/model.ts` are rewritten with `countDistinct(recipes.id)` and `make test-api` runs
- **THEN** the existing count assertions for `getRecipesUsingVariety`, `getVarietyRecipeCount` and `getRecipesUsingEquipment` pass unchanged

#### Scenario: An unregistered fragment fails the tests

- **WHEN** a contributor adds a new commented `sql` fragment to `apps/api/src/modules/recipe/model.ts` without updating the registry
- **THEN** `make test-shared` fails and names the file with its expected and actual fragment counts

#### Scenario: A fragment without its D03 comment fails the tests

- **WHEN** a raw-SQL fragment has no `// D03 raw-SQL exception: <why>` comment, or one with an empty reason, in the 10 lines above it
- **THEN** `make test-shared` fails with that `file:line`

#### Scenario: String-built SQL is rejected

- **WHEN** `sql.raw(` or `.unsafe(` appears in a production file under `apps/*/src` or `packages/*/src`
- **THEN** `make test-shared` fails with that `file:line`
