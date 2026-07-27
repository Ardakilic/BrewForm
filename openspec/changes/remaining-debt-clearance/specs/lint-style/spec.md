## MODIFIED Requirements

### Requirement: Raw SQL is confined to an accepted-exception registry

Raw `` sql`...` `` tag usage in production code SHALL be confined to a documented
accepted-exception registry; any site outside the registry is a violation. The registry:

| Accepted exception | Where |
|---|---|
| Health probe `SELECT 1` | health route |
| Atomic ±1 counters | recipe/comment counter increments |
| Atomic not-featured toggle | `recipe/model.ts:830` — ONLY if the Drizzle `not()` rewrite is not clean; otherwise the site is converted and this row is not added |
| `count(distinct ...)` | where Drizzle lacks a helper |
| Correlated `EXISTS` | `equipment/model.ts:116-124` (existing NOTE) |
| Schema `check()` constraint expressions | `packages/db/src/schema.ts` |
| Row-value keyset comparison | `recipe/model.ts` `buildCursorWhere` — `(created_at, id) < ($1, $2)` for composite index sargability; Drizzle has no native row-value operator |

**Reason:** The row-value keyset comparison (D99.8) requires a raw-SQL fragment because Drizzle
ORM has no first-class row-value comparison operator. The `sql` template tag is the idiomatic
escape hatch, consistent with the existing accepted exceptions. The predicate replaces the
previous OR emulation to enable full composite index seeks at higher cardinality.

#### Scenario: Every raw sql site is a registry entry

- **WHEN** production code is grepped for `` sql` `` after the change
- **THEN** every match corresponds to a registry row (health probe, counters/toggle,
  count(distinct), equipment EXISTS, schema check(), row-value keyset)

## ADDED Requirements

### Requirement: Test files use `*.test.ts` naming convention

All test files across the monorepo SHALL use the `*.test.ts` (or `*.test.tsx`) naming
convention. The `*_test.ts` suffix SHALL NOT be used for new test files. The six existing
`*_test.ts` files SHALL be renamed to `*.test.ts`:

| Old path | New path |
|---|---|
| `packages/shared/src/utils/cursor_test.ts` | `packages/shared/src/utils/cursor.test.ts` |
| `apps/api/src/modules/collection/service_test.ts` | `apps/api/src/modules/collection/service.test.ts` |
| `apps/api/src/modules/collection/model_test.ts` | `apps/api/src/modules/collection/model.test.ts` |
| `apps/api/src/modules/collection/index_test.ts` | `apps/api/src/modules/collection/index.test.ts` |
| `apps/api/src/modules/recipe/index_test.ts` | `apps/api/src/modules/recipe/index.test.ts` |
| `apps/api/src/modules/follow/index_test.ts` | `apps/api/src/modules/follow/index.test.ts` |

**Reason:** The codebase has ~150 `*.test.ts` files and only 6 `*_test.ts` files (96% majority
for the dot convention). The recipe module has both conventions simultaneously, which is
confusing. Both patterns are picked up by test runners, so this is pure consistency debt.
Standardizing on the majority convention minimizes churn.

#### Scenario: No `*_test.ts` files remain

- **WHEN** `find apps packages -name '*_test.ts' -o -name '*_test.tsx'` is run
- **THEN** zero files are returned

#### Scenario: All tests still discovered after rename

- **WHEN** `make test` runs after the rename
- **THEN** all previously-passing tests still pass (test runners discover `*.test.ts` files)
