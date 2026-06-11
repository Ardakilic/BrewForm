## Why

The `recipeVersions.rating` column (`packages/db/src/schema.ts:179`) is a bare `integer('rating')` with no database CHECK constraint, allowing any integer value (0, -5, 999) at the DB level. The sibling table `userRecipeRatings.rating` (`schema.ts:523`) already enforces `CHECK ("rating" BETWEEN 1 AND 10)` via migration `0001_wise_forge` — but `recipeVersions.rating` was missed.

The TypeScript type JSDoc on `RecipeVersion.rating` (`packages/shared/src/types/recipe.ts:123`) says `/** 1-5 star rating */` — a stale leftover from an earlier design iteration. All application-layer code uses 1–10:

| Layer | Enforces 1–10? | Location |
|-------|----------------|----------|
| Zod (create/update) | `z.number().min(1).max(10).optional()` | `schemas/recipe.ts:47` |
| Zod (social rating) | `z.number().int().min(1).max(10)` | `schemas/recipe.ts:150-151` |
| StarRating UI | 5 stars x 2 points each | `StarRating.tsx:4` |
| DB `user_recipe_rating` | `CHECK BETWEEN 1 AND 10` | `schema.ts:532` |
| DB `recipe_version` | **no constraint** | `schema.ts:179` |
| Type JSDoc | **says "1-5"** | `types/recipe.ts:123` |

The CHECK constraint closes the gap that Zod validation leaves open: direct DB writes, seeder scripts, batch operations, and future code paths bypassing the API layer.

## What Changes

- **DB constraint**: Add `check('recipe_version_rating_check', sql\`${table.rating} BETWEEN 1 AND 10\`)` to the `recipeVersions` constraints array in `packages/db/src/schema.ts`. No import changes needed — `check` (line 6) and `sql` (line 2) are already imported. Also add inline comment `// 1–10` on the column definition to match `userRecipeRatings.rating`.

- **Type JSDoc**: Fix `packages/shared/src/types/recipe.ts:123` from `/** 1-5 star rating */` to `/** 1–10 rating (displayed as 5 stars with half-star granularity) */`.

- **Integration tests**: Add a `recipe_version rating check` describe block to `packages/db/src/schema-constraints.test.ts` with 7 tests (reject: 0, 11, -1; accept: 1, 5, 10, null) using `db.update()` on the existing `recipeVersion` row from `beforeEach`.

- **Docs cleanup**: Remove the resolved "5.2 Recipe Rating Scale Mismatch" entry from `plans/TECHNICAL_DEBT.md` (lines 197-201).

- **PR description**: Create `pr_description.md` at the project root summarizing the change for coworkers.

## Capabilities

### New Capabilities
- `recipe-rating-constraint`: Enforce `recipeVersions.rating` values within 1–10 at the database level via a CHECK constraint, closing the gap between application-layer Zod validation and the database. Includes integration tests verifying constraint enforcement on both INSERT and UPDATE paths.

### Modified Capabilities
<!-- None — pure data-integrity fix, no spec-level behavior change. -->

## Impact

| Area | File | Change |
|------|------|--------|
| Schema | `packages/db/src/schema.ts:179,191` | Add `// 1–10` inline comment on rating column; add `check(...)` to constraints array |
| Migration | `packages/db/drizzle/0005_*.sql` *(generated)* | `ALTER TABLE "recipe_version" ADD CONSTRAINT "recipe_version_rating_check" CHECK ("rating" BETWEEN 1 AND 10)` |
| Types | `packages/shared/src/types/recipe.ts:123` | JSDoc comment update (documentation only) |
| Tests | `packages/db/src/schema-constraints.test.ts` | New `recipe_version rating check` describe block — 7 test cases |
| Docs | `plans/TECHNICAL_DEBT.md:197-201` | Remove resolved entry |
| PR | `pr_description.md` *(new)* | Change summary for coworkers |

**Risk: Low.** CHECK constraint only blocks future out-of-range writes; existing rows unaffected. All seed data uses 8, 9, or 10 — safely in range. The `userRecipeRatings.rating` CHECK constraint (identical `BETWEEN 1 AND 10`) was applied via `0001_wise_forge` without issues. No API, Zod schema, or frontend changes needed. No data migration required.
