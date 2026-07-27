# Remaining Debt Clearance (D99.4, D99.8, D99.17, D99.18)

## Why

The wave-5 debt clearance (2026-07-27) resolved D99.1, .3, .5, .6, .7, .9, .10–.16, .19 and
explicitly deferred four items by design. These four remain the only open entries in the D99
ledger (`plans/D99-debts.md`):

- **D99.4 (P3):** `collection/index.ts:120` carries the sole `security: []` in the codebase.
  Every other public route omits the key entirely (auth register at `auth/index.ts:70`, health
  at `health.ts:10`, share at `share.ts:55`). With no global `security` requirement on the
  OpenAPI document (`openapi.ts:51-57` declares `bearerAuth` only under `components`), the
  explicit empty array is functionally identical to omission — a style outlier, not a bug.

- **D99.8 (P4):** `buildCursorWhere` (`recipe/model.ts:885-904`) expresses the keyset predicate
  as `OR(lt(col, val), AND(eq(col, val), lt(id, id)))`. Postgres can use the leading column of
  `recipe_created_at_id_idx` (`schema.ts:173`) but cannot do a true two-column range seek. A
  row-value rewrite — `(created_at, id) < ($1, $2)` — lets the planner seek the composite index
  fully. Drizzle has no first-class row-value comparison; the `sql` template tag is required
  (D03 raw-SQL exception). At ~20 rows the planner correctly seq-scans, so this was deferred to
  scale-time. The rewrite is a few lines and future-proofs the query path.

- **D99.17 (P4):** Two sampled deviations from the 3-layer module convention
  (`index.ts` → `service.ts` → `model.ts`):
  1. `recipe/index.ts:24` imports `model` directly; 7 route-handler call sites bypass the
     service layer (`index.ts:293,386,388,389,390,608,609`).
  2. The `contact` module has no `service.ts` or `model.ts` — the single `index.ts` (97 lines)
     handles Zod validation, rate-limit config, and email sending inline. It has zero DB access,
     so a model/service split would be pure boilerplate.

  Research also surfaced two additional instances of the same deviation class:
  - `follow/service.ts:12-13` imports `db` and `eq` from `drizzle-orm` to query the `users`
    table directly (line 37), bypassing the model layer. `user/model.ts` already exports
    `findById(id)` which returns the needed data.
  - `badge/service.ts:9-11` imports `db`, `users`, and `and/asc/gt/isNull` from `drizzle-orm`
    to cursor-batch user IDs (lines 42-46). No `user/model.ts` function covers this; one needs
    to be added.

- **D99.18 (P4):** Six test files use `*_test.ts` naming while ~150 use `*.test.ts` (96%
  majority). The recipe module has BOTH conventions simultaneously (`index_test.ts` alongside
  `model.test.ts`). Both patterns are picked up by runners, so this is pure consistency debt.
  Wave 5 deferred it to avoid churning the coverage work; that work is now complete.

## What Changes

**T1 — D99.4: Remove lone `security: []` (trivial):**

- Delete `security: [],` from `collection/index.ts:120`. No behavioural change — the OpenAPI
  document has no global `security` requirement, so omission and `[]` are identical. Aligns
  with the codebase convention (all other public routes omit the key).

**T2 — D99.18: Standardize test-file naming to `*.test.ts` (mechanical):**

- `git mv` the 6 `*_test.ts` files to `*.test.ts`. Update any import references. Codify the
  `*.test.ts` convention in AGENTS.md. The existing lint-style spec grep gates use inclusive
  globs (`-g '*.test.ts' -g '*_test.ts'`) that continue to work; a new lint-style requirement
  codifies the single convention going forward.

**T3 — D99.17: Architecture deviations (med/low):**

- **Recipe service threading:** add thin service wrappers in `recipe/service.ts` for the 6
  unique model functions called directly by `index.ts` (one is called twice, 7 sites total);
  update `index.ts` to call `service.*` instead of `model.*`; remove the `model` import if no
  other call sites remain.
- **Contact module:** document as an accepted deviation in AGENTS.md (no DB access → no
  model/service split needed; the module is a controller-only email endpoint).
- **Follow service:** replace the direct `db.select().from(users)` query at
  `follow/service.ts:37` with `userModel.findById(followerId)` (already exported from
  `user/model.ts`). Remove the `db`, `users`, and `eq` imports.
- **Badge service:** add `listActiveUserIds(afterId: string | null, limit: number)` to
  `user/model.ts`; replace the direct `db.select()` cursor batch at `badge/service.ts:42-46`
  with the new model function. Remove the `db`, `users`, and drizzle-orm imports.

**T4 — D99.8: Cursor keyset sargability (low):**

- Rewrite `buildCursorWhere` (`recipe/model.ts:885-904`) to use a row-value comparison via
  Drizzle's `sql` template: `` sql`(${recipes.createdAt}, ${recipes.id}) < (${createdAtValue}, ${id})` ``
  (direction-flipped for ASC). Add a D03 raw-SQL exception comment. Register the exception in
  the lint-style raw-SQL registry. The cursor-pagination spec's code examples are updated to
  reflect the new predicate form.

## Capabilities

### Modified Capabilities

- **cursor-pagination**: T4 changes the keyset predicate from the emulated OR form to a native
  row-value comparison. The DESC and ASC query requirements are updated with the new code
  examples. Behaviour is unchanged — the same rows are returned in the same order; only the
  SQL predicate form changes for index sargability.

- **lint-style**: T4 adds a row-value keyset entry to the raw-SQL accepted-exception registry.
  T2 adds a test-file naming convention requirement (`*.test.ts` only).

## Impact

**Files changed:**

| Area | Change type | Track |
|------|-------------|-------|
| `apps/api/src/modules/collection/index.ts` | edit — delete `security: []` line | T1 |
| 6 test files (`*_test.ts` → `*.test.ts`) | rename | T2 |
| `AGENTS.md` | edit — test naming convention + contact deviation note | T2/T3 |
| `apps/api/src/modules/recipe/service.ts` | edit — add 6 thin wrappers | T3 |
| `apps/api/src/modules/recipe/index.ts` | edit — route through service, drop model import | T3 |
| `apps/api/src/modules/follow/service.ts` | edit — use userModel.findById | T3 |
| `apps/api/src/modules/badge/service.ts` | edit — use userModel.listActiveUserIds | T3 |
| `apps/api/src/modules/user/model.ts` | edit — add listActiveUserIds | T3 |
| `apps/api/src/modules/recipe/model.ts` | edit — row-value buildCursorWhere | T4 |
| `openspec/specs/lint-style/spec.md` | edit — registry row + naming requirement | T2/T4 |
| `openspec/specs/cursor-pagination/spec.md` | edit — row-value code examples | T4 |

**Schema/migration changes:** none. **API behaviour change:** none — all changes are
internal (query predicate form, import routing, file naming, OpenAPI metadata style).

**Risk:** Low across all tracks.

- **T1:** one-line deletion, no behaviour change.
- **T2:** mechanical rename; runners pick up both patterns already.
- **T3:** thin wrappers and import swaps; existing tests cover the affected routes.
- **T4:** predicate rewrite produces identical result sets; verified by existing cursor
  pagination tests. The only risk is a typo in the `sql` template — mitigated by the test
  suite and optional `EXPLAIN ANALYZE` verification.

**Verification:**

- `make check` — type-check all workspaces
- `make lint` — lint all apps and packages
- `make fmt` — format check
- `make test` — full suite (or individually: `make test-api`, `make test-shared`)
- `make test-specific filter=apps/api/src/routes/openapi.coverage.test.ts` — OpenAPI coverage
- Manual (T4, optional): `EXPLAIN ANALYZE` on a populated table to confirm index seek on
  `recipe_created_at_id_idx`
