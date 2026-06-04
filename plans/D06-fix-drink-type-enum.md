# D06: Fix `DrinkType` Type Missing 4 Enum Values

## Severity: High

## Issue Description

The TypeScript `DrinkType` union type in `packages/shared/src/types/recipe.ts:26-37` is missing 4
values that exist in the PostgreSQL `drink_type` enum and the Drizzle schema:
`aeropress`, `drip_coffee`, `moka_pot`, `siphon`. This means any TypeScript code that assigns one
of these 4 values to a `DrinkType` variable will fail to compile, even though the database accepts
them.

## Impact

- **Compile-time errors**: Code using `DrinkType` with the missing values produces TypeScript errors.
- **Silent type widening**: `apps/api/src/modules/recipe/model.ts` works around this by typing
  the `drinkType` filter parameter as `string` (line 542) and using `as any` casts (line 574)
  instead of `DrinkType`, losing type safety at the query layer.
- **Forced type assertions in the frontend**: `apps/web/src/pages/recipes/RecipeCreatePage.tsx:105`
  must cast `compatibleDrinks[0]?.value as DrinkType` because `DrinkTypeValue` (from
  `constants/drink-types.ts`, all 15 values) is not assignable to the incomplete `DrinkType` (11
  values). This cast is a direct, observable symptom of the bug.
- **Schema drift**: The TypeScript type diverges from both the database schema and from the
  sibling `DrinkTypeValue` type in `packages/shared/src/constants/drink-types.ts`, making
  `DrinkType` the only out-of-sync definition in the codebase.
- **Recipe creation risk**: Users can create recipes with `drink_type = 'aeropress'` in the DB,
  but the API layer's type system says this is invalid.

## Root Cause

The `DrinkType` type was defined when the database only supported 11 drink types. When 4 new
values (`aeropress`, `drip_coffee`, `moka_pot`, `siphon`) were added to the PostgreSQL enum and
Drizzle schema (`packages/db/src/schema.ts:48-64`), two other definitions were updated but
`DrinkType` in `packages/shared/src/types/recipe.ts` was not:

- The Drizzle schema (`drinkTypeEnum`) was updated — **all 15 values** ✓
- The Zod schema (`DrinkTypeEnum` in `packages/shared/src/schemas/recipe.ts:17-33`) was updated — **all 15 values** ✓
- The UI constant (`DRINK_TYPES` in `packages/shared/src/constants/drink-types.ts`) was updated, and its derived `DrinkTypeValue` type has all 15 values — **all 15 values** ✓
- The TypeScript union type `DrinkType` in `packages/shared/src/types/recipe.ts` was **not updated** — **11 values only** ✗

**The Drizzle schema (ground truth):**

```typescript
// packages/db/src/schema.ts:48-64
export const drinkTypeEnum = pgEnum('drink_type', [
  'espresso', 'americano', 'flat_white', 'latte', 'cappuccino',
  'cortado', 'macchiato', 'turkish_coffee', 'pour_over', 'cold_brew',
  'french_press', 'aeropress', 'drip_coffee', 'moka_pot', 'siphon',
]);
```

**The TypeScript type (missing 4 values):**

```typescript
// packages/shared/src/types/recipe.ts:26-37
export type DrinkType =
  | 'espresso' | 'americano' | 'flat_white' | 'latte' | 'cappuccino'
  | 'cortado' | 'macchiato' | 'turkish_coffee' | 'pour_over' | 'cold_brew'
  | 'french_press';
```

**The sibling constant-derived type (already correct, but note it is NOT
re-exported from `packages/shared/src/constants/index.ts`):**

```typescript
// packages/shared/src/constants/drink-types.ts
export const DRINK_TYPES = [
  // ... all 15 entries including aeropress, drip_coffee, moka_pot, siphon
] as const;

export type DrinkTypeValue = (typeof DRINK_TYPES)[number]['value']; // all 15 values ✓
```

> **Note:** `DrinkTypeValue` is correctly typed but is not re-exported from the
> `@brewform/shared` barrel (`constants/index.ts` only exports `DRINK_TYPES`,
> `DRINK_TYPES_LIST`, and `DrinkTypeOption`). `DrinkType` from `types/recipe.ts`
> is the only publicly available typed union for this enum.

## Affected Files

| File | Impact |
|------|--------|
| `packages/shared/src/types/recipe.ts:26-37` | **Primary fix**: add 4 missing `DrinkType` values |
| `packages/shared/src/schemas/recipe.ts:17-33` | Already correct — `DrinkTypeEnum` has all 15 values |
| `packages/db/src/schema.ts:48-64` | Already correct — `drinkTypeEnum` has all 15 values |
| `packages/shared/src/constants/drink-types.ts` | Already correct — `DrinkTypeValue` has all 15 values; no change needed |
| `apps/web/src/pages/recipes/RecipeCreatePage.tsx:105` | Observably affected — `as DrinkType` cast becomes redundant after fix (see Step 3) |
| `apps/api/src/modules/recipe/model.ts:542,574` | Observably affected — `string` type + `as any` cast are workarounds; can be tightened post-fix (out of scope for D06) |

## Fix Approach

Add the 4 missing string literal union members to the `DrinkType` type definition. The Zod schema
(`DrinkTypeEnum` in `packages/shared/src/schemas/recipe.ts`), the Drizzle schema
(`drinkTypeEnum` in `packages/db/src/schema.ts`), and the constant-derived `DrinkTypeValue`
(in `packages/shared/src/constants/drink-types.ts`) already include all 15 values, so this is
a purely additive TypeScript type fix.

## Implementation Steps

### Step 1: Read the current files

1. Read `packages/shared/src/types/recipe.ts` to confirm the current `DrinkType` definition
   (lines 26–37).
2. Read `packages/db/src/schema.ts` lines 48–64 to confirm the full enum.
3. Read `packages/shared/src/schemas/recipe.ts` lines 17–33 to confirm Zod has all values.
4. Read `packages/shared/src/constants/drink-types.ts` to confirm `DrinkTypeValue` has all values
   and note it is not re-exported from `constants/index.ts`.

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

1. Check `packages/shared/src/types/recipe.ts` for any `DrinkTypeEnum` or `drinkType`
   references that might need updating.
2. Check if `DrinkType` is re-exported from any index files — it is, via
   `packages/shared/src/types/index.ts` (the barrel already re-exports it correctly; no
   change needed there).
3. Verify `RecipeVersion.drinkType` already uses the `DrinkType` type (it does, line 108).
4. Verify `RecipeCreateInput.drinkType` already uses `DrinkType` (it does, line 161).
5. Check `packages/shared/src/constants/drink-types.ts` — `DrinkTypeValue` already has all 15
   values. **No change needed.** Note: `DrinkTypeValue` is not re-exported from
   `constants/index.ts`; this is out of scope for D06.
6. Check `apps/web/src/pages/recipes/RecipeCreatePage.tsx:105`. After the fix, the expression
   `compatibleDrinks[0]?.value as DrinkType` becomes a redundant cast because `DrinkTypeValue`
   and `DrinkType` will now be structurally equivalent. The cast is **harmless** — TypeScript
   will not error on it — so removing it is optional but good hygiene. If you clean it up, do
   the same for the analogous pattern in `RecipeEditPage.tsx`.
7. Similarly, `apps/api/src/modules/recipe/model.ts:542` uses `drinkType?: string` (instead of
   `DrinkType`) and line 574 uses `as any` to pass the value to Drizzle's typed `eq()`. These
   are workarounds for the same bug and **can be tightened** as a follow-up (change the filter
   param type from `string` to `DrinkType` and remove the `as any` cast). Out of scope for D06.

### Step 4: Run type-check

```bash
make check
```

No new errors expected — this is a strictly additive change.

## Testing Strategy

- **Type-check**: `make check` must pass with zero errors.
- **Lint**: `make lint` must pass.
- **Unit tests**: `make test` — existing tests should continue to pass since no runtime behaviour
  changes.
- **Manual verification**:
  - Search the codebase for `switch` statements on `DrinkType` that might need new cases.
  - Confirm the `as DrinkType` cast at `RecipeCreatePage.tsx:105` and `RecipeEditPage.tsx`
    (similar pattern) is now redundant — TypeScript should no longer require it. Removing it
    is optional but recommended.
  - Confirm `model.ts:542` still compiles (the `string` workaround remains harmless).

## Risk Assessment

- **No risk**: This is a strictly additive type change — adding union members cannot break
  existing code.
- **No migration**: No database changes required.
- **No runtime change**: The type exists only at compile time.
- **Verification**: `make check` provides full safety net.

## Out of Scope (Follow-up Candidates)

The following are related improvements surfaced during analysis but are **not** part of D06:

| Follow-up | File | Description |
|-----------|------|-------------|
| Export `DrinkTypeValue` | `packages/shared/src/constants/index.ts` | Re-export `DrinkTypeValue` so consumers have an alternative to `DrinkType` derived directly from the `DRINK_TYPES` constant |
| Tighten filter type | `apps/api/src/modules/recipe/model.ts:542,574` | Change `drinkType?: string` to `drinkType?: DrinkType` and remove `as any` cast |
| Remove redundant casts | `apps/web/src/pages/recipes/RecipeCreatePage.tsx:105`, `RecipeEditPage.tsx` | Remove `as DrinkType` casts that become unnecessary once `DrinkType` and `DrinkTypeValue` are equivalent |