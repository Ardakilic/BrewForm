## Context

The `recipeVersions` table (`packages/db/src/schema.ts:144-193`) defines `rating` as a nullable integer with no CHECK constraint:

```typescript
// schema.ts:178-179 (current state — rating has no CHECK)
rating: integer('rating'),
```

Two sibling tables already use the `check()` + `sql` pattern:

```typescript
// schema.ts:213 — recipeTasteNotes
check('recipe_taste_note_intensity_check', sql`${table.intensity} BETWEEN 1 AND 3`)

// schema.ts:532 — userRecipeRatings
check('user_recipe_rating_rating_check', sql`${table.rating} BETWEEN 1 AND 10`)
```

The `userRecipeRatings.rating` column also has an inline comment:
```typescript
// schema.ts:524
rating: integer('rating').notNull(), // 1–10
```

The application layer already validates 1–10:
- `RecipeCreateObjectSchema.rating`: `z.number().min(1).max(10).optional()` at `schemas/recipe.ts:47`
- `RecipeRateSchema.rating`: `z.number().int().min(1).max(10)` at `schemas/recipe.ts:150-151`
- `StarRating.tsx` component: `/** Current rating value 1–10 (5 stars, each star = 2 points, half-star = 1 point) */`

The stale type JSDoc:
```typescript
// types/recipe.ts:123 (current state — WRONG scale)
/** 1-5 star rating */
rating: number | null;
```

All seed data uses ratings 8, 9, or 10 — safely within 1–10.

The existing test file `packages/db/src/schema-constraints.test.ts` has a `beforeEach` that inserts prerequisite rows (user → recipe → recipeVersion → tasteNote) and an `afterEach` that cleans up in reverse dependency order. Existing CHECK constraint tests use `db.insert()` for child tables (`recipeTasteNotes`, `userRecipeRatings`). For `recipeVersions`, we'll use `db.update()` since the row already exists from `beforeEach`.

Docblock convention in `schema-constraints.test.ts`:
```typescript
/**
 * Tests for database-level CHECK constraints on core entity tables.
 * Ensures that CHECK constraints defined in the schema (e.g., intensity ranges,
 * rating ranges) are enforced at the database level, rejecting invalid values
 * and accepting valid ones.
 */
describe('Schema CHECK constraints', ...) => {
```

Inner describe blocks don't have docblocks in the existing code.

## Goals / Non-Goals

**Goals:**
- Add `check('recipe_version_rating_check', sql\`${table.rating} BETWEEN 1 AND 10\`)` to the `recipeVersions` constraints array
- Add `// 1–10` inline comment on the `recipeVersions.rating` column to match `userRecipeRatings.rating`
- Fix the stale JSDoc from `/** 1-5 star rating */` to `/** 1–10 rating (displayed as 5 stars with half-star granularity) */`
- Add 7 integration tests covering reject (0, 11, -1) and accept (1, 5, 10, null) via `db.update()`
- Remove the resolved "5.2 Recipe Rating Scale Mismatch" entry from `plans/TECHNICAL_DEBT.md` (lines 197-201)

**Non-Goals:**
- No Zod schema changes (already correct)
- No `StarRating.tsx` changes (already correct)
- No data migration needed (existing data in range)
- No API route changes
- No changes to `userRecipeRatings.rating` (already has CHECK)

## Decisions

### Decision 1: Use `check()` + `sql` pattern matching existing constraints

The codebase uses Drizzle's `check()` with `sql` template literals for two CHECK constraints. Both `check` (imported from `drizzle-orm/pg-core` at line 6) and `sql` (imported from `drizzle-orm` at line 2) are already available. No import changes needed.

**Exact code to add** (after `schema.ts:191`, before `]`):
```typescript
    check('recipe_version_rating_check', sql`${table.rating} BETWEEN 1 AND 10`),
```

**Exact column comment to add** (schema.ts:179):
```typescript
// Before:
rating: integer('rating'),

// After:
rating: integer('rating'), // 1–10
```

**Alternative considered**: Raw SQL via `sql\`ALTER TABLE ...\``. Rejected — Drizzle's `check()` generates migrations correctly and keeps the schema definition self-contained.

### Decision 2: Use `db.update()` for tests, not `db.insert()`

The `beforeEach` already creates a `recipeVersion` row (id=`recipeVersionId`). Testing via `db.update()` on that row is simpler than inserting new rows which would need unique `versionNumber` values per test. CHECK constraints are enforced identically on INSERT and UPDATE at the PostgreSQL level.

**Exact test code to add** (after `schema-constraints.test.ts:163`, inside the outer describe block, before closing `});`):
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
      // Previous accept test may have set rating to a non-null value.
      // Update back to null; this must succeed since column is nullable.
      await expect(
        db.update(recipeVersions)
          .set({ rating: null })
          .where(eq(recipeVersions.id, recipeVersionId)),
      ).resolves.toBeDefined();
    });
  });
```

**Alternative considered**: Insert new rows per test case with unique versionNumbers. Rejected — adds complexity (unique constraint on `(recipeId, versionNumber)`) without benefit since CHECK operates the same on INSERT and UPDATE.

### Decision 3: Explicit NULL acceptance test

NULL implicitly passes CHECK constraints per SQL standard. Testing explicitly guards against accidental `.notNull()` addition and documents the nullable contract.

### Decision 4: Constraint naming convention

`recipe_version_rating_check` follows the `{table_name}_{column}_check` pattern:
- `recipe_taste_note_intensity_check` (table: `recipe_taste_note`, column: `intensity`)
- `user_recipe_rating_rating_check` (table: `user_recipe_rating`, column: `rating`)

### Decision 5: Docblock and inline comment additions

The `recipeVersions.rating` column gets `// 1–10` inline comment to match `userRecipeRatings.rating:524`. The new test describe block follows existing docblock patterns — each test `it()` block is self-documenting via its name.

No docblock needed on the `recipeVersions` table itself (other tables in schema.ts don't have them — consistent with codebase convention).

## Risks / Trade-offs

- **[Risk] Migration fails if existing rows have out-of-range ratings** → Mitigation: Pre-migration safety query confirms zero violating rows. All seed data is 8–10. Run: `SELECT id FROM recipe_version WHERE rating IS NOT NULL AND (rating < 1 OR rating > 10)`.
- **[Risk] Drizzle Kit `push` won't detect new CHECK constraints** → Mitigation: Use `make db-generate` + `make db-migrate`. Per Drizzle docs (0.26.0 changelog), `push` only detects check constraint renames, not additions.
- **[Risk] Test state leakage** → The `afterEach` deletes the `recipeVersion` row entirely. Accept-test rating changes don't persist across tests. Reject-tests throw before committing — row state unchanged.

## Migration Plan

| Step | Command | What happens |
|------|---------|-------------|
| 1. Pre-check | Run safety query manually | Verify 0 out-of-range rows |
| 2. Generate | `make db-generate` | Drizzle Kit creates `packages/db/drizzle/0005_*.sql` |
| 3. Inspect | Read generated SQL | Confirm it contains `ALTER TABLE "recipe_version" ADD CONSTRAINT "recipe_version_rating_check" CHECK ("rating" BETWEEN 1 AND 10)` |
| 4. Apply | `make db-migrate` | Constraint takes effect |
| 5. Verify | `make check && make test && make lint` | Type-check, tests, lint all pass |

**Expected generated SQL:**
```sql
ALTER TABLE "recipe_version"
  ADD CONSTRAINT "recipe_version_rating_check"
  CHECK ("recipe_version"."rating" BETWEEN 1 AND 10);
```

**Rollback:**
```sql
ALTER TABLE "recipe_version" DROP CONSTRAINT IF EXISTS "recipe_version_rating_check";
```

**Note on `make db-push`**: The AGENTS.md says "Always use `make db-push` to sync schema changes". However, per Drizzle docs, `push` does NOT detect new CHECK constraint additions — only constraint renames. For this change, the correct workflow is `make db-generate` + `make db-migrate`. Existing colleagues use this flow for schema additions (it's how `0001_wise_forge` was created).

## Mocking Strategy

**None.** The CHECK constraint tests run against a real PostgreSQL database (same as existing `schema-constraints.test.ts` tests). The describe block uses `{ sanitizeOps: false, sanitizeResources: false }` to permit real DB access. Environment expects `DATABASE_URL` and `JWT_SECRET` configured — these are set by the test setup and CI.

## Open Questions

<!-- None — all design decisions resolved. -->
