# D06: Fix `DrinkType` Type Missing 4 Enum Values

## Severity: High

## Issue Description

The TypeScript `DrinkType` union type in `packages/shared/src/types/recipe.ts:26-37` is missing 4 values that exist in the PostgreSQL `drink_type` enum and the Drizzle schema: `aeropress`, `drip_coffee`, `moka_pot`, `siphon`. This means any TypeScript code that assigns one of these 4 values to a `DrinkType` variable will fail to compile, even though the database accepts them.

## Impact

- **Compile-time errors**: Code using `DrinkType` with the missing values produces TypeScript errors.
- **Silent type widening**: Some code paths may work around this by using `string` instead of `DrinkType`, losing type safety.
- **Schema drift**: The TypeScript type diverges from the database schema, making the type definition unreliable.
- **Recipe creation risk**: Users can create recipes with `drink_type = 'aeropress'` in the DB, but the API layer's type system says this is invalid.

## Root Cause

The `DrinkType` type was defined when the database only supported 11 drink types. When 4 new values (`aeropress`, `drip_coffee`, `moka_pot`, `siphon`) were added to the PostgreSQL enum and Drizzle schema (`packages/db/src/schema.ts:48-64`), the corresponding TypeScript union type in `packages/shared/src/types/recipe.ts` was not updated.

The Drizzle schema has all 15 values:

```typescript
// packages/db/src/schema.ts:48-64
export const drinkTypeEnum = pgEnum('drink_type', [
  'espresso', 'americano', 'flat_white', 'latte', 'cappuccino',
  'cortado', 'macchiato', 'turkish_coffee', 'pour_over', 'cold_brew',
  'french_press', 'aeropress', 'drip_coffee', 'moka_pot', 'siphon',
]);
```

The TypeScript type only has 11:

```typescript
// packages/shared/src/types/recipe.ts:26-37
export type DrinkType =
  | 'espresso' | 'americano' | 'flat_white' | 'latte' | 'cappuccino'
  | 'cortado' | 'macchiato' | 'turkish_coffee' | 'pour_over' | 'cold_brew'
  | 'french_press';
```

## Affected Files

| File | Impact |
|------|--------|
| `packages/shared/src/types/recipe.ts:26-37` | Primary: missing `DrinkType` values |
| `packages/shared/src/schemas/recipe.ts:17-33` | Already correct (has all 15 values in Zod schema) |
| `packages/db/src/schema.ts:48-64` | Already correct (has all 15 values) |

## Fix Approach

Add the 4 missing string literal union members to the `DrinkType` type definition. The Zod schema (`DrinkTypeEnum` in `packages/shared/src/schemas/recipe.ts`) and Drizzle schema (`drinkTypeEnum` in `packages/db/src/schema.ts`) already include all 15 values, so this is a purely additive TypeScript type fix.

Reference: [Drizzle ORM Enums](/drizzle-team/drizzle-orm-docs)

## Implementation Steps

### Step 1: Read the current files

1. Read `packages/shared/src/types/recipe.ts` to confirm the current `DrinkType` definition.
2. Read `packages/db/src/schema.ts` lines 48-64 to confirm the full enum.
3. Read `packages/shared/src/schemas/recipe.ts` lines 17-33 to confirm Zod has all values.

### Step 2: Update `DrinkType`

Edit `packages/shared/src/types/recipe.ts:26-37`:

```typescript
export type DrinkType =
  | 'espresso'
  | 'americano'
  | 'flat_white'
  | 'latte'
  | 'cappuccino'
  | 'cortado'
  | 'macchiato'
  | 'turkish_coffee'
  | 'pour_over'
  | 'cold_brew'
  | 'french_press'
  | 'aeropress'
  | 'drip_coffee'
  | 'moka_pot'
  | 'siphon';
```

### Step 3: Verify no other types need updating

1. Check `packages/shared/src/types/recipe.ts` for any `DrinkTypeEnum` or `drinkType` references that might need updating.
2. Check if `DrinkType` is re-exported from any index files.
3. Verify `RecipeVersion.drinkType` already uses the `DrinkType` type (it does, line 108).
4. Verify `RecipeCreateInput.drinkType` already uses `DrinkType` (it does, line 161).

### Step 4: Run type-check

```bash
make check
```

No new errors expected — this is a strictly additive change.

## Testing Strategy

- **Type-check**: `make check` must pass with zero errors.
- **Lint**: `make lint` must pass.
- **Unit tests**: `make test` — existing tests should continue to pass since no runtime behavior changes.
- **Manual verification**: Search the codebase for any `switch` statements on `DrinkType` that might need new cases.

## Risk Assessment

- **No risk**: This is a strictly additive type change — adding union members cannot break existing code.
- **No migration**: No database changes required.
- **No runtime change**: The type exists only at compile time.
- **Verification**: `make check` provides full safety net.
