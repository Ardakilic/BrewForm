## RENAMED Requirements

- FROM: `### Requirement: Equipment recipe query uses the Drizzle query builder exclusively`
- TO: `### Requirement: Equipment recipe query keeps its correlated EXISTS as a registered raw-SQL exception`

## MODIFIED Requirements

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

### Requirement: getRecipesUsingEquipment retains the count branch's innerJoin chain

The count branch SHALL keep its Drizzle `innerJoin` chain (`recipes → recipeVersions → recipeEquipment`) filtered by `eq(recipeEquipment.equipmentId, equipmentId)` and the shared `recipeConditions`, and SHALL count with Drizzle's `countDistinct(recipes.id)` helper instead of a raw `` sql<number>`count(distinct …)` `` fragment.

**Reason:** The earlier text kept the raw fragment because "Drizzle's `count()` helper does not support `DISTINCT`". drizzle-orm has shipped `countDistinct()` since 0.29.1 (0.45.4 is installed, and `brew-log/model.ts` already uses it), so the fragment is not an accepted raw-SQL exception (lint-style registry).

#### Scenario: Count branch uses innerJoin, not a subquery

- **WHEN** the source of `getRecipesUsingEquipment` is inspected at the count branch
- **THEN** the query uses `db.select({ count: countDistinct(recipes.id) }).from(recipes).innerJoin(recipeVersions, ...).innerJoin(recipeEquipment, ...).where(and(eq(recipeEquipment.equipmentId, equipmentId), recipeConditions))` — NOT a subquery
