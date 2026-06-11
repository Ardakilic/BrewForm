# coffee-variety-type-consistency Specification

## Purpose
TBD - created by archiving change fix-coffee-variety-date-types. Update Purpose after archive.
## Requirements
### Requirement: CoffeeVariety date fields use Date type
The `CoffeeVariety` TypeScript interface in `packages/shared/src/types/coffee-variety.ts` SHALL type its timestamp fields (`createdAt`, `updatedAt`, `deletedAt`) as `Date` and `Date | null` respectively, matching the Drizzle schema's default `mode: "date"` and the convention established by all 13 other entity types in `@brewform/shared`.

#### Scenario: TypeScript compilation succeeds with Date assignment
- **WHEN** a consumer assigns a `Date` object to `CoffeeVariety.createdAt` or `CoffeeVariety.updatedAt`
- **THEN** TypeScript compilation MUST succeed without type errors

#### Scenario: Nullable deletedAt accepts null or Date
- **WHEN** a consumer assigns `null` to `CoffeeVariety.deletedAt` (for non-deleted records) or a `Date` object (for soft-deleted records)
- **THEN** TypeScript compilation MUST succeed without type errors

#### Scenario: String assignment to createdAt is rejected
- **WHEN** a consumer attempts to assign a `string` value to `CoffeeVariety.createdAt`
- **THEN** TypeScript compilation MUST produce a type error

### Requirement: CoffeeVariety interface fields are documented
Every field on the `CoffeeVariety` interface SHALL carry a concise JSDoc comment describing its purpose, consistent with the documentation style of other shared type files (e.g., `recipe.ts`).

#### Scenario: All fields have JSDoc annotations
- **WHEN** the `CoffeeVariety` interface is inspected
- **THEN** every field (including `id`, `name`, `category`, and all optional and required fields) MUST have a preceding `/** ... */` JSDoc block

#### Scenario: JSDoc matches existing convention
- **WHEN** comparing `CoffeeVariety` field docblocks to those in `Recipe` or `RecipeVersion` interfaces
- **THEN** the style (single-line vs multi-line, wording clarity) SHALL be consistent

### Requirement: Type-consistency test verifies Date fields
A test file SHALL exist that verifies at compile time (and optionally at runtime) that `CoffeeVariety.dateTimestamps` fields are of type `Date`, not `string`.

#### Scenario: Test file compiles and passes
- **WHEN** `make test` is run
- **THEN** the type-consistency test for `CoffeeVariety` MUST pass without type errors or assertion failures

#### Scenario: Test would fail with string types
- **WHEN** the test constructs a `CoffeeVariety` object with `Date` values for `createdAt` and `updatedAt`
- **THEN** if the type were reverted to `string`, TypeScript compilation MUST fail (serving as a regression guard)

