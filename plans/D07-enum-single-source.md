# D07: Enum Single Source of Truth Across 3 Locations

## Severity: High

## Issue Description

Enum values are defined in 3 separate locations that must be kept in sync manually:

1. **Drizzle schema** (`packages/db/src/schema.ts`) — PostgreSQL `pgEnum()` definitions
2. **Zod schemas** (`packages/shared/src/schemas/*.ts`) — validation schemas
3. **TypeScript types** (`packages/shared/src/types/*.ts`) — type union definitions

Adding or removing an enum value requires updating all 3 locations in lockstep. This is error-prone and has already caused drift (see D06: `DrinkType` missing 4 values in the TS type).

## Impact

- **High drift risk**: Any new enum value must be added in 3+ files. Missing one causes silent type mismatches.
- **Maintenance burden**: Developers must remember all locations and keep them synchronized.
- **Existing drift**: `DrinkType` already has this issue (D06), proving the risk is real.
- **Testing overhead**: Tests must verify consistency across all 3 locations.

## Root Cause

No shared constant or single source of truth was established for enum values. Each layer (DB, validation, types) independently defined its own copy of the same values.

## Affected Enums

| Enum | DB Location | Zod Location | TS Type Location |
|------|-------------|--------------|------------------|
| `visibility` | `schema.ts:25-30` | `schemas/recipe.ts:35` | `types/recipe.ts:9` |
| `brew_method` | `schema.ts:34-46` | `schemas/recipe.ts:3-15` | `types/recipe.ts:12-23` |
| `drink_type` | `schema.ts:48-64` | `schemas/recipe.ts:17-33` | `types/recipe.ts:26-37` ⚠️ DRIFT |
| `emoji_tag` | `schema.ts:86-93` | `schemas/recipe.ts:36` | `types/recipe.ts:40` |
| `equipment_type` | `schema.ts:66-84` | `schemas/equipment.ts:3-21` | — |
| `additional_preparation_type` | `schema.ts:130-136` | `schemas/recipe.ts:38` | `types/recipe.ts:190` |
| `badge_rule` | `schema.ts:95-106` | `schemas/badge.ts` | — |
| `unit_system` | `schema.ts:108-111` | — | `types/user.ts:12` |
| `temperature_unit` | `schema.ts:113-116` | — | `types/user.ts:25` |
| `theme` | `schema.ts:118-122` | — | `types/user.ts:9` |
| `date_format` | `schema.ts:124-128` | — | `types/user.ts:15` |
| `coffee_variety_category` | `schema.ts:417-421` | `schemas/coffee-variety.ts` | — |

## Fix Approach

Create a single source of truth in `packages/shared/src/constants/enums.ts` using `as const` arrays. Derive Zod schemas and TypeScript types from these constants. The Drizzle schema in `packages/db` must keep its own `pgEnum()` definitions (Drizzle requires this for migrations), but they should reference the shared constants where possible.

Reference: [Drizzle ORM pgEnum](/drizzle-team/drizzle-orm-docs)

## Implementation Steps

### Step 1: Create shared enum constants

Create `packages/shared/src/constants/enums.ts`:

```typescript
// packages/shared/src/constants/enums.ts

export const VISIBILITY_VALUES = ['draft', 'private', 'unlisted', 'public'] as const;
export type Visibility = typeof VISIBILITY_VALUES[number];

export const BREW_METHOD_VALUES = [
  'espresso_machine', 'v60', 'french_press', 'aeropress', 'turkish_coffee',
  'drip_coffee', 'chemex', 'kalita_wave', 'moka_pot', 'cold_brew', 'siphon',
] as const;
export type BrewMethod = typeof BREW_METHOD_VALUES[number];

export const DRINK_TYPE_VALUES = [
  'espresso', 'americano', 'flat_white', 'latte', 'cappuccino', 'cortado',
  'macchiato', 'turkish_coffee', 'pour_over', 'cold_brew', 'french_press',
  'aeropress', 'drip_coffee', 'moka_pot', 'siphon',
] as const;
export type DrinkType = typeof DRINK_TYPE_VALUES[number];

export const EMOJI_TAG_VALUES = [
  'fire', 'rocket', 'thumbsup', 'neutral', 'thumbsdown', 'nauseated',
] as const;
export type EmojiTag = typeof EMOJI_TAG_VALUES[number];

export const EQUIPMENT_TYPE_VALUES = [
  'espresso_machine', 'grinder', 'pour_over_brewer', 'immersion_brewer',
  'kettle', 'milk_tool', 'scale_accessory', 'roaster', 'portafilter',
  'basket', 'puck_screen', 'paper_filter', 'tamper', 'mesh_filter',
  'cezve', 'thermometer', 'other',
] as const;
export type EquipmentType = typeof EQUIPMENT_TYPE_VALUES[number];

export const ADDITIONAL_PREPARATION_TYPE_VALUES = [
  'milk', 'water', 'syrup', 'spice', 'other',
] as const;
export type AdditionalPreparationCategory = typeof ADDITIONAL_PREPARATION_TYPE_VALUES[number];

export const BADGE_RULE_VALUES = [
  'first_brew', 'decade_brewer', 'centurion', 'first_fork',
  'fan_favourite', 'community_star', 'conversationalist',
  'precision_brewer', 'explorer', 'influencer',
] as const;
export type BadgeRule = typeof BADGE_RULE_VALUES[number];

export const UNIT_SYSTEM_VALUES = ['metric', 'imperial'] as const;
export type UnitSystem = typeof UNIT_SYSTEM_VALUES[number];

export const TEMPERATURE_UNIT_VALUES = ['celsius', 'fahrenheit'] as const;
export type TemperatureUnit = typeof TEMPERATURE_UNIT_VALUES[number];

export const THEME_VALUES = ['light', 'dark', 'coffee'] as const;
export type Theme = typeof THEME_VALUES[number];

export const DATE_FORMAT_VALUES = ['DD_MM_YYYY', 'MM_DD_YYYY', 'YYYY_MM_DD'] as const;
export type DateFormat = typeof DATE_FORMAT_VALUES[number];

export const COFFEE_VARIETY_CATEGORY_VALUES = ['variety', 'processing', 'market_name'] as const;
export type CoffeeVarietyCategory = typeof COFFEE_VARIETY_CATEGORY_VALUES[number];

export const EQUIPMENT_DELETE_REQUEST_STATUS_VALUES = [
  'pending', 'approved', 'rejected',
] as const;
export type EquipmentDeleteRequestStatus = typeof EQUIPMENT_DELETE_REQUEST_STATUS_VALUES[number];
```

### Step 2: Derive Zod schemas from constants

Update `packages/shared/src/schemas/recipe.ts`:

```typescript
import { z } from 'zod';
import {
  BREW_METHOD_VALUES,
  DRINK_TYPE_VALUES,
  VISIBILITY_VALUES,
  EMOJI_TAG_VALUES,
  ADDITIONAL_PREPARATION_TYPE_VALUES,
} from '../constants/enums.ts';

export const BrewMethodEnum = z.enum(BREW_METHOD_VALUES);
export const DrinkTypeEnum = z.enum(DRINK_TYPE_VALUES);
export const VisibilityEnum = z.enum(VISIBILITY_VALUES);
export const EmojiTagEnum = z.enum(EMOJI_TAG_VALUES);
export const AdditionalPreparationTypeEnum = z.enum(ADDITIONAL_PREPARATION_TYPE_VALUES);
```

Do the same for `schemas/equipment.ts`, `schemas/badge.ts`, etc.

### Step 3: Update TypeScript type files

Update `packages/shared/src/types/recipe.ts`:

```typescript
export type { BrewMethod, DrinkType, Visibility, EmojiTag } from '../constants/enums.ts';
```

Update `packages/shared/src/types/user.ts`:

```typescript
export type { Theme, UnitSystem, DateFormat, TemperatureUnit } from '../constants/enums.ts';
```

### Step 4: Update Drizzle schema

In `packages/db/src/schema.ts`, import values from shared constants:

```typescript
import {
  VISIBILITY_VALUES,
  BREW_METHOD_VALUES,
  DRINK_TYPE_VALUES,
  // ... etc
} from '@brewform/shared/constants/enums';

export const visibilityEnum = pgEnum('visibility', VISIBILITY_VALUES);
export const brewMethodEnum = pgEnum('brew_method', BREW_METHOD_VALUES);
export const drinkTypeEnum = pgEnum('drink_type', DRINK_TYPE_VALUES);
// ... etc
```

Note: If Drizzle's `pgEnum` does not accept `readonly` arrays, cast with `[...BREW_METHOD_VALUES]` or use `as const` assertions.

### Step 5: Export from package index

Add to `packages/shared/src/index.ts` or a new `packages/shared/src/constants/index.ts`:

```typescript
export * from './enums.ts';
```

### Step 6: Update imports across codebase

Search for all imports of the old type/schema locations and update to use the new shared constants. Key files:

- `apps/api/src/modules/recipe/service.ts` — uses `BrewMethod`, `DrinkType`
- `apps/api/src/modules/recipe/index.ts` — uses Zod schemas
- `apps/web/src/**/*.ts(x)` — uses types
- `packages/shared/src/schemas/*.ts` — uses local enum definitions

### Step 7: Run full verification

```bash
make db-generate   # Generate new migration if schema changed
make db-migrate    # Apply migration
make check         # Type-check all workspaces
make lint          # Lint all code
make test          # Run all tests
```

## Testing Strategy

- **Type-check**: `make check` — zero errors.
- **Lint**: `make lint` — no new warnings.
- **Unit tests**: `make test` — all existing tests pass.
- **Enum consistency test**: Add a test that verifies all 3 locations (DB, Zod, TS) have the same values for each enum.
- **Manual verification**: Create a recipe with each drink type via the API to verify end-to-end.

## Risk Assessment

- **Medium risk**: This changes import paths across many files. Incorrect imports will cause compile errors (caught by `make check`).
- **Migration risk**: If the Drizzle `pgEnum` values change order, Drizzle may generate a migration that drops and recreates the enum. Verify `make db-generate` produces a no-op migration.
- **Rollback**: Revert the commit and restore original files.
- **Verification**: `make check` + `make test` + `make db-generate` (should be no-op).
