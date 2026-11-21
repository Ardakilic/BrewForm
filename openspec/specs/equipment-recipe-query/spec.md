# equipment-recipe-query Specification

## Purpose

Defines how `getRecipesUsingEquipment` in `apps/api/src/modules/equipment/model.ts` selects the public recipes whose current version uses a piece of equipment: the data branch filters with one correlated `EXISTS` subquery written as a Drizzle `sql` fragment (`equipmentExists`), a registered lint-style raw-SQL exception kept because Drizzle's `exists()` cannot correlate against the aliased relational-query table, and the count branch joins `recipes → recipeVersions → recipeEquipment` and counts with Drizzle's `countDistinct(recipes.id)`. Both branches share one visibility and `deletedAt` condition set, and the response shape is unchanged.

## Requirements
### Requirement: getRecipesUsingEquipment folds duplicated predicates into one shared condition set

The visibility and `deletedAt` predicates of `getRecipesUsingEquipment` SHALL come from one shared `const recipeConditions = listableRecipeCondition(null);`, imported from `apps/api/src/modules/recipe/model.ts` (capability `recipe-visibility`) and referenced by both the data branch and the count branch.

`listableRecipeCondition(null)` is `and(isNull(recipes.deletedAt), eq(recipes.visibility, 'public'))`,
so the result set is unchanged: only non-deleted `public` recipes are listed and counted. `draft`,
`private` and `unlisted` recipes never appear on an equipment page, for any viewer including their
author. The function SHALL NOT compare `recipes.visibility` inline. The `recipe-visibility`
enforcement test (`apps/api/src/modules/recipe/visibility.enforcement.test.ts`) fails if it does.
Before returning, the data rows SHALL pass through `maskUnlistableForkSources(rows)` from
`recipe/model.ts`. It sets `forkedFromId` to `null` when a row's fork source is not public. The
response shape is unchanged.

**Reason:** Duplicated predicates drift. If a future change adds a third condition (e.g. `isNotNull(recipes.currentVersionId)`), it must be added in one place, not two. The D03 plan explicitly calls this out: "fold the count branch's duplicated visibility/deletedAt predicates into one shared condition set." Wave 6 moves the shared set into the recipe module so every discovery surface uses the same "unlisted is never listed" rule (user decision OQ1, 2026-11-19).

#### Scenario: Shared recipeConditions is referenced by both branches

- **WHEN** the source of `apps/api/src/modules/equipment/model.ts` is inspected at `getRecipesUsingEquipment`
- **THEN** a single `recipeConditions = listableRecipeCondition(null)` constant is defined once and referenced in both the `db.query.recipes.findMany` `where` clause and the `db.select().from(recipes).innerJoin(...).where(...)` count query

#### Scenario: Unlisted recipe is not listed on the equipment page

- **WHEN** `getRecipesUsingEquipment(equipmentId, 1, 10)` is called for equipment used by the current version of a public recipe and of an `unlisted` recipe
- **THEN** only the public recipe is in `data`, and `total` is `1`

#### Scenario: Fork source is masked on the equipment page

- **WHEN** a public recipe on the equipment page is a fork of an `unlisted` recipe
- **THEN** its row has `forkedFromId: null`

### Requirement: getRecipesUsingEquipment preserves the response shape

The function SHALL continue to return `{ data: RecipeRow[], total: number }` where each element of `data` is a recipe row with a joined `author` relation (`{ username, displayName, avatarUrl }`). The `total` field SHALL be a number. The response shape SHALL match `EquipmentRecipesResponseSchema` (`packages/shared/src/schemas/responses/equipment.ts`) unchanged.

**Reason:** The `GET /:id/recipes` route (`equipment/index.ts:149`) serializes the return value directly via `c.json({ success: true, ...result })`. Changing the shape would break the route contract and the OpenAPI documentation.

#### Scenario: Response shape unchanged after refactor

- **WHEN** the D03 refactor is applied and `make test-specific filter=apps/api/src/modules/equipment/model.test.ts` is re-run
- **THEN** the `getRecipesUsingEquipment` tests (written against the pre-refactor code) pass unchanged — the return shape, field names, and types are identical

### Requirement: getRecipesUsingEquipment retains the count branch's innerJoin chain

The count branch SHALL keep its Drizzle `innerJoin` chain (`recipes → recipeVersions → recipeEquipment`) filtered by `eq(recipeEquipment.equipmentId, equipmentId)` and the shared `recipeConditions`, and SHALL count with Drizzle's `countDistinct(recipes.id)` helper instead of a raw `` sql<number>`count(distinct …)` `` fragment.

**Reason:** The earlier text kept the raw fragment because "Drizzle's `count()` helper does not support `DISTINCT`". drizzle-orm has shipped `countDistinct()` since 0.29.1 (0.45.4 is installed, and `brew-log/model.ts` already uses it), so the fragment is not an accepted raw-SQL exception (lint-style registry).

#### Scenario: Count branch uses innerJoin, not a subquery

- **WHEN** the source of `getRecipesUsingEquipment` is inspected at the count branch
- **THEN** the query uses `db.select({ count: countDistinct(recipes.id) }).from(recipes).innerJoin(recipeVersions, ...).innerJoin(recipeEquipment, ...).where(and(eq(recipeEquipment.equipmentId, equipmentId), recipeConditions))` — NOT a subquery

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

Tests SHALL follow the `admin/model.test.ts` pattern: no file-level suppression header (a line-level `// biome-ignore lint/<group>/<rule>: <justification>` only where a typed fix is impractical), `import '../../test-setup.ts'` as the first import, `describe`/`it`/`expect`/`beforeEach`/`afterEach` from `vitest`, real `db` from `@brewform/db`, inline `crypto.randomUUID()` fixtures, and hard-delete `afterEach` (child tables first, then parent), with DB isolation provided by the API Vitest config's serial file execution (`fileParallelism: false`).

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

### Requirement: Equipment recipe query keeps its correlated EXISTS as a registered raw-SQL exception

The `getRecipesUsingEquipment` function in `apps/api/src/modules/equipment/model.ts` SHALL select the recipes linked to the equipment through one correlated `EXISTS` subquery written as a Drizzle `sql` fragment (`equipmentExists`) that interpolates only Drizzle tables, columns and the bound `equipmentId`, carries a `// D03 raw-SQL exception:` comment and is the "Correlated `EXISTS`" row of the lint-style raw-SQL registry; every other part of the query SHALL use the Drizzle query builder.

Drizzle's `exists()` combinator cannot be used here: under the relational `db.query.recipes.findMany` API the outer table is aliased (`"recipe" "recipes"`), and an `exists()` subquery correlates `recipes.currentVersionId` against the physical table name, which PostgreSQL rejects with "invalid reference to FROM-clause entry". The `sql` fragment resolves `${recipes.currentVersionId}` against the aliased outer query.

**Reason:** The D03 plan replaced the raw `IN (...)` subquery with `exists()`, but that rewrite failed against the relational-query alias, so Wave 2 kept a documented `sql` `EXISTS` (`plans/TECHNICAL_DEBT.md` §1.3: "resolved with an accepted, documented raw-SQL exception"). This requirement still described the abandoned rewrite; it now matches the code and the registry.

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

