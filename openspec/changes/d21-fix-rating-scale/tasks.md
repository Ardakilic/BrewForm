## 1. Schema and Type Fixes

### 1.1 Add inline comment on `recipeVersions.rating` column

**File**: `packages/db/src/schema.ts:179`

Replace:
```typescript
    rating: integer('rating'),
```
With:
```typescript
    rating: integer('rating'), // 1–10
```

### 1.2 Add CHECK constraint to `recipeVersions` table

**File**: `packages/db/src/schema.ts` — inside the constraints array (after line 191 `index('recipe_version_created_at_idx'...)`, before the closing `],` at line 192)

Current constraints array (lines 183-192):
```typescript
  (table) => [
    unique('recipe_version_recipe_id_version_number_unique').on(
      table.recipeId,
      table.versionNumber,
    ),
    index('recipe_version_recipe_id_idx').on(table.recipeId),
    index('recipe_version_brew_method_idx').on(table.brewMethod),
    index('recipe_version_drink_type_idx').on(table.drinkType),
    index('recipe_version_created_at_idx').on(table.createdAt),
  ],
```

Add one line so it becomes:
```typescript
  (table) => [
    unique('recipe_version_recipe_id_version_number_unique').on(
      table.recipeId,
      table.versionNumber,
    ),
    index('recipe_version_recipe_id_idx').on(table.recipeId),
    index('recipe_version_brew_method_idx').on(table.brewMethod),
    index('recipe_version_drink_type_idx').on(table.drinkType),
    index('recipe_version_created_at_idx').on(table.createdAt),
    check('recipe_version_rating_check', sql`${table.rating} BETWEEN 1 AND 10`),
  ],
```

No import changes needed — `check` (line 6) and `sql` (line 2) are already imported.

**Verification**: `make check` passes (type-check confirms `check()` is available and `table.rating` is the correct column reference).

- [x] 1.1 Add `// 1–10` inline comment on `recipeVersions.rating` at `schema.ts:179`
- [x] 1.2 Add `check('recipe_version_rating_check', sql\`${table.rating} BETWEEN 1 AND 10\`)` to `recipeVersions` constraints array at `schema.ts:191`

---

### 1.3 Fix JSDoc comment on `RecipeVersion.rating`

**File**: `packages/shared/src/types/recipe.ts:123`

Replace:
```typescript
  /** 1-5 star rating */
  rating: number | null;
```
With:
```typescript
  /** 1–10 rating (displayed as 5 stars with half-star granularity) */
  rating: number | null;
```

**Verification**: Grep for `1-5 star rating` returns zero results outside of plans/ files.

- [x] 1.3 Update JSDoc comment at `types/recipe.ts:123`

---

## 2. Integration Tests

### 2.1 Add `recipe_version rating check` describe block

**File**: `packages/db/src/schema-constraints.test.ts`

**Location**: After the closing `});` of the `user_recipe_rating rating check` describe block (line 163), and before the closing `});` of the outer `Schema CHECK constraints` describe block (line 164). In other words, as a new sibling describe block inside the outer describe.

Insert the following code at line 164 (after `});` of user_recipe_rating block, before `});` closing the outer describe):

```typescript
  describe('recipe_version rating check', () => {
    it('should reject rating = 0', async () => {
      await expect(
        db.update(recipeVersions)
          .set({ rating: 0 })
          .where(eq(recipeVersions.id, recipeVersionId)),
      ).rejects.toThrow();
    });

    it('should reject rating = 11', async () => {
      await expect(
        db.update(recipeVersions)
          .set({ rating: 11 })
          .where(eq(recipeVersions.id, recipeVersionId)),
      ).rejects.toThrow();
    });

    it('should reject rating = -1', async () => {
      await expect(
        db.update(recipeVersions)
          .set({ rating: -1 })
          .where(eq(recipeVersions.id, recipeVersionId)),
      ).rejects.toThrow();
    });

    it('should accept rating = 1', async () => {
      await expect(
        db.update(recipeVersions)
          .set({ rating: 1 })
          .where(eq(recipeVersions.id, recipeVersionId)),
      ).resolves.toBeDefined();
    });

    it('should accept rating = 5', async () => {
      await expect(
        db.update(recipeVersions)
          .set({ rating: 5 })
          .where(eq(recipeVersions.id, recipeVersionId)),
      ).resolves.toBeDefined();
    });

    it('should accept rating = 10', async () => {
      await expect(
        db.update(recipeVersions)
          .set({ rating: 10 })
          .where(eq(recipeVersions.id, recipeVersionId)),
      ).resolves.toBeDefined();
    });

    it('should accept rating = NULL', async () => {
      await expect(
        db.update(recipeVersions)
          .set({ rating: null })
          .where(eq(recipeVersions.id, recipeVersionId)),
      ).resolves.toBeDefined();
    });
  });
```

**How the tests work**: The outer `beforeEach` inserts a `recipeVersion` with `rating: undefined` (null). Each test attempts to `UPDATE` that row's rating. Reject tests (`0`, `11`, `-1`) throw a PostgreSQL CHECK constraint violation — Drizzle propagates it as a thrown Error. Accept tests (`1`, `5`, `10`, `null`) succeed. Since `afterEach` deletes the `recipeVersion` row entirely, test state doesn't leak between cases.

**Verification**: After migration is applied (section 3), running `make test` includes these 7 new tests and they all pass.

- [x] 2.1 Insert the `recipe_version rating check` describe block with 7 tests at `schema-constraints.test.ts:164`

---

## 3. Database Migration

### 3.1 Pre-migration safety query

Run against the database to confirm no existing rows violate the new constraint:

```sql
SELECT id, recipe_id, version_number, rating
FROM recipe_version
WHERE rating IS NOT NULL
  AND (rating < 1 OR rating > 10);
```

**Expected**: Zero rows returned. All seed data uses ratings 8, 9, or 10.
**If rows returned**: Correct the out-of-range values before proceeding. Run `make db-seed` to re-seed if needed.

- [x] 3.1 Run pre-migration safety query — confirm zero out-of-range rows

### 3.2 Generate migration

```bash
make db-generate
```

This creates a new migration file at `packages/db/drizzle/0005_*.sql`. Drizzle Kit compares the TypeScript schema definition with the current database state and generates the ALTER TABLE statement.

**Note**: Do NOT use `make db-push` for this change. Per Drizzle Kit 0.26.0 changelog, `push` does not detect new CHECK constraint additions — only `generate` + `migrate` works correctly for this.

- [x] 3.2 Run `make db-generate` to create migration

### 3.3 Inspect generated migration

Open the generated file at `packages/db/drizzle/0005_*.sql`. It MUST contain exactly:

```sql
ALTER TABLE "recipe_version"
  ADD CONSTRAINT "recipe_version_rating_check"
  CHECK ("recipe_version"."rating" BETWEEN 1 AND 10);
```

The constraint name and CHECK expression must match exactly. Table/column name casing may vary (Drizzle sometimes uses quoted identifiers).

- [x] 3.3 Inspect generated SQL — confirm it matches expected ALTER TABLE pattern

### 3.4 Apply migration

```bash
make db-migrate
```

This applies the pending migration to the database. The constraint takes effect immediately.

- [x] 3.4 Run `make db-migrate` to apply the constraint

---

## 4. Documentation and Cleanup

### 4.1 Remove resolved entry from TECHNICAL_DEBT.md

**File**: `plans/TECHNICAL_DEBT.md`

Remove the following 5 lines (lines 197-201):

```markdown
### 5.2 Recipe Rating Scale Mismatch
- **Files**: `packages/db/src/schema.ts:255`, `packages/shared/src/types/recipe.ts:136`
- **Issue**: `RecipeVersion.rating` has no CHECK constraint and the type comment says "1-5 star rating", but Zod schemas allow 1-10 and `userRecipeRatings.rating` CHECK enforces 1-10. The type comment is misleading.
- **Fix**: Add CHECK constraint for consistency; update type comment.
- **Severity**: Misleading documentation; potential data inconsistency.
- **PRD**: [`plans/D21-fix-rating-scale.md`](plans/D21-fix-rating-scale.md)
```

After removal, section 5.1 should flow directly into section 5.3 with no gap or renumbering needed (the remaining sections keep their original numbers: 5.1, 5.3, 5.4, etc.).

**Verification**: Grep for `5.2 Recipe Rating Scale` returns zero results.

- [x] 4.1 Remove "5.2 Recipe Rating Scale Mismatch" entry (5 lines) from `plans/TECHNICAL_DEBT.md`

### 4.2 Create PR description

**File**: `pr_description.md` (project root — create from scratch, overwriting the existing unrelated PR description)

````markdown
# Add CHECK constraint to `recipe_version.rating`

## Summary

Adds a database-level `CHECK ("rating" BETWEEN 1 AND 10)` constraint to
`recipe_version.rating`, matching the existing constraint already on
`user_recipe_rating.rating`. Fixes a stale type JSDoc comment that said
"1-5 star rating" instead of the correct "1–10". No API, Zod schema, or
frontend changes — the application layer already enforces 1–10 everywhere.

## Changes

- **`packages/db/src/schema.ts`** — Added `// 1–10` inline comment on
  `recipeVersions.rating` column (line 179) and `check('recipe_version_rating_check',
  sql\`${table.rating} BETWEEN 1 AND 10\`)` to the constraints array (line 191).
  Mirrors the existing pattern at `recipeTasteNotes.intensity` (line 213) and
  `userRecipeRatings.rating` (line 532). No import changes.

- **`packages/shared/src/types/recipe.ts`** — Updated JSDoc on
  `RecipeVersion.rating` from `/** 1-5 star rating */` to
  `/** 1–10 rating (displayed as 5 stars with half-star granularity) */`.
  Matches the `StarRating.tsx` component documentation.

- **`packages/db/src/schema-constraints.test.ts`** — Added 7 new tests under
  `recipe_version rating check` describe block, testing reject (0, 11, -1)
  and accept (1, 5, 10, null) via `db.update()` on the existing row from
  `beforeEach`.

- **`plans/TECHNICAL_DEBT.md`** — Removed resolved "5.2 Recipe Rating Scale
  Mismatch" entry.

## Migration

```bash
# Pre-check: verify no out-of-range ratings exist
# SELECT id FROM recipe_version WHERE rating IS NOT NULL AND (rating < 1 OR rating > 10);

make db-generate && make db-migrate
```

Generated migration:
```sql
ALTER TABLE "recipe_version"
  ADD CONSTRAINT "recipe_version_rating_check"
  CHECK ("recipe_version"."rating" BETWEEN 1 AND 10);
```

## Verification

```bash
make check   # TypeScript — zero errors
make test    # All tests pass including 7 new CHECK constraint tests
make lint    # Zero lint errors
```

## Risk

**Low.** CHECK constraint only blocks future out-of-range writes; existing rows
are unaffected. All seed data uses ratings 8, 9, or 10 — safely in range.
The identical `BETWEEN 1 AND 10` pattern was already applied to
`user_recipe_rating.rating` via migration `0001_wise_forge` without issues.

## Breaking

**None.** No API surface, response shape, or business logic changes. If any
existing `recipe_version` rows have out-of-range ratings (verified: none do),
they would remain but future writes to those rows' `rating` column would
require values within 1–10.
````

- [x] 4.2 Create `pr_description.md` at project root

---

## 5. Verification

### 5.1 Type-check

```bash
make check
```

**Expected**: Zero TypeScript errors across all workspaces (api, web, shared, db).

- [x] 5.1 Run `make check` — zero errors

### 5.2 Run all tests

```bash
make test
```

**Expected**: All existing tests pass, plus 7 new CHECK constraint tests in `schema-constraints.test.ts` pass. The `recipe_version rating check` describe block tests should appear in the output.

If tests fail with CHECK constraint violations before the migration is applied: run `make db-migrate` first (task 3.4), then re-run tests.

- [x] 5.2 Run `make test` — all tests pass

### 5.3 Lint

```bash
make lint
```

**Expected**: Zero lint errors across all files.

- [x] 5.3 Run `make lint` — zero errors

---

## Summary of Files Changed

| # | File | Change | Lines |
|---|------|--------|-------|
| 1 | `packages/db/src/schema.ts` | Add `// 1–10` comment + `check(...)` entry | 179, 191 |
| 2 | `packages/shared/src/types/recipe.ts` | Fix JSDoc comment | 123-124 |
| 3 | `packages/db/src/schema-constraints.test.ts` | Add 7-test describe block | after 163 |
| 4 | `packages/db/drizzle/0005_*.sql` | Generated migration (auto) | new file |
| 5 | `plans/TECHNICAL_DEBT.md` | Remove 5.2 entry | 197-201 |
| 6 | `pr_description.md` | New PR description | new file |
