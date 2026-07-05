## MODIFIED Requirements

### Requirement: Equipment recipe query uses the Drizzle query builder exclusively

The `getRecipesUsingEquipment` function in `apps/api/src/modules/equipment/model.ts` SHALL use the Drizzle query builder exclusively for all subqueries. The raw `sql\`\`` template-tag subquery (`sql\`${recipes.currentVersionId} IN (SELECT re.recipe_version_id FROM recipe_equipment re WHERE re.equipment_id = ${equipmentId})\`` at L120-123) SHALL be replaced with Drizzle's `exists()` correlated subquery.

The `exists` operator SHALL be imported from `drizzle-orm` and added to the existing import on L9 (currently `import { and, asc, count, desc, eq, isNull, like, or, SQL, sql } from 'drizzle-orm';`).

The rewritten data branch SHALL use:

```typescript
exists(
  db.select({ recipeVersionId: recipeEquipment.recipeVersionId })
    .from(recipeEquipment)
    .where(
      and(
        eq(recipeEquipment.equipmentId, equipmentId),
        eq(recipeEquipment.recipeVersionId, recipes.currentVersionId),
      ),
    ),
),
```

This produces `WHERE EXISTS (SELECT recipe_equipment.recipe_version_id FROM recipe_equipment WHERE recipe_equipment.equipment_id = $equipmentId AND recipe_equipment.recipe_version_id = recipe.current_version_id)` — semantically equivalent to the raw `IN (...)` subquery but fully type-safe and refactor-safe.

The `recipeEquipment`, `recipeVersions`, and `recipes` tables are already imported at L1-9 — no new table imports needed.

**Reason:** D03 is the sole raw-SQL violation in the codebase. The "no raw SQL" rule (AGENTS.md) targets hand-written SQL strings with column-name interpolation; the `exists()` rewrite brings the query into the Drizzle query builder's type-safe surface. PostgreSQL optimizes `EXISTS` (correlated, short-circuits per-row) at least as well as `IN` for this query shape.

#### Scenario: getRecipesUsingEquipment returns public recipes linked to the equipment

- **WHEN** `getRecipesUsingEquipment(equipmentId, 1, 10)` is called with the ID of an equipment that is linked (via `recipeEquipment`) to several recipes' current versions, where some of those recipes are `public` and some are `draft`/`private`/`unlisted`
- **THEN** only the `public` recipes appear in `data`, and `total` reflects the count of public recipes

#### Scenario: getRecipesUsingEquipment excludes soft-deleted recipes

- **WHEN** `getRecipesUsingEquipment(equipmentId, 1, 10)` is called and some of the linked public recipes have `deletedAt` set
- **THEN** the soft-deleted recipes do NOT appear in `data` and are NOT counted in `total`

#### Scenario: getRecipesUsingEquipment paginates correctly

- **WHEN** `getRecipesUsingEquipment(equipmentId, 2, 5)` is called with 12 matching public recipes
- **THEN** `data` contains 5 recipes (page 2, offset 5), ordered by `createdAt DESC`, and `total` is 12

#### Scenario: getRecipesUsingEquipment joins the author relation

- **WHEN** `getRecipesUsingEquipment` returns a recipe
- **THEN** each recipe in `data` has an `author` object with `username`, `displayName`, and `avatarUrl` fields

#### Scenario: getRecipesUsingEquipment count branch matches data branch

- **WHEN** `getRecipesUsingEquipment(equipmentId, 1, 10)` is called with any set of linked recipes
- **THEN** `total` equals the number of rows the data branch WOULD return if `limit`/`offset` were removed (the count and data branches use the same filtering logic)

### Requirement: getRecipesUsingEquipment folds duplicated predicates into one shared condition set

The visibility and `deletedAt` predicates (`eq(recipes.visibility, 'public')` and `isNull(recipes.deletedAt)`) currently appear in BOTH the data branch (L118-119) and the count branch (L136-137) as duplicated literals. They SHALL be extracted into a single shared `const recipeConditions = and(eq(recipes.visibility, 'public'), isNull(recipes.deletedAt));` referenced by both branches.

**Reason:** Duplicated predicates drift. If a future change adds a third condition (e.g. `isNotNull(recipes.currentVersionId)`), it must be added in one place, not two. The D03 plan explicitly calls this out: "fold the count branch's duplicated visibility/deletedAt predicates into one shared condition set."

#### Scenario: Shared recipeConditions is referenced by both branches

- **WHEN** the source of `apps/api/src/modules/equipment/model.ts` is inspected at `getRecipesUsingEquipment`
- **THEN** a single `recipeConditions` constant is defined once and referenced in both the `db.query.recipes.findMany` `where` clause and the `db.select().from(recipes).innerJoin(...).where(...)` count query

### Requirement: getRecipesUsingEquipment preserves the response shape

The function SHALL continue to return `{ data: RecipeRow[], total: number }` where each element of `data` is a recipe row with a joined `author` relation (`{ username, displayName, avatarUrl }`). The `total` field SHALL be a number. The response shape SHALL match `EquipmentRecipesResponseSchema` (`packages/shared/src/schemas/responses/equipment.ts`) unchanged.

**Reason:** The `GET /:id/recipes` route (`equipment/index.ts:149`) serializes the return value directly via `c.json({ success: true, ...result })`. Changing the shape would break the route contract and the OpenAPI documentation.

#### Scenario: Response shape unchanged after refactor

- **WHEN** the D03 refactor is applied and `make test-specific filter=apps/api/src/modules/equipment/model.test.ts` is re-run
- **THEN** the `getRecipesUsingEquipment` tests (written against the pre-refactor code) pass unchanged — the return shape, field names, and types are identical

### Requirement: getRecipesUsingEquipment retains the count branch's innerJoin chain

The count branch (L129-139) already uses proper Drizzle `innerJoin` chains (`recipes → recipeVersions → recipeEquipment`). This chain SHALL be preserved; only the duplicated `eq(recipes.visibility, 'public')` and `isNull(recipes.deletedAt)` predicates are replaced with the shared `recipeConditions`. The `sql<number>\`count(distinct ${recipes.id})\`` expression SHALL be retained (Drizzle's `count()` helper does not support `DISTINCT`; the `sql` tag is parameterised and type-annotated — accepted minor usage per design Decision 2).

#### Scenario: Count branch uses innerJoin, not a subquery

- **WHEN** the source of `getRecipesUsingEquipment` is inspected at the count branch
- **THEN** the query uses `db.select({ count: ... }).from(recipes).innerJoin(recipeVersions, ...).innerJoin(recipeEquipment, ...).where(and(eq(recipeEquipment.equipmentId, equipmentId), recipeConditions))` — NOT a subquery

## ADDED Requirements

### Requirement: equipment/model.ts has characterisation test coverage

The file `apps/api/src/modules/equipment/model.test.ts` SHALL exist and SHALL contain `describe` blocks covering every exported function in `apps/api/src/modules/equipment/model.ts`:

- `findById` — active row returned; soft-deleted row returns `null`; non-existent returns `null`.
- `findMany` — paginated results with total count; respects the `where` clause (this is the low-level `findMany(where, page, perPage)` that takes a raw `SQL | undefined`, NOT `findManyWithFilters`); returns `{ items: ...[], total: number }`.
- `search` — LIKE match on name/brand/model (three LIKE clauses, OR'd); excludes soft-deleted; limit 10.
- `create` — inserts a row and returns it with `id`/`createdAt`/`updatedAt` populated.
- `update` — active row updated and returned; **soft-deleted row regression baseline**: the test SHALL assert that `update` on a soft-deleted row currently returns non-null and mutates the row (documenting the unguarded behaviour per design Decision 4 — if a future change adds the `isNull(deletedAt)` guard, this test fails and forces a conscious update).
- `softDelete` — the D19 three-`it` pattern: (1) active row soft-deletes and returns non-null with `deletedAt` set; (2) already-deleted row returns `null`; (3) double-delete does NOT overwrite the original `deletedAt` timestamp (10ms delay + DB reread).
- `findManyWithFilters` — filters by type and search, paginated, excludes soft-deleted. This is the higher-level function taking `{ type?, search?, page, perPage }` — distinct from `findMany`.
- `createDeleteRequest` — inserts a request row with `status: 'pending'` default.
- `getRecipesUsingEquipment` — both list and count branches: (a) returns only `public` recipes; (b) excludes soft-deleted recipes; (c) only recipes whose current version links to the equipment; (d) pagination (page/perPage); (e) `total` matches the data branch count; (f) `author` relation joined with `username`/`displayName`/`avatarUrl`.

**No untested exported function shall remain in `equipment/model.ts`** — all 9 exports listed above SHALL have at least one `it` case. This is the D39 acceptance criterion: "no untested exported function remains in those files."

**Fixture insert shapes:** Use the exact shapes documented in design Appendix A. The `recipeVersions` insert MUST include `preparationNotes: ''` (NOT NULL, no default — the trap column). The `getRecipesUsingEquipment` fixtures require the 3-step circular-FK dance: insert recipe (omit `currentVersionId`) → insert version → update recipe to set `currentVersionId` → insert `recipeEquipment` link.

Tests SHALL follow the `admin/model.test.ts` pattern: `// deno-lint-ignore-file no-explicit-any require-await` header, `import '../../test-setup.ts'`, `jsr:@std/testing/bdd` (`describe`/`it`/`beforeEach`/`afterEach`), `jsr:@std/expect`, real `db` from `@brewform/db`, inline `crypto.randomUUID()` fixtures, hard-delete `afterEach` (child tables first, then parent), `{ sanitizeOps: false, sanitizeResources: false }` on every `describe`.

The `getRecipesUsingEquipment` tests SHALL be written against the pre-refactor (raw-SQL) code and SHALL pass unchanged after the D03 refactor — this is the query-equivalence verification.

#### Scenario: equipment model tests pass against pre-refactor code

- **WHEN** `make test-specific filter=apps/api/src/modules/equipment/model.test.ts` is executed on a checkout WITHOUT the D03 refactor applied
- **THEN** all `describe` blocks pass

#### Scenario: equipment model tests pass unchanged after D03 refactor

- **WHEN** the D03 refactor (exists() rewrite + shared recipeConditions) is applied and `make test-specific filter=apps/api/src/modules/equipment/model.test.ts` is re-executed
- **THEN** all `describe` blocks pass WITHOUT any test file modifications — the query equivalence is verified

#### Scenario: softDelete follows the D19 three-it pattern

- **WHEN** the `describe('softDelete', ...)` block is inspected
- **THEN** it contains three `it` cases: active-soft-deletes, already-deleted-returns-null, double-delete-preserves-original-timestamp

#### Scenario: update regression baseline documents unguarded behaviour

- **WHEN** the `describe('update', ...)` block is inspected
- **THEN** it contains an `it` case that soft-deletes a row via `db.update(equipment).set({ deletedAt: new Date() })`, calls `model.update(id, { name: 'New' })`, asserts the return is non-null, and re-reads the DB row to assert `name === 'New'` — documenting that `update` currently mutates soft-deleted rows. The `it` case SHALL have a docblock explaining this is a regression baseline, not an endorsement.

### Requirement: vendor/model.ts has characterisation test coverage

The file `apps/api/src/modules/vendor/model.test.ts` SHALL exist and SHALL contain `describe` blocks covering every exported function in `apps/api/src/modules/vendor/model.ts`:

- `findById` — active row; soft-deleted returns `null`; non-existent returns `null`.
- `findMany` — paginated with total; excludes soft-deleted.
- `search` — LIKE match on name; excludes soft-deleted.
- `create` — inserts with `createdBy` and returns the row.
- `update` — active row updated; **soft-deleted regression baseline** (same as equipment `update` — documents the unguarded behaviour per design Decision 4).
- `softDelete` — D19 three-`it` pattern.

Tests SHALL follow the `admin/model.test.ts` pattern (same conventions as the equipment model test above).

#### Scenario: vendor model tests pass

- **WHEN** `make test-specific filter=apps/api/src/modules/vendor/model.test.ts` is executed
- **THEN** all `describe` blocks pass

#### Scenario: vendor update regression baseline documents unguarded behaviour

- **WHEN** the `describe('update', ...)` block is inspected
- **THEN** it contains an `it` case that soft-deletes a vendor via `db.update(vendors).set({ deletedAt: new Date() })`, calls `model.update(id, { name: 'New' })`, asserts non-null return, and re-reads to assert `name === 'New'` — with a docblock explaining this is a regression baseline.

### Requirement: D39 Tier 1 acceptance criteria are met

The D39 plan lists four explicit acceptance criteria for Tier 1. This change SHALL satisfy all four:

1. **Tier 1 complete:** equipment model, vendor model, recipe-list components, and RequireAuth all have dedicated test files.
2. **D03 regression net:** D03 can cite `equipment/model.test.ts` as its regression net — the `getRecipesUsingEquipment` tests pass against the pre-refactor (raw-SQL) code AND pass unchanged against the refactored (`exists()`) code.
3. **`make ci` green:** `make check`, `make lint`, `make fmt`, and `make test` all pass with the new test files (no regressions in pre-existing tests).
4. **No duplicate scope with D38:** `sanitize.ts` is NOT touched in this change (it's covered by the archived D38 change). No `sanitize.test.ts` is created here.

**Reason:** These are the explicit acceptance gates from `plans/D39-test-coverage-backfill.md`. A fresh-context implementer must verify all four before marking the change complete.

#### Scenario: D03 cites equipment model test as regression net

- **WHEN** the D03 refactor is applied and `make test-specific filter=apps/api/src/modules/equipment/model.test.ts` is re-run
- **THEN** the `getRecipesUsingEquipment` tests pass unchanged — D03 can cite this file as its regression net per D39 acceptance criterion 2

#### Scenario: No untested exported function remains in equipment/model.ts

- **WHEN** the test file is inspected against the 9 exports of `equipment/model.ts`
- **THEN** every exported function (`findById`, `findMany`, `search`, `create`, `update`, `softDelete`, `findManyWithFilters`, `getRecipesUsingEquipment`, `createDeleteRequest`) has at least one `it` case covering it

#### Scenario: No untested exported function remains in vendor/model.ts

- **WHEN** the test file is inspected against the 6 exports of `vendor/model.ts`
- **THEN** every exported function (`findById`, `findMany`, `search`, `create`, `update`, `softDelete`) has at least one `it` case covering it

#### Scenario: Tests are deterministic

- **WHEN** the test files are inspected
- **THEN** no test relies on seed-data ordering — every DB test creates its own fixtures via inline `crypto.randomUUID()` + `db.insert(...)` in `beforeEach` and hard-deletes them in `afterEach`

#### Scenario: Vendor findMany returns vendors key, not items

- **WHEN** the `describe('findMany', ...)` block in `vendor/model.test.ts` is inspected
- **THEN** the test asserts on `result.vendors` (not `result.items`) — `vendor/model.ts:32` returns `{ vendors: data, total: ... }`, distinct from `equipment/model.ts:30` which returns `{ items: data, total: ... }`