## MODIFIED Requirements

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

- **WHEN** the schema column test is run (`make test`, or `pnpm --filter @brewform/db exec vitest run src/schema-columns.test.ts src/schema-indexes.test.ts`)
- **THEN** `recipeTasteNotes`, `recipeEquipment`, and `recipeVersionPhotos` are each asserted to
  have a `createdAt` column with `notNull` and a `default`

#### Scenario: model.create.test.ts asserts createdAt populated

- **WHEN** `apps/api/src/modules/recipe/model.create.test.ts` is run
- **THEN** after `createRecipeWithRelations`, the inserted `recipeTasteNotes` / `recipeEquipment` /
  `recipeVersionPhotos` rows have non-null `createdAt` values
