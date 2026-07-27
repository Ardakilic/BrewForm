## 1. T1 — D99.4: Remove lone `security: []`

One-line deletion. The OpenAPI document has no global `security` requirement
(`apps/api/src/routes/openapi.ts:51-57`), so `security: []` on a public route is functionally
identical to omitting the key. Every other public route omits it (auth register at
`auth/index.ts:70`, health at `health.ts:10`, share at `share.ts:55`).

- [ ] 1.1 In `apps/api/src/modules/collection/index.ts`, delete the line `security: [],`
  (line 120, inside the `describeRoute({...})` block for `GET /public`). The surrounding
  `description` and `parameters` keys are unchanged.

**Section verification:**

- [ ] 1.2 `make check-api` passes.
- [ ] 1.3 `make lint` passes.
- [ ] 1.4 `make test-specific filter=apps/api/src/routes/openapi.coverage.test.ts` passes —
  the OpenAPI introspection coverage test confirms the route is still documented.
- [ ] 1.5 Grep gate: `rg "security: \[\]" apps/api/src/` returns zero matches.

---

## 2. T2 — D99.18: Standardize test-file naming to `*.test.ts`

Six files use the `*_test.ts` convention; ~150 use `*.test.ts` (96% majority). Rename the
outliers. The lint-style spec's grep gates use inclusive globs (`-g '*.test.ts' -g '*_test.ts'`)
that continue to work after the rename — the `*_test.ts` glob simply matches nothing.

- [ ] 2.1 Rename via `git mv` (preserves history):
  ```
  git mv packages/shared/src/utils/cursor_test.ts packages/shared/src/utils/cursor.test.ts
  git mv apps/api/src/modules/collection/service_test.ts apps/api/src/modules/collection/service.test.ts
  git mv apps/api/src/modules/collection/model_test.ts apps/api/src/modules/collection/model.test.ts
  git mv apps/api/src/modules/collection/index_test.ts apps/api/src/modules/collection/index.test.ts
  git mv apps/api/src/modules/recipe/index_test.ts apps/api/src/modules/recipe/index.test.ts
  git mv apps/api/src/modules/follow/index_test.ts apps/api/src/modules/follow/index.test.ts
  ```

- [ ] 2.2 Search for any import references to the old filenames:
  `rg "cursor_test|service_test|model_test|index_test" apps packages -g '*.ts' -g '*.tsx'`
  Update any matches to the new names. (Test files are rarely imported, but verify.)

- [ ] 2.3 In `AGENTS.md`, in the "Testing" section, add after the existing "Tests run with
  `--no-check`" line:
  ```
  - Test files use `*.test.ts` (or `*.test.tsx`) naming — never `*_test.ts`.
  ```

- [ ] 2.4 In `openspec/specs/cursor-pagination/spec.md`, update the stale filename reference
  in the "All new code covered by tests" requirement (line ~326): change
  `packages/shared/src/utils/cursor_test.ts` to `packages/shared/src/utils/cursor.test.ts`.

**Section verification:**

- [ ] 2.5 `make check` passes.
- [ ] 2.6 `make lint` passes.
- [ ] 2.7 `make test` passes — all renamed tests are still discovered and pass.
- [ ] 2.8 Grep gate: `find apps packages -name '*_test.ts' -o -name '*_test.tsx'` returns
  zero files.

---

## 3. T3 — D99.17: Architecture deviations

Three sub-tracks: recipe service threading, contact documentation, follow/badge drizzle
import fixes. All are convention compliance — no behaviour changes.

### 3a. Recipe: thread model calls through service

`apps/api/src/modules/recipe/index.ts:24` imports `* as model from './model.ts'` and calls
model functions directly at 7 sites, bypassing the service layer. Add thin service wrappers
and re-route.

- [ ] 3.1 Read `apps/api/src/modules/recipe/model.ts` to get the exact signatures of these 6
  functions: `getVersionsByRecipeId`, `getUserLikeStatus`, `getFavouriteCount`,
  `getRecipeRatingStats`, `getUserRating`, `upsertUserRating`. Note parameter names, types,
  and return types.

- [ ] 3.2 In `apps/api/src/modules/recipe/service.ts`, add 6 exported thin-wrapper functions
  (one per unique model function). Each is a one-liner delegating to `model.*` with a
  one-line JSDoc docblock. Place them near the existing recipe-related service functions.
  The wrappers MUST match the model signatures exactly (same parameter names, same return
  type). Example shape:

  ```typescript
  /** List all versions for a recipe. */
  export function getVersionsByRecipeId(recipeId: string) {
    return model.getVersionsByRecipeId(recipeId);
  }
  ```

  Do NOT add business logic, caching, or logging — these are convention-compliance
  passthroughs only.

- [ ] 3.3 In `apps/api/src/modules/recipe/index.ts`, replace all 7 `model.*` call sites with
  `service.*`:
  - `model.getVersionsByRecipeId(recipe.id)` → `service.getVersionsByRecipeId(recipe.id)`
  - `model.getUserLikeStatus(userId, recipeId)` → `service.getUserLikeStatus(userId, recipeId)`
  - `model.getFavouriteCount(recipeId)` → `service.getFavouriteCount(recipeId)`
  - `model.getRecipeRatingStats(recipeId)` → `service.getRecipeRatingStats(recipeId)` (2 sites)
  - `model.getUserRating(userId, recipeId)` → `service.getUserRating(userId, recipeId)`
  - `model.upsertUserRating(userId, recipeId, rating)` → `service.upsertUserRating(userId, recipeId, rating)`

- [ ] 3.4 After replacing all call sites, check if `model` is still referenced anywhere in
  `index.ts`: `rg "model\." apps/api/src/modules/recipe/index.ts`. If zero matches, delete
  `import * as model from './model.ts'` (line 24). If other references remain (e.g., type
  imports), keep the import but verify no direct model function calls bypass the service.

### 3b. Contact: document accepted deviation

- [ ] 3.5 In `AGENTS.md`, in the "API module pattern" section, add after the existing
  convention bullets:
  ```
  - **Accepted deviation:** the `contact` module is a controller-only email endpoint with no
    DB access; it intentionally skips the `model.ts`/`service.ts` split.
  ```

### 3c. Follow service: use userModel.findById

`follow/service.ts:37` queries the `users` table directly via
`db.select().from(users).where(eq(users.id, followerId)).limit(1)` to get a follower's
username for notification content. `user/model.ts` already exports `findById(id)` which
returns the full user row including `username`.

- [ ] 3.6 Read `apps/api/src/modules/follow/service.ts` in full. Identify the exact line
  where the direct `db.select().from(users)` query runs and how the result is used downstream
  (which fields are read from the row).

- [ ] 3.7 In `apps/api/src/modules/follow/service.ts`:
  - Add import: `import * as userModel from '../user/model.ts';`
  - Replace the direct query with: `const follower = await userModel.findById(followerId);`
  - Update downstream code to use `follower?.username` (or equivalent, matching the existing
    null-handling — `findById` returns `null` if the user doesn't exist).
  - Delete the now-unused imports: `import { db } from '@brewform/db'`,
    `import { users } from '@brewform/db/schema'`, `import { eq } from 'drizzle-orm'`.
    (Only delete imports that are truly unused after the change — check with
    `rg "db\b" apps/api/src/modules/follow/service.ts` etc.)

### 3d. Badge service: add userModel.listActiveUserIds

`badge/service.ts:42-46` queries the `users` table directly via
`db.select({id: users.id}).from(users).where(and(isNull(users.deletedAt), gt(users.id, lastId))).orderBy(asc(users.id)).limit(batchSize)`
to cursor-batch user IDs for badge evaluation. No `user/model.ts` function covers this.

- [ ] 3.8 Read `apps/api/src/modules/badge/service.ts` in full. Identify the exact cursor-batch
  query and how the result is used downstream (the existing code likely maps rows to IDs).

- [ ] 3.9 Read `apps/api/src/modules/user/model.ts` to understand the existing imports (`db`,
  drizzle helpers, `users` table) and the file's code style.

- [ ] 3.10 In `apps/api/src/modules/user/model.ts`, add a new exported function. Use the same
  `db` import and drizzle helpers already present in the file. Match the file's existing code
  style (JSDoc docblock, async/await, return type annotation):

  ```typescript
  /**
   * List active (non-deleted) user IDs in ascending ID order, for cursor-based batching.
   * @param afterId - Return IDs strictly greater than this value; null starts from the beginning.
   * @param limit - Maximum number of IDs to return.
   */
  export async function listActiveUserIds(
    afterId: string | null,
    limit: number,
  ): Promise<string[]> {
    const where = afterId
      ? and(isNull(users.deletedAt), gt(users.id, afterId))
      : isNull(users.deletedAt);
    const rows = await db.query.users.findMany({
      columns: { id: true },
      where,
      orderBy: [asc(users.id)],
      limit,
    });
    return rows.map((r) => r.id);
  }
  ```

  Verify that `and`, `isNull`, `gt`, `asc` are already imported in `user/model.ts`. If not,
  add them to the existing `drizzle-orm` import.

- [ ] 3.11 In `apps/api/src/modules/badge/service.ts`:
  - Add import: `import * as userModel from '../user/model.ts';`
  - Replace the direct cursor-batch query with:
    `const userIds = await userModel.listActiveUserIds(lastId, batchSize);`
  - Update downstream code: the new function returns `string[]` directly, so any `.map()`
    that extracted IDs from rows can be simplified or removed.
  - Delete the now-unused imports: `import { db } from '@brewform/db'`,
    `import { users } from '@brewform/db/schema'`,
    `import { and, asc, gt, isNull } from 'drizzle-orm'`.
    (Only delete imports that are truly unused after the change.)

**Section verification:**

- [ ] 3.12 `make check` passes.
- [ ] 3.13 `make lint` passes.
- [ ] 3.14 `make test-api` passes — existing tests cover the affected routes/services.
- [ ] 3.15 Grep gate: `rg "from 'drizzle-orm'" apps/api/src/modules/*/service.ts` returns
  zero matches (services never import drizzle-orm directly).
- [ ] 3.16 Grep gate: `rg "from '@brewform/db'" apps/api/src/modules/*/service.ts` — any
  remaining matches must be justified (some services may legitimately import `db` for
  transactions; verify each).

---

## 4. T4 — D99.8: Cursor keyset sargability

Rewrite the keyset predicate in `buildCursorWhere` from the emulated OR form to a native
Postgres row-value comparison. This is a D03 raw-SQL exception (Drizzle has no first-class
row-value operator). The `sql` template tag renders column references as identifiers and JS
values as bind parameters (verified via Drizzle docs).

- [ ] 4.1 Read `apps/api/src/modules/recipe/model.ts` lines 880-910 to see the current
  `buildCursorWhere` function and the imports at the top of the file. Confirm whether `sql`
  is already imported from `drizzle-orm` (the file uses `or`, `lt`, `gt`, `eq`, `and` — it
  may already import `sql` for other accepted exceptions like the atomic counters).

- [ ] 4.2 Rewrite `buildCursorWhere` (lines ~885-904). Keep the existing cursor validation
  (regex check, Date parse, isNaN guard) unchanged. Replace ONLY the two return statements
  (the ASC and DESC branches):

  ```typescript
  function buildCursorWhere(cursor: { createdAt: string; id: string }, sortOrder: string): SQL {
    const { createdAt, id } = cursor;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(createdAt)) {
      throw new Error('VALIDATION_ERROR: INVALID_CURSOR');
    }
    const createdAtValue = new Date(createdAt);
    if (isNaN(createdAtValue.getTime())) {
      throw new Error('VALIDATION_ERROR: INVALID_CURSOR');
    }
    // D03 raw-SQL exception: row-value comparison for composite index sargability.
    // Drizzle has no first-class row-value operator; sql template is the idiomatic escape hatch.
    // ponytail: upgrade path — if Drizzle adds row-value support, replace with the native operator.
    if (sortOrder === 'asc') {
      return sql`(${recipes.createdAt}, ${recipes.id}) > (${createdAtValue}, ${id})`;
    }
    return sql`(${recipes.createdAt}, ${recipes.id}) < (${createdAtValue}, ${id})`;
  }
  ```

  If `sql` is not already imported, add it to the existing `drizzle-orm` import line.

- [ ] 4.3 After the rewrite, check if `or` is still used elsewhere in `model.ts`:
  `rg "\bor\b" apps/api/src/modules/recipe/model.ts`. If `buildCursorWhere` was the only
  consumer, remove `or` from the drizzle-orm import. Similarly check `lt`, `gt`, `eq` —
  they are likely used elsewhere in the file, so probably stay.

- [ ] 4.4 In `openspec/specs/lint-style/spec.md`, add a new row to the raw-SQL
  accepted-exception registry table (the table in the "Raw SQL is confined to an
  accepted-exception registry" requirement):

  ```
  | Row-value keyset comparison | `recipe/model.ts` `buildCursorWhere` — `(created_at, id) < ($1, $2)` for composite index sargability; Drizzle has no native row-value operator |
  ```

- [ ] 4.5 In `openspec/specs/cursor-pagination/spec.md`, update the code examples in the
  "Cursor-based query with DESC order" and "Cursor-based query with ASC order" requirements.
  Replace the `or(lt(...), and(eq(...), lt(...)))` / `or(gt(...), and(eq(...), gt(...)))`
  WHERE clauses with the row-value form:

  DESC:
  ```typescript
  where: and(
    existingWhere,
    sql`(${recipes.createdAt}, ${recipes.id}) < (${cursor.createdAt}, ${cursor.id})`,
  ),
  ```

  ASC:
  ```typescript
  where: and(
    existingWhere,
    sql`(${recipes.createdAt}, ${recipes.id}) > (${cursor.createdAt}, ${cursor.id})`,
  ),
  ```

  Add a note after each code block: "The row-value comparison is a D03 raw-SQL exception —
  Drizzle has no first-class row-value operator. See the lint-style raw-SQL registry."

**Section verification:**

- [ ] 4.6 `make check-api` passes.
- [ ] 4.7 `make lint` passes.
- [ ] 4.8 `make test-api` passes — cursor pagination tests confirm identical behaviour.
- [ ] 4.9 Grep gate: `` rg "sql`" apps/api/src/modules/recipe/model.ts `` — every match
  corresponds to a registry entry (row-value keyset + any pre-existing accepted exceptions
  like atomic counters).
- [ ] 4.10 (Manual, optional) On a populated database, run:
  ```sql
  EXPLAIN ANALYZE SELECT * FROM recipes
  WHERE (created_at, id) < (NOW(), '00000000-0000-0000-0000-000000000000')
  ORDER BY created_at DESC, id DESC LIMIT 21;
  ```
  Confirm the plan shows an Index Scan (or Index Only Scan) on `recipe_created_at_id_idx`,
  not a Seq Scan. (At ~20 rows the planner may still seq-scan — this is expected and correct;
  the index seek manifests at higher cardinality.)

---

## 5. Wrap-up

- [ ] 5.1 Run full verification: `make check && make lint && make fmt && make test`.
- [ ] 5.2 In `plans/D99-debts.md`, mark D99.4, D99.8, D99.17, and D99.18 as **Resolved**
  with the resolution date and a one-line summary each. Follow the existing file's resolution
  format (see how D99.1, .3, .5 etc. were marked resolved by wave 5).
- [ ] 5.3 In `plans/ROADMAP.md`:
  - Remove the four rows (D99.4, D99.8, D99.17, D99.18) from the "Remaining Debt" table.
  - Update the "All other ledgered debt" line to include D99.4, .8, .17, .18 in the resolved
    list.
  - Remove the D99.4 bullet from "Optional quick wins".
  - Add a History entry: "**Remaining debt clearance** (date): resolved D99.4, .8, .17, .18
    via the `remaining-debt-clearance` OpenSpec change. The D99 ledger is now fully closed."
- [ ] 5.4 In `plans/TECHNICAL_DEBT.md`, add resolution log entries for D99.4, D99.8, D99.17,
  D99.18 following the existing per-item format.
- [ ] 5.5 Archive: `openspec archive remaining-debt-clearance` (after PR merges).
