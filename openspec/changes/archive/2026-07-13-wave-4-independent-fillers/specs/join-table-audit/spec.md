## ADDED Requirements

### Requirement: All recipe join tables carry a createdAt audit timestamp

The following three join tables in `packages/db/src/schema.ts` SHALL include a `createdAt` column
matching the established house style (used by `userFollows`, `userRecipeFavourites`,
`userRecipeLikes`, `userRecipeRatings`):

| Table (TS name) | SQL name | Schema line (as of 2026-07-06) |
|---|---|---|
| `recipeTasteNotes` | `recipe_taste_note` | `schema.ts:241` |
| `recipeEquipment` | `recipe_equipment` | `schema.ts:263` |
| `recipeVersionPhotos` | `recipe_version_photo` | `schema.ts:330` |

The column definition SHALL be exactly:
```typescript
createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
```

Each table SHALL have a docblock line noting the `createdAt` column exists for audit purposes
(when a taste note, equipment link, or photo was attached to a recipe version). The `timestamp`
builder is already imported (`schema.ts:16`) — no new imports needed.

`updatedAt` SHALL NOT be added. Rows in these tables are insert/delete-only (relations are
replaced, not mutated), so `updatedAt` would always equal `createdAt` and adds no audit value.

**Reason:** The four social join tables (`user_follow`, `user_recipe_like`, `user_recipe_favourite`,
`user_recipe_rating`) already carry `createdAt` (added with the D23 composite-index work). These
three recipe-relation tables are the outliers — no audit trail for when a taste note, equipment
link, or photo was attached. This blocks future features (attachment history in version diffs —
F09/F24) and creates inconsistency.

#### Scenario: Three join tables have createdAt

- **WHEN** `packages/db/src/schema.ts` is inspected for `recipeTasteNotes`, `recipeEquipment`,
  `recipeVersionPhotos`
- **THEN** each table object includes a `createdAt` column with `timestamp('created_at', {
  withTimezone: true }).notNull().defaultNow()`

#### Scenario: createdAt pattern matches the established house style

- **WHEN** the `createdAt` column definition on the three new tables is compared against
  `userRecipeLikes.createdAt` (`schema.ts:646`)
- **THEN** the definitions are identical (same builder, same options, same `notNull` +
  `defaultNow()`)

#### Scenario: No updatedAt column on the three tables

- **WHEN** the three table definitions are inspected
- **THEN** no `updatedAt` column is present — only `createdAt`

### Requirement: Migration 0008 adds createdAt with DEFAULT now() backfill

A new migration `packages/db/drizzle/0008_<codename>.sql` SHALL be generated via `make db-generate`
(Drizzle Kit 0.31 against `packages/db/drizzle.config.ts`). The migration SHALL contain exactly
three `ALTER TABLE` statements (one per table):

```sql
ALTER TABLE "recipe_taste_note" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_equipment" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_version_photo" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;
```

The `DEFAULT now() NOT NULL` backfills existing rows with the migration time — acceptable because
true attachment times are unrecoverable and documented in the migration.

The migration file SHALL NOT be manually edited (per AGENTS.md: "Never manually edit the generated
SQL migration files — Drizzle's hash-based migration tracking depends on them being unmodified").
The `meta/_journal.json` SHALL be extended with a new idx-8 entry automatically by Drizzle Kit.

The migration SHALL be applied via `make db-migrate` against the dev database. Pre-existing rows
SHALL have non-null `createdAt` after migration.

**Reason:** Drizzle Kit generates the migration from the schema diff. The `DEFAULT now()` backfill
is the standard approach for adding a `NOT NULL` column to a non-empty table.

#### Scenario: Migration 0008 exists and is unmodified

- **WHEN** `ls packages/db/drizzle/0008_*.sql` is run
- **THEN** the file exists with exactly three `ALTER TABLE ... ADD COLUMN` statements (no
  `CREATE INDEX`, no other DDL)

#### Scenario: Migration applies cleanly to a seeded database

- **WHEN** `make db-migrate` is run against a database with existing recipe relations
- **THEN** the migration succeeds, and pre-existing rows in all three tables have non-null
  `createdAt` values (set to the migration time)

#### Scenario: Migration applies cleanly to a fresh database

- **WHEN** `make db-migrate` is run against a fresh (empty) database
- **THEN** the migration succeeds with no errors

### Requirement: No indexes added preemptively

No `created_at` index SHALL be added to the three tables. No `created_at` composite index SHALL be
added. The schema docblock SHALL note that indexes will be added with the first consuming query
(per the `db-indexes` spec precedent: index with the query pattern, not preemptively).

**Reason:** No current query sorts these tables by insertion time. Adding an unused index wastes
write overhead on every insert. The D23 precedent established that indexes are tied to specific
query patterns with `file:line` documentation.

#### Scenario: No created_at index in the schema

- **WHEN** `packages/db/src/schema.ts` is inspected for the three tables' index definitions
- **THEN** no index references `table.createdAt` — only the existing indexes on `recipeVersionId`,
  `tasteNoteId`, `equipmentId`, `photoId` remain

### Requirement: No API response shape change

The three join-row Zod schemas in `packages/shared/src/schemas/responses/recipe.ts` SHALL NOT be
extended to include `createdAt`. The schemas are `RecipeVersionPhotoSchema`,
`RecipeDetailTasteNoteSchema`, and `RecipeDetailEquipmentSchema`. These schemas are non-strict
`z.object` (they strip unknown keys), so adding `createdAt` to the DB row will not leak into API
responses and will not break OpenAPI validation.

**Reason:** D43 is a schema/migration-only change. The API does not currently expose join-row
timestamps, and exposing them is a separate API-shape decision.

#### Scenario: Response schemas unchanged

- **WHEN** `git diff` for `packages/shared/src/schemas/responses/recipe.ts` is inspected
- **THEN** no changes are present (the three join-row schemas do not include `createdAt`)

#### Scenario: OpenAPI coverage test passes

- **WHEN** `make test-api` is run (including `openapi.coverage.test.ts`)
- **THEN** the coverage test passes — no route is flagged for missing/extra fields

### Requirement: Seed and fork paths work unchanged

The seed script (`packages/db/src/seed.ts`) SHALL continue to run successfully without
modification after D43. The seed inserts into all three tables omitting `createdAt`, and the
`DEFAULT now()` SHALL handle the new column automatically — no seed change is required.

The `forkRecipe` function (`apps/api/src/modules/recipe/model.ts:358-479`) re-inserts only the
natural-key + value columns (not `createdAt`). After D43, forked join rows SHALL get a fresh
`defaultNow()` timestamp — the correct behaviour (a fork's attachments were "created" at fork time,
not inherited from the source). No special handling is required.

**Reason:** `defaultNow()` makes the new column transparent to all existing insert paths.

#### Scenario: Seed runs without change

- **WHEN** `make db-seed` is run after the migration
- **THEN** the seed script succeeds without modification, and all seeded join rows have non-null
  `createdAt`

#### Scenario: forkRecipe produces fresh timestamps

- **WHEN** a recipe is forked (via `forkRecipe`) after the migration
- **THEN** the forked recipe's join rows have `createdAt` values set to the fork time (not the
  source recipe's attachment times)

### Requirement: Column-existence and insertion tests verify the new columns

A schema column-existence test SHALL be added to `packages/db/src/schema-indexes.test.ts` (or a new
`packages/db/src/schema-columns.test.ts`) using the `getTableConfig(table).columns` pattern. The
test SHALL assert that `recipeTasteNotes`, `recipeEquipment`, and `recipeVersionPhotos` each include
a `createdAt` column with `notNull: true` and a `default` expression (the `now()` default).

The existing `apps/api/src/modules/recipe/model.create.test.ts` SHALL be extended to assert that
join rows created via `createRecipeWithRelations` have `createdAt` populated (non-null, valid
timestamp).

**Reason:** The schema test locks the column's existence and properties at the schema level. The
model test verifies the insert path produces populated `createdAt` values.

#### Scenario: Column-existence test passes

- **WHEN** the schema column test is run (`make test` or `deno test packages/db/src/schema-indexes.test.ts`)
- **THEN** `recipeTasteNotes`, `recipeEquipment`, and `recipeVersionPhotos` are each asserted to
  have a `createdAt` column with `notNull` and a `default`

#### Scenario: model.create.test.ts asserts createdAt populated

- **WHEN** `apps/api/src/modules/recipe/model.create.test.ts` is run
- **THEN** after `createRecipeWithRelations`, the inserted `recipeTasteNotes` / `recipeEquipment` /
  `recipeVersionPhotos` rows have non-null `createdAt` values