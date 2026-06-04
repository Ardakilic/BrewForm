## Why

The TypeScript `DrinkType` union type in `packages/shared/src/types/recipe.ts` is missing four values (`aeropress`, `drip_coffee`, `moka_pot`, `siphon`) that already exist in the PostgreSQL enum, the Drizzle schema, the Zod schema, and the UI constants. This causes compile-time errors when TypeScript code tries to use these valid drink types and forces unsafe `as any` casts and `string` type workarounds across the API and frontend.

## What Changes

- Add the four missing string literals to the `DrinkType` union type in `packages/shared/src/types/recipe.ts`.
- Tighten the `drinkType` filter parameter type in `apps/api/src/modules/recipe/model.ts` from `string` to `DrinkType` and remove the `as any` cast.
- Tighten the `drinkType` parameter in `packages/shared/src/utils/validation.ts` from `string` to `DrinkType`.
- Remove redundant `as DrinkType` casts in `apps/web/src/pages/recipes/RecipeCreatePage.tsx` and `RecipeEditPage.tsx` (they become unnecessary once `DrinkType` and `DrinkTypeValue` are equivalent).
- Ensure all affected tests continue to pass and add a focused type-level test for the new values.

## Capabilities

### New Capabilities
- `recipe-drink-type-sync`: Align the TypeScript `DrinkType` type with the canonical 15-value enum used by the database, Zod schema, and UI constants.

### Modified Capabilities
- (none — no behavioral requirement changes, only type-system alignment)

## Impact

- **API layer** (`apps/api/src/modules/recipe/model.ts`, `apps/api/src/modules/recipe/service.ts`): safer filter types, removal of `as any`.
- **Shared types** (`packages/shared/src/types/recipe.ts`, `packages/shared/src/utils/validation.ts`): stricter, correct typing.
- **Frontend** (`apps/web/src/pages/recipes/RecipeCreatePage.tsx`, `RecipeEditPage.tsx`): redundant casts removed.
- **Tests** (`apps/api/src/modules/recipe/service.test.ts`, `packages/shared/src/schemas/recipe.test.ts`): already exercise the new drink types via Zod; no breaking changes expected.
- **Database / runtime**: no changes — the values already exist in the schema and seed data.
