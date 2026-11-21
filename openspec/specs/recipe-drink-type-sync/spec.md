# recipe-drink-type-sync Specification

## Purpose

Keeps the recipe drink type defined in one place. `DrinkType` is derived from the single drink-type
source, API filters and shared validators are typed with it, and the web app casts to it only at
untyped boundaries.

## Requirements
### Requirement: DrinkType is derived from the single drink-type source
The shared `DrinkType` type (`packages/shared/src/types/recipe.ts`) SHALL be an alias of `DrinkTypeValue`, which is derived from the `DRINK_TYPES` constant in `packages/shared/src/constants/drink-types.ts`, so the TypeScript union, the `DRINK_TYPE_VALUES` tuple, the Zod `DrinkTypeEnum` and the database `drink_type` enum always list the same values (15 today, including `aeropress`).

#### Scenario: Every canonical value compiles
- **WHEN** a developer writes `const t: DrinkType = 'aeropress'` or uses any other value present in `DRINK_TYPES`
- **THEN** `make check-shared` accepts it

#### Scenario: Constant, tuple and enum agree
- **WHEN** `packages/shared/src/constants/enums.test.ts` runs
- **THEN** it asserts that `DRINK_TYPE_VALUES` matches `DRINK_TYPES`
- **AND** `packages/db/src/schema.ts` declares `drinkTypeEnum` as `pgEnum('drink_type', [...DRINK_TYPE_VALUES])`, so the database enum cannot diverge

### Requirement: API filters and shared validators type drinkType as DrinkType
The `drinkType` member of the recipe model's filter criteria (`RecipeFilterCriteria` in `apps/api/src/modules/recipe/model.ts`, used by `findStarred` and the list queries) and the `drinkType` parameter of `validateSoftWarnings` in `packages/shared/src/utils/validation.ts` SHALL be typed `DrinkType` (optional where the field is optional), never `string`, so no `as any` is needed to pass the value to Drizzle `eq()`.

#### Scenario: Filter is type-safe
- **WHEN** a filter object with `drinkType: 'espresso'` is passed to `findStarred`
- **THEN** it type-checks without a cast, and a value outside `DrinkType` is a compile error

#### Scenario: Soft warnings accept the typed field
- **WHEN** `validateSoftWarnings` is called with a typed recipe payload
- **THEN** its `drinkType` is accepted as `DrinkType` without widening to `string`

### Requirement: Frontend casts to DrinkType appear only at untyped boundaries
Web code SHALL NOT cast a value to `DrinkType` when it is already typed as `DrinkType`; a cast is permitted only where the source is genuinely untyped — a DOM `<select>` change event value, or an API output field that the shared response schema types as `string` (today `RecipeDetailVersionOutput.drinkType`).

#### Scenario: Compatible-drink default needs no cast
- **WHEN** `RecipeCreatePage` assigns the first compatible drink type after a brew-method change
- **THEN** the value comes from the typed `DRINK_TYPES` list and is assigned without `as DrinkType`

#### Scenario: Remaining casts are boundary casts
- **WHEN** `apps/web/src` is searched for `as DrinkType`
- **THEN** every match converts a `<select>` event value or a `string`-typed API output field

