# D21 — Fix Recipe Rating Scale Mismatch

**Severity:** Low  
**Status:** Open  
**Files:** `packages/db/src/schema.ts:255`, `packages/shared/src/types/recipe.ts:136`

---

## Issue Description

The `recipeVersion.rating` column has two inconsistencies:

1. **No DB constraint:** The column is `integer('rating')` with no CHECK constraint, allowing any integer value (0, -5, 999, etc.).
2. **Comment mismatch:** The type comment in `packages/shared/src/types/recipe.ts:136` says `/** 1-5 star rating */`, but the Zod schema (`RecipeRateSchema`) allows 1-10 and the application uses a 1-10 scale.

This creates confusion for developers and risks data inconsistency.

---

## Impact

- **Data integrity:** Nothing prevents `rating: 0`, `rating: -1`, or `rating: 999` from being stored in the database.
- **Developer confusion:** Comment says 1-5, code says 1-10 — which is correct?
- **UI bugs:** If the frontend assumes 1-5 and displays 5 stars, a rating of 8 would overflow.

---

## Root Cause

The rating column was originally designed for a 1-5 scale (per the comment). The Zod schema was later updated to allow 1-10 without updating the comment or adding a DB constraint.

---

## Affected Files

| File | Lines | Description |
|------|-------|-------------|
| `packages/db/src/schema.ts` | ~255 | `recipeVersion.rating` — missing CHECK constraint |
| `packages/shared/src/types/recipe.ts` | ~136 | Comment says "1-5" but should say "1-10" |

---

## Fix Approach

### 1. Add CHECK Constraint via Drizzle

Use Drizzle's `check()` helper on the column to enforce `rating >= 1 AND rating <= 10`.

### 2. Update Type Comment

Change the comment from `/** 1-5 star rating */` to `/** 1–10 star rating */`.

### Drizzle ORM Reference

From Context7 (`/drizzle-team/drizzle-orm-docs`):

```typescript
import { integer, pgTable, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const recipeVersions = pgTable('recipe_version', {
  rating: integer('rating'),
}, (table) => [
  check('rating_check', sql`${table.rating} >= 1 AND ${table.rating} <= 10`),
]);
```

---

## Implementation Steps

1. **Read** `packages/db/src/schema.ts` — locate the `recipeVersion` table and its indexes array (~line 255).
2. **Read** `packages/shared/src/types/recipe.ts` — locate the rating comment (~line 136).
3. **Add** the CHECK constraint to the recipeVersion table's second argument (indexes/constraints array):
   ```typescript
   (table) => [
     // ... existing indexes ...
     check('recipe_version_rating_check', sql`${table.rating} >= 1 AND ${table.rating} <= 10`),
   ],
   ```
4. **Update** the type comment from `/** 1-5 star rating */` to `/** 1–10 star rating */`.
5. **Run** `make db-generate` — Drizzle generates the migration SQL.
6. **Run** `make db-migrate` — applies the constraint.
7. **Run** `make check` — type-check all workspaces.
8. **Run** `make test` — all tests pass.

---

## Testing Strategy

| Test | Expected |
|------|----------|
| Insert rating: 1 | Success |
| Insert rating: 10 | Success |
| Insert rating: 0 | CHECK constraint violation |
| Insert rating: 11 | CHECK constraint violation |
| Insert rating: NULL | Success (column is nullable) |
| Existing data outside 1-10 range | Migration should fail if bad data exists (verify before applying) |

---

## Risk Assessment

**Risk: Low**

- CHECK constraint only affects new writes.
- Verify no existing data violates the constraint before migration.
- Comment fix is documentation-only.
- No API changes required.

---

## Dependencies

- Verify existing rating data is within 1-10 range before running migration. If any rows have ratings outside this range, they must be corrected first.
