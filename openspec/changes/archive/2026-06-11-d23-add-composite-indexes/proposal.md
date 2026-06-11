## Why

The codebase currently uses exclusively single-column indexes across most tables.
This forces PostgreSQL to either intersect multiple indexes via bitmap scans or
fall back to sequential scans on compound `WHERE` clauses with `ORDER BY`. As
the dataset grows, these patterns increasingly bottleneck the homepage feed,
profile pages, explore/search, and admin tooling.

A systematic audit of all query patterns in `apps/api/src/modules/**/model.ts`
revealed **17 composite index opportunities** across **11 tables**:

| Severity | Tables | Pattern |
|----------|--------|---------|
| CRITICAL | `recipeVersions` | `coffeeVarietyId` has **no index at all** — every coffee-variety filter performs a sequential scan |
| HIGH | `recipes` (original plan) | `WHERE visibility = ? ORDER BY createdAt/likeCount`, `WHERE authorId = ? AND visibility = ?` |
| HIGH | `comments` | `WHERE recipeId = ? AND parentCommentId IS NULL ORDER BY createdAt` — used on every recipe detail page |
| HIGH | `userFollows` | `WHERE followingId/followerId = ? ORDER BY createdAt` — follower/following lists |
| HIGH | `setups` | `WHERE userId = ? ORDER BY createdAt` — **no `createdAt` index exists** |
| HIGH | `beans` | `WHERE userId = ? ORDER BY createdAt` — **no `createdAt` index exists** |
| HIGH | `photos` | `WHERE recipeId = ? ORDER BY sortOrder` — **no `sortOrder` index exists** |
| MEDIUM | `tasteNotes`, `reports`, `equipment`, `coffeeVarieties` | Composite sort+filter indexes, plus missing `deletedAt` index on tasteNotes |
| LOW | `userRecipeRatings`, `vendors` | Index-only scan optimizations (deferred) |

All changes are additive — no queries or existing indexes are modified. Each
composite index is non-destructive and can be dropped with zero data loss if
found to be unnecessary.

## What Changes

- **Add 17 composite (and 1 single-column parity) indexes** to
  `packages/db/src/schema.ts` across 11 tables, covering the most common
  `WHERE` + `ORDER BY` query patterns in the codebase.
- **Generate a Drizzle migration** via `make db-generate` and apply it via
  `make db-migrate`.
- **Add schema-level tests** verifying the new Drizzle index definitions.
- **Create `pr_description.md`** at the project root summarizing all changes
  for PR review.
- **Zero query logic changes.** No SQL, no service layer, no controller
  changes. This is a pure schema/performance optimization.

## Capabilities

### New Capability

- `db-indexes`: Covers the addition and validation of composite indexes
  across the database schema, including column ordering rationale,
  migration generation, and schema-level test coverage.

## Impact

- **Read performance:** Index-backed queries will use index-only scans or
  single-index range scans instead of bitmap merges or sequential scans.
- **Write performance:** Minimal increase in insert/update overhead (index
  maintenance) — acceptable for a read-heavy workload.
- **Storage:** Slight increase in disk usage (index pages). Negligible for
  current data volumes.
- **Migration time:** Brief exclusive-lock during index creation on large
  tables. For the `recipeVersions` table specifically (CRITICAL path),
  `CREATE INDEX CONCURRENTLY` can be considered if table size warrants it.
