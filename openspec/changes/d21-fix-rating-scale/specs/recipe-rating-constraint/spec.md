## ADDED Requirements

### Requirement: Database enforces rating bounds on recipe versions
The system SHALL enforce that `recipeVersions.rating` values are within the inclusive range 1 to 10 at the database level via a CHECK constraint named `recipe_version_rating_check`. The constraint MUST apply to both INSERT and UPDATE operations. The column SHALL remain nullable (NULL values pass the constraint).

#### Scenario: Reject rating below minimum via UPDATE
- **WHEN** `db.update(recipeVersions).set({ rating: 0 }).where(eq(recipeVersions.id, ...))` is executed
- **THEN** the database rejects the operation with a CHECK constraint violation error

#### Scenario: Reject rating below minimum via INSERT
- **WHEN** `db.insert(recipeVersions).values({ ..., rating: -1 })` is executed
- **THEN** the database rejects the operation with a CHECK constraint violation error

#### Scenario: Reject rating above maximum
- **WHEN** `db.update(recipeVersions).set({ rating: 11 }).where(eq(recipeVersions.id, ...))` is executed
- **THEN** the database rejects the operation with a CHECK constraint violation error

#### Scenario: Accept rating at minimum boundary
- **WHEN** `db.update(recipeVersions).set({ rating: 1 }).where(eq(recipeVersions.id, ...))` is executed
- **THEN** the database accepts the operation and the row's rating is updated to 1

#### Scenario: Accept rating at maximum boundary
- **WHEN** `db.update(recipeVersions).set({ rating: 10 }).where(eq(recipeVersions.id, ...))` is executed
- **THEN** the database accepts the operation and the row's rating is updated to 10

#### Scenario: Accept rating in mid-range
- **WHEN** `db.update(recipeVersions).set({ rating: 5 }).where(eq(recipeVersions.id, ...))` is executed
- **THEN** the database accepts the operation and the row's rating is updated to 5

#### Scenario: Accept null rating
- **WHEN** `db.update(recipeVersions).set({ rating: null }).where(eq(recipeVersions.id, ...))` is executed
- **THEN** the database accepts the operation and the row's rating is updated to NULL

#### Scenario: Existing seed data satisfies constraint
- **WHEN** the constraint is applied to the database
- **THEN** all existing rows in `recipe_version` with non-null rating are within the 1–10 range (all seed data is 8, 9, or 10)

### Requirement: Database integration tests verify the CHECK constraint
The change SHALL include integration tests in `packages/db/src/schema-constraints.test.ts` that verify the constraint against a real PostgreSQL database. Tests SHALL use the existing describe block's `beforeEach` and `afterEach` setup. Tests SHALL use `db.update()` on the recipeVersion row created by `beforeEach` (id = `recipeVersionId`). Each test MUST exercise a specific boundary value.

#### Scenario: Tests cover all boundary conditions
- **WHEN** `make test` is run after the migration is applied
- **THEN** the following 7 test cases pass:
  - `should reject rating = 0` — `db.update().set({ rating: 0 })` rejects with `.rejects.toThrow()`
  - `should reject rating = 11` — `db.update().set({ rating: 11 })` rejects with `.rejects.toThrow()`
  - `should reject rating = -1` — `db.update().set({ rating: -1 })` rejects with `.rejects.toThrow()`
  - `should accept rating = 1` — `db.update().set({ rating: 1 })` resolves with `.resolves.toBeDefined()`
  - `should accept rating = 5` — `db.update().set({ rating: 5 })` resolves with `.resolves.toBeDefined()`
  - `should accept rating = 10` — `db.update().set({ rating: 10 })` resolves with `.resolves.toBeDefined()`
  - `should accept rating = NULL` — `db.update().set({ rating: null })` resolves with `.resolves.toBeDefined()`

### Requirement: Type documentation accurately reflects rating scale
The TypeScript type definition for `RecipeVersion.rating` in `packages/shared/src/types/recipe.ts` SHALL document that the rating scale is 1–10, displayed as 5 stars with half-star granularity.

#### Scenario: JSDoc comment reflects correct scale
- **WHEN** a developer inspects the `RecipeVersion.rating` type definition at `packages/shared/src/types/recipe.ts:123`
- **THEN** the JSDoc comment reads `/** 1–10 rating (displayed as 5 stars with half-star granularity) */`

### Requirement: Column documentation matches sibling table convention
The `recipeVersions.rating` column definition in `packages/db/src/schema.ts` SHALL include an inline comment documenting the valid range, matching the pattern used by `userRecipeRatings.rating`.

#### Scenario: Inline comment added to schema column
- **WHEN** a developer inspects `recipeVersions.rating` at `packages/db/src/schema.ts:179`
- **THEN** the column definition reads `rating: integer('rating'), // 1–10`

### Requirement: Resolved technical debt entry is removed
The "5.2 Recipe Rating Scale Mismatch" entry in `plans/TECHNICAL_DEBT.md` (lines 197-201) SHALL be removed since the issue is resolved by this change.

#### Scenario: Technical debt file no longer references resolved issue
- **WHEN** a developer reads `plans/TECHNICAL_DEBT.md`
- **THEN** section 5.1 (Report Status Enum) is immediately followed by section 5.3 (CoffeeVariety Type Uses string for Dates) with no 5.2 entry between them
