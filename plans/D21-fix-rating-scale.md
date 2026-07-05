# D21 — Fix Recipe Rating Scale Mismatch

> **Status (2026-07-04): ✅ Done** — `recipe_version_rating_check` CHECK constraint at `schema.ts:237`; “1–10” comment in `types/recipe.ts:123`.

**Severity:** Low  
**Status:** Implemented  
**Files:**
- `packages/db/src/schema.ts:179` — `recipeVersions.rating` column, no CHECK constraint
- `packages/shared/src/types/recipe.ts:123` — JSDoc comment says "1-5" instead of "1–10"

---

## Issue Description

The `recipeVersions.rating` column has two inconsistencies:

1. **No DB constraint:** The column is `integer('rating')` with no CHECK constraint, allowing any integer value (`0`, `-5`, `999`, etc.).
2. **Comment mismatch:** The JSDoc on `RecipeVersion.rating` in `packages/shared/src/types/recipe.ts` says `/** 1-5 star rating */`, but both Zod schemas and the UI use a 1–10 scale.

This is especially inconsistent because the parallel `userRecipeRatings.rating` column **already has** a `BETWEEN 1 AND 10` CHECK constraint (added in migration `0001_wise_forge`). The `recipeVersions.rating` constraint was simply never added alongside it.

---

## Impact

- **Data integrity:** Nothing prevents `rating: 0`, `rating: -1`, or `rating: 999` from being stored in the `recipe_version` table.
- **Developer confusion:** The type comment says "1-5" but all application-layer code (Zod schema, `StarRating.tsx` UI component) uses 1–10.
- **Asymmetry with sibling table:** `user_recipe_rating.rating` is already constrained to `BETWEEN 1 AND 10`; `recipe_version.rating` is not.

> **Note:** There is no UI overflow bug. `StarRating.tsx` explicitly models the 1–10 scale as 5 stars × 2 points each (half-star = 1 point), correctly rendering any value in range.

---

## Root Cause

Migration `0000_opposite_switch` created both `recipe_version.rating` and `user_recipe_rating.rating` as unconstrained integers. Migration `0001_wise_forge` then added CHECK constraints for `recipe_taste_note.intensity` and `user_recipe_rating.rating`, but missed `recipe_version.rating`. The type comment `/** 1-5 star rating */` is a stale leftover from an earlier design iteration — all application code has used 1–10 throughout.

---

## Affected Files

| File | Lines | Description |
|------|-------|-------------|
| `packages/db/src/schema.ts` | 179, 183–192 | `recipeVersions.rating` column (line 179); constraints array (lines 183–192) — missing CHECK |
| `packages/shared/src/types/recipe.ts` | 123–124 | `/** 1-5 star rating */` comment (line 123) above `rating: number \| null` (line 124) |

---

## Fix Approach

### 1. Add CHECK Constraint via Drizzle

Add a `check()` entry to the `recipeVersions` table's existing constraints array (lines 183–192 of `packages/db/src/schema.ts`). Both `check` (line 6) and `sql` (line 2) are **already imported** — no import changes needed.

Use `BETWEEN 1 AND 10` to match the existing pattern in the codebase:

```typescript
// packages/db/src/schema.ts  (lines 183–192 before the fix)
(table) => [
  unique('recipe_version_recipe_id_version_number_unique').on(
    table.recipeId,
    table.versionNumber,
  ),
  index('recipe_version_recipe_id_idx').on(table.recipeId),
  index('recipe_version_brew_method_idx').on(table.brewMethod),
  index('recipe_version_drink_type_idx').on(table.drinkType),
  index('recipe_version_created_at_idx').on(table.createdAt),
  // ADD THIS LINE:
  check('recipe_version_rating_check', sql`${table.rating} BETWEEN 1 AND 10`),
],
```

**Existing precedents in the same file:**
```typescript
// recipe_taste_note table (line ~212)
check('recipe_taste_note_intensity_check', sql`${table.intensity} BETWEEN 1 AND 3`)

// user_recipe_rating table (line ~532)
check('user_recipe_rating_rating_check', sql`${table.rating} BETWEEN 1 AND 10`)
```

### 2. Update Type Comment

In `packages/shared/src/types/recipe.ts`, line 123:

```typescript
// Before (line 123):
/** 1-5 star rating */
rating: number | null;

// After:
/** 1–10 rating (displayed as 5 stars with half-star granularity) */
rating: number | null;
```

---

## Zod Schema Context

Two Zod schemas enforce the 1–10 bound at the application layer, both in `packages/shared/src/schemas/recipe.ts`:

| Schema | Line | Field | Used for |
|--------|------|-------|----------|
| `RecipeCreateObjectSchema` | 47 | `rating: z.number().min(1).max(10).optional()` | Personal brew rating on `recipe_version` (CREATE/UPDATE) |
| `RecipeRateSchema` | 150 | `rating: z.number().int().min(1).max(10)` | Social community rating on `user_recipe_rating` (`POST /:id/rate`) |

The DB CHECK constraint closes the gap that application-layer validation leaves open (direct DB writes, seeding, future batch operations).

---

## Implementation Steps

1. **Read** `packages/db/src/schema.ts` lines 145–193 — confirm `recipeVersions` table layout and verify no `check()` entry exists for `rating` yet.
2. **Read** `packages/shared/src/types/recipe.ts` lines 120–128 — confirm the stale `/** 1-5 star rating */` comment at line 123.
3. **Verify** existing data: before applying the migration, confirm no rows in `recipe_version` have `rating` outside 1–10 (see pre-migration query below).
4. **Edit** `packages/db/src/schema.ts` — append `check('recipe_version_rating_check', sql\`${table.rating} BETWEEN 1 AND 10\`)` to the `recipeVersions` constraints array (after line 191, before the closing `]`).
5. **Edit** `packages/shared/src/types/recipe.ts` — update line 123 comment from `/** 1-5 star rating */` to `/** 1–10 rating (displayed as 5 stars with half-star granularity) */`.
6. **Run** `make db-generate` — Drizzle generates the migration SQL (should produce an `ALTER TABLE "recipe_version" ADD CONSTRAINT "recipe_version_rating_check" CHECK ...` statement).
7. **Inspect** the generated SQL to confirm it matches the expected `ALTER TABLE "recipe_version" ADD CONSTRAINT "recipe_version_rating_check" CHECK ("recipe_version"."rating" BETWEEN 1 AND 10)` pattern.
8. **Run** `make db-migrate` — applies the constraint to the database.
9. **Run** `make check` — type-check all workspaces.
10. **Run** `make test` — all tests pass.

### Pre-migration Safety Query

Run this before step 6 to confirm no existing rows would violate the new constraint:

```sql
SELECT id, recipe_id, version_number, rating
FROM recipe_version
WHERE rating IS NOT NULL
  AND (rating < 1 OR rating > 10);
```

Expected result: zero rows. If any rows are returned, correct them before applying the migration.

---

## Expected Generated Migration SQL

```sql
ALTER TABLE "recipe_version"
  ADD CONSTRAINT "recipe_version_rating_check"
  CHECK ("recipe_version"."rating" BETWEEN 1 AND 10);
```

---

## Testing Strategy

| Test | Expected |
|------|----------|
| Insert `rating: 1` | ✅ Success |
| Insert `rating: 10` | ✅ Success |
| Insert `rating: 5` | ✅ Success (mid-range) |
| Insert `rating: NULL` | ✅ Success (column is nullable) |
| Insert `rating: 0` | ❌ CHECK constraint violation |
| Insert `rating: 11` | ❌ CHECK constraint violation |
| Insert `rating: -1` | ❌ CHECK constraint violation |
| Existing seed data (ratings 8–10) | ✅ All within range — migration safe |

---

## Risk Assessment

**Risk: Low**

- CHECK constraint only blocks future out-of-range writes; it does not affect existing valid rows.
- All seed data uses ratings 8, 9, or 10 — safely within the 1–10 bound.
- Migration `0001_wise_forge` already applied the identical `BETWEEN 1 AND 10` pattern to `user_recipe_rating.rating` without issues.
- The type comment fix is documentation-only.
- No API, Zod schema, or frontend changes required.

---

## Dependencies

- Verify no existing `recipe_version` rows have out-of-range ratings before running the migration (pre-migration query above).