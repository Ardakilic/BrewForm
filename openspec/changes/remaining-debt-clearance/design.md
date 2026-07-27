## Context

Four items remain in the D99 deferred ledger after wave 5. All were explicitly deferred by
design — D99.4 as a style choice, D99.8 as scale-time work, D99.17 as convention drift not
worth the refactor risk during wave 5, and D99.18 to avoid churning the coverage work. With
wave 5 complete and feature work (F09, F05, F11) queued next, this change closes the ledger
so new work starts clean.

## Decision 1 — D99.4: Delete `security: []`, don't add a global security requirement

**Finding:** `openapi.ts:51-57` declares `bearerAuth` under `components.securitySchemes` but
sets no top-level `security` array. With no global requirement, `security: []` on a route is
a no-op. Every other public route omits the key. The lone `security: []` at
`collection/index.ts:120` is the only occurrence in the codebase.

**Decision:** Delete the line. Match the existing omit convention.

**Rejected alternative:** Add a global `security: [{ bearerAuth: [] }]` to the OpenAPI document
and use `security: []` on all public routes. This is the "correct" OpenAPI pattern for an
auth-first API, but it would require auditing every route to ensure public ones are explicitly
opted out — a much larger change for zero runtime benefit. If a global security requirement is
ever added (e.g., for a future API version), `security: []` would be added back to all public
routes at that time.

## Decision 2 — D99.8: Row-value comparison via `sql` template, D03 exception

**Finding:** `buildCursorWhere` (`recipe/model.ts:885-904`) uses the classic emulated row-value
pattern: `OR(lt(col, val), AND(eq(col, val), lt(id, id)))`. This is single-column sargable —
Postgres can range-scan the leading `created_at` column of `recipe_created_at_id_idx`
(`schema.ts:173`, `(created_at DESC, id DESC)`) but must evaluate the OR branch for the
tie-breaking `id` comparison. A native row-value comparison `(created_at, id) < ($1, $2)`
lets the planner do a single composite range seek.

Drizzle ORM has no first-class row-value comparison operator. The `sql` template tag
(`import { sql } from 'drizzle-orm'`) is the idiomatic escape hatch: column references
interpolated in the template render as identifiers, JS values become bind parameters
(verified via Drizzle docs: `` sql`${table.col} = ${value}` `` produces `"col" = $1`).
The existing codebase already uses `sql` for accepted exceptions (health probe, atomic
counters, correlated EXISTS).

**Decision:** Rewrite `buildCursorWhere` to:

```typescript
// D03 raw-SQL exception: row-value comparison for composite index sargability.
// Drizzle has no first-class row-value operator; sql template is the idiomatic escape hatch.
// ponytail: upgrade path — if Drizzle adds row-value support, replace with the native operator.
if (sortOrder === 'asc') {
  return sql`(${recipes.createdAt}, ${recipes.id}) > (${createdAtValue}, ${id})`;
}
return sql`(${recipes.createdAt}, ${recipes.id}) < (${createdAtValue}, ${id})`;
```

Register in the lint-style raw-SQL exception registry. The cursor-pagination spec's DESC and
ASC code examples are updated to show the row-value form.

**Rejected alternative:** Keep the OR emulation. It works correctly and the table has ~20 rows.
But the rewrite is 4 lines, produces identical results, and future-proofs the query path for
when cardinality grows. The D03 exception is documented and greppable. Deferring further has
no benefit — the code change is trivial and the spec update keeps documentation honest.

**Rejected alternative:** Use a raw `db.execute(sql`SELECT ...`)` for the entire query.
Overkill — only the WHERE predicate needs the raw fragment; the rest of the query stays in
Drizzle's relational builder (`db.query.recipes.findMany`).

## Decision 3 — D99.17: Thread recipe through service; document contact; fix follow/badge

**Finding:** Three distinct sub-problems:

1. **Recipe index.ts bypasses service** for 7 call sites (`index.ts:293,386,388,389,390,608,609`).
   The model functions called are: `getVersionsByRecipeId`, `getUserLikeStatus`,
   `getFavouriteCount`, `getRecipeRatingStats`, `getUserRating`, `upsertUserRating`. These are
   read/write operations that should route through the service layer per the 3-layer convention.

2. **Contact module** (`modules/contact/index.ts`, 97 lines) has no `model.ts` or `service.ts`.
   It validates with Zod, sends email via `getTransporter().sendMail()`, and returns a response.
   Zero DB access. Adding a model/service split would create two files with zero meaningful
   content — pure boilerplate.

3. **Follow and badge services import drizzle-orm directly** (same deviation class, discovered
   during research):
   - `follow/service.ts:12-13,37`: queries `users` table with `db.select().from(users).where(eq(...))`
     to get a follower's username for notifications. `user/model.ts` already exports `findById(id)`.
   - `badge/service.ts:9-11,42-46`: queries `users` table with a cursor batch
     (`and(isNull(deletedAt), gt(id, lastId))`) for badge evaluation. No `user/model.ts`
     function covers this.

**Decision:**

1. Add thin service wrappers in `recipe/service.ts` for the 6 unique model functions (one is
   called twice). Update `recipe/index.ts` to call `service.*` instead of `model.*`. Remove
   the `import * as model from './model.ts'` line if no other call sites remain.

2. Document contact as an accepted deviation in AGENTS.md: "The contact module is a
   controller-only email endpoint with no DB access; it intentionally skips the model/service
   split."

3. Replace `follow/service.ts`'s direct query with `userModel.findById(followerId)`. Remove
   the `db`, `users`, and `eq` imports.

4. Add `listActiveUserIds(afterId: string | null, limit: number): Promise<string[]>` to
   `user/model.ts`. Replace `badge/service.ts`'s direct query with the new function. Remove
   the `db`, `users`, and drizzle-orm imports.

**Rejected alternative:** Document ALL deviations as accepted in AGENTS.md (the D99.17 entry
offers this as an option). For contact, documentation is correct — there's genuinely nothing to
split. For recipe/follow/badge, the fixes are small and the convention exists for a reason
(testability, separation of concerns). Documenting known-fixable violations normalizes drift.

## Decision 4 — D99.18: Standardize on `*.test.ts`

**Finding:** 6 files use `*_test.ts`; ~150 use `*.test.ts` (96% majority). The recipe module
has both simultaneously. Both patterns are picked up by test runners. The lint-style spec's
grep gates use inclusive globs that match both.

**Decision:** Rename the 6 outliers to `*.test.ts` via `git mv`. Add a lint-style spec
requirement codifying `*.test.ts` as the sole convention. Update AGENTS.md. The existing grep
gates' `*_test.ts` globs become no-ops (harmless — they match nothing).

**Rejected alternative:** Standardize on `*_test.ts`. It's the Deno convention, but this is a
96% minority in this codebase. Churning 150 files to match 6 is the opposite of lazy.

**Rejected alternative:** Leave both. Works, but the recipe module having both conventions in
the same directory is confusing. The rename is 6 `git mv` commands — cheaper than documenting
why two conventions coexist.

## Risks and unknowns

- **T4 row-value syntax:** The `sql` template renders column references as identifiers and
  JS values as bind parameters (verified via Drizzle docs). The row-value form
  `(col1, col2) < ($1, $2)` is standard Postgres syntax. Risk is low; existing cursor
  pagination tests cover correctness.

- **T3 recipe service wrappers:** The 7 call sites may have subtle context (e.g., the detail
  loader at `index.ts:386-390` calls 4 model functions in sequence). The wrappers must preserve
  the exact call signatures. Risk is low — the functions are simple passthroughs.

- **T2 rename conflicts:** If any in-flight branch references the old filenames, merge conflicts
  will occur. Mitigated by doing the rename in a single atomic commit and noting it in the PR.
