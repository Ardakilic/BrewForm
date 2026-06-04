## ADDED Requirements

### Requirement: DrinkType type includes all 15 canonical values
The TypeScript `DrinkType` union type SHALL include every value present in the database `drink_type` enum, the Zod `DrinkTypeEnum`, and the `DRINK_TYPES` constant.

#### Scenario: All four previously missing values compile
- **WHEN** a developer writes `const t: DrinkType = 'aeropress'`
- **THEN** the TypeScript compiler accepts it without error

#### Scenario: Existing values remain valid
- **WHEN** a developer uses any of the original 11 `DrinkType` values
- **THEN** the TypeScript compiler continues to accept them

### Requirement: API filter types use DrinkType instead of string
The `drinkType` parameter in API model and service filter functions SHALL be typed as `DrinkType` (or `DrinkType | undefined`), not `string`.

#### Scenario: findStarred drinkType filter is type-safe
- **WHEN** the `findStarred` model function receives a `drinkType` value
- **THEN** it is typed as `DrinkType` and no `as any` cast is required to pass it to Drizzle `eq()`

### Requirement: Frontend casts are removed once redundant
Any `as DrinkType` casts in the frontend recipe creation and edit pages SHALL be removed once the `DrinkType` type is structurally equivalent to `DrinkTypeValue`.

#### Scenario: RecipeCreatePage drink type assignment
- **WHEN** the brew method changes and `compatibleDrinks[0]?.value` is assigned to `drinkType` state
- **THEN** no `as DrinkType` cast is needed because the value is already provably a `DrinkType`

### Requirement: Shared validation utilities use DrinkType
The `validateSoftWarnings` function in shared utilities SHALL accept `drinkType?: DrinkType` instead of `drinkType?: string`.

#### Scenario: Soft warnings validation compiles with typed drinkType
- **WHEN** `validateSoftWarnings` is called with a typed recipe payload
- **THEN** the `drinkType` field is accepted as `DrinkType` without widening to `string`

## REMOVED Requirements

(none)

## MODIFIED Requirements

(none)
