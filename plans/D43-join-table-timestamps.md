# D43 — Add `createdAt` to Remaining Join Tables

**Severity:** Low
**Status:** Open (2026-07-04)
**Relationship:** Completes `TECHNICAL_DEBT.md` §5.5. **Scope correction (verified 2026-07-04):** §5.5 originally listed seven join tables; four of them — `user_follow`, `user_recipe_like`, `user_recipe_favourite`, `user_recipe_rating` — **already have** `createdAt` (added alongside the D23 composite-index work, with supporting indexes, e.g. `schema.ts` `user_follow_created_at_idx`). Only three remain.

---

## Problem

Three recipe-relation join tables in `packages/db/src/schema.ts` still have no `createdAt` column:

| Table | Definition |
|-------|------------|
| `recipe_taste_note` | `packages/db/src/schema.ts:241` (`recipeTasteNotes`) |
| `recipe_equipment` | `packages/db/src/schema.ts:263` (`recipeEquipment`) |
| `recipe_version_photo` | `packages/db/src/schema.ts:330` (`recipeVersionPhotos`) |

Consequences:

- **No audit trail** for when a taste note, equipment link, or photo was attached to a recipe version — moderation and debugging (e.g. "when did this photo appear on this version?") cannot be answered from the DB.
- **Inconsistency**: the social join tables all carry `createdAt` now; these three are the outliers.
- **Blocks future features** cheaply enabled by insertion timestamps (attachment history in version diffs — see F09/F24 — without schema churn later, when backfill becomes lossy).

`updatedAt` is intentionally out of scope: rows in these tables are insert/delete only (relations are replaced, not mutated), so `createdAt` alone is sufficient.

---

## Proposed Fix

1. **Schema change** in `packages/db/src/schema.ts`: add to each of the three tables, matching the existing house style used by `userRecipeLikes`:
   ```typescript
   createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
   ```
   Add a docblock line noting the column exists for audit purposes.
2. **Generate the migration** with Drizzle Kit (project workflow, drizzle-kit 0.31):
   ```bash
   cd packages/db && deno task generate
   ```
   This produces the next migration under `packages/db/drizzle/` (currently up to `0007_moaning_hellfire_club.sql`). Expected SQL per table:
   ```sql
   ALTER TABLE "recipe_taste_note" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;
   ```
   `DEFAULT now() NOT NULL` backfills existing rows with the migration time — acceptable (we cannot recover true attachment times) and documented in the migration.
3. **Apply locally**: `deno task migrate` (packages/db) against the dev database; verify with `deno task studio` or psql that columns exist and existing rows are backfilled.
4. **Indexes**: do *not* add `created_at` indexes preemptively — no current query sorts these tables by insertion time. Note this in the schema docblock; add indexes with the first consuming query (D23 precedent: index with the query pattern).
5. **Types ripple**: `$inferSelect` consumers of these tables (recipe model relation rows, response schemas in `packages/shared/src/schemas/responses/recipe.ts` if they enumerate join fields) — verify `deno check` and the OpenAPI coverage test still pass; only extend response schemas if the API should actually expose the new field (default: not exposed yet).
6. Run `make ci`.

---

## Files to Change

| File | Change |
|------|--------|
| `packages/db/src/schema.ts` | Add `createdAt` to `recipeTasteNotes` (:241), `recipeEquipment` (:263), `recipeVersionPhotos` (:330) |
| `packages/db/drizzle/0008_*.sql` (+ `meta/`) | **Generated** migration — commit as generated, review by hand |
| `packages/shared/src/schemas/responses/recipe.ts` | Only if exposing the field (default: no change) |

---

## Test Plan

- Migration test: run `deno task migrate` against a fresh DB **and** against a DB seeded with existing recipe relations — both succeed; pre-existing rows have non-null `createdAt`.
- Schema assertion: extend an existing DB/schema test (or add one) asserting the three Drizzle table objects include a `createdAt` column with `notNull` + default.
- Insert path: creating a recipe with taste notes/equipment/photos (existing `createRecipeWithRelations` model test path from D29) yields join rows with `createdAt` populated — extend the relevant recipe model test with the assertion.
- `make ci` green (includes API tests exercising the recipe relation queries — proves no select breaks).

---

## Acceptance Criteria

- [ ] All seven §5.5 join tables now carry `createdAt` (three added here; four pre-existing).
- [ ] Migration `0008_*` committed, idempotent under drizzle-kit's journal, and backfills existing rows via `DEFAULT now()`.
- [ ] No API response shape change unless deliberately made (and then schema + OpenAPI updated together).
- [ ] `make ci` passes.

---

## Effort Estimate

**Low** — ~2 hours including migration generation, local apply, and test assertions.
