## MODIFIED Requirements

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
