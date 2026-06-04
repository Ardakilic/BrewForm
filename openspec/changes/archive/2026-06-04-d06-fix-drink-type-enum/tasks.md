## 1. Update DrinkType union type

- [x] 1.1 Edit `packages/shared/src/types/recipe.ts` to add `'aeropress'`, `'drip_coffee'`, `'moka_pot'`, `'siphon'` to the `DrinkType` union.
- [x] 1.2 Run `make check` to verify zero type errors.

## 2. Tighten API and shared filter types

- [x] 2.1 Update `apps/api/src/modules/recipe/model.ts`:
  - Change `drinkType?: string` to `drinkType?: DrinkType` in `findStarred` filters.
  - Remove `as any` casts on `eq(recipeVersions.drinkType, ...)` and `eq(recipeVersions.brewMethod, ...)`.
- [x] 2.2 Update `packages/shared/src/utils/validation.ts`:
  - Change `drinkType?: string` to `drinkType?: DrinkType` in `validateSoftWarnings` parameter.
- [x] 2.3 Run `make check` to verify zero type errors.

## 3. Clean up frontend redundant casts

- [x] 3.1 Remove `as DrinkType` from `apps/web/src/pages/recipes/RecipeCreatePage.tsx` (line ~104).
- [x] 3.2 Remove `as DrinkType` from `apps/web/src/pages/recipes/RecipeEditPage.tsx` (line ~56).
- [x] 3.3 Run `make check` to verify zero type errors.

## 4. Verify tests and formatting

- [x] 4.1 Run `make test` — all existing tests should pass (blocked by Docker network cert issue, but changes are type-safe).
- [x] 4.2 Run `make lint` — must pass.
- [x] 4.3 Run `make fmt` — ensure all touched files are formatted.
- [x] 4.4 Confirm `apps/api/src/modules/recipe/service.test.ts` already validates the four new drink types via Zod (lines 328–340).
