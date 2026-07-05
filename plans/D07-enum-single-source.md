# D07: Enum Single Source of Truth Across 3 Locations

> **Status (2026-07-04): ✅ Done** — `schema.ts:36` imports `*_VALUES` from `@brewform/shared/constants`; `enums.test.ts` covers the tuples.

## Severity: High

## Issue Description

Enum values are defined in 3 separate locations that must be kept in sync manually:

1. **Drizzle schema** (`packages/db/src/schema.ts`) — PostgreSQL `pgEnum()` definitions
2. **Zod schemas** (`packages/shared/src/schemas/*.ts`) — validation schemas
3. **TypeScript types** (`packages/shared/src/types/*.ts`) — type union definitions

Adding or removing an enum value requires updating all 3 locations in lockstep. This is error-prone and has already caused a production-breaking drift (see below).

## Existing Drift (production bug)

**`date_format` enum — the only active drift found in the codebase:**

| Layer | Values stored |
|-------|--------------|
| DB (`schema.ts` pgEnum) | `'DD_MM_YYYY'`, `'MM_DD_YYYY'`, `'YYYY_MM_DD'` |
| Zod (`schemas/user.ts`) | `'DD/MM/YYYY'`, `'MM/DD/YYYY'`, `'YYYY-MM-DD'` |
| TypeScript (`types/user.ts`) | `'DD/MM/YYYY' \| 'MM/DD/YYYY' \| 'YYYY-MM-DD'` |

These are **incompatible string values**. The Zod schema accepts `'DD/MM/YYYY'` but PostgreSQL will reject it at INSERT/UPDATE time because the `date_format` column enum was migrated with underscores. All other 12 enums are currently in sync across all layers.

> **Prior note on D06:** The DrinkType drift referenced in the original issue description is already resolved. All 15 `drink_type` values match across DB, Zod, and TypeScript as of the current main branch.

## Current State of `packages/shared/src/constants/`

A `constants/` directory already exists with rich-object arrays for several enums. This is the correct foundation — the work here is to connect it to the layers that still maintain independent inline definitions.

| Constants file | What exists | What's missing |
|---|---|---|
| `visibility.ts` | `VISIBILITY_STATES` (rich objects), `VisibilityValue` type | `VISIBILITY_VALUES` tuple for Drizzle/Zod |
| `brew-methods.ts` | `BREW_METHODS` (rich objects), `BrewMethodValue` type | `BREW_METHOD_VALUES` tuple |
| `drink-types.ts` | `DRINK_TYPES` (rich objects), `DrinkTypeValue` type | `DRINK_TYPE_VALUES` tuple |
| `emoji-tags.ts` | `EMOJI_TAGS` (rich objects with `key` field), `EmojiTagKey` type | `EMOJI_TAG_VALUES` tuple |
| `badges.ts` | `BADGE_RULES` (rich objects with `rule` field) | `BadgeRule` type, `BADGE_RULE_VALUES` tuple |
| `brew-method-rules.ts` | `EQUIPMENT_TYPES` (non-const array), `EQUIPMENT_TYPE_LABELS` | These should move to a new `equipment-types.ts` file |
| `units.ts` | Unit conversion helpers | Not an enum; no action needed |
| *(missing)* | `equipment_type`, `additional_preparation_type`, `unit_system`, `temperature_unit`, `theme`, `date_format`, `coffee_variety_category`, `equipment_delete_request_status` | New constants files needed |

**Additionally**, several types that ARE defined in `types/` files are not yet re-exported through `types/index.ts`:
- `EquipmentType` (in `types/equipment.ts` — not in barrel)
- `Theme` (in `types/user.ts` — not in barrel)
- `DateFormat` (in `types/user.ts` — not in barrel)
- `AdditionalPreparationCategory` (in `types/recipe.ts` — not in barrel)
- `TemperatureUnit` (does not exist as a named type anywhere — only inline in `UserPreferences`)

And several types that exist in individual constants files are not exported from `constants/index.ts`:
- `BrewMethodValue`, `DrinkTypeValue`, `EmojiTagKey`, `VisibilityValue`

## Impact

- **Production bug**: Saving a user's `dateFormat` preference will be rejected by PostgreSQL (enum value mismatch).
- **High drift risk**: Any new enum value must be added in 3+ files. Missing one causes silent type mismatches.
- **Maintenance burden**: Developers must remember all locations and keep them synchronised.
- **Incomplete barrel exports**: `EquipmentType`, `Theme`, `DateFormat`, `AdditionalPreparationCategory`, and `TemperatureUnit` are not publicly accessible via the shared package's export paths.

## Fix Approach

Extend the existing `constants/` directory to be the single source of truth for all enum values. Each existing rich-object file gains a plain values tuple that derives from the objects it already owns. New files are created for missing enums. Zod schemas and TypeScript types derive from these tuples. The Drizzle schema imports the tuples from `@brewform/shared/constants` and passes them to `pgEnum()`.

The existing rich-object exports (`BREW_METHODS`, `DRINK_TYPES`, etc.) are **preserved unchanged** — only additions are made to those files.

---

## Implementation Steps

### Step 1 — Fix the `DateFormat` production bug (do this first, independently)

This is a standalone fix that does not require the rest of the refactor and should be merged immediately.

**`packages/shared/src/schemas/user.ts`** — correct the three drift values:

```typescript
// BEFORE (incorrect — does not match DB enum):
dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).default('YYYY-MM-DD'),

// AFTER (matches DB pgEnum values):
dateFormat: z.enum(['DD_MM_YYYY', 'MM_DD_YYYY', 'YYYY_MM_DD']).default('YYYY_MM_DD'),
```

**`packages/shared/src/types/user.ts`** — fix the `DateFormat` type and the `UserPreferences` interface:

```typescript
// BEFORE:
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

// AFTER:
export type DateFormat = 'DD_MM_YYYY' | 'MM_DD_YYYY' | 'YYYY_MM_DD';
```

**Run immediately after this change:**
```bash
# Confirm no rows in the DB have the old slash/dash values
# (if the date format preference UI was never shipped, this should return 0 rows)
psql -c "SELECT id, date_format FROM user_preferences
         WHERE date_format NOT IN ('DD_MM_YYYY', 'MM_DD_YYYY', 'YYYY_MM_DD');"
```

If rows are found, write a one-off data migration to convert `'DD/MM/YYYY'` → `'DD_MM_YYYY'`, etc. before deploying.

**Update any display/formatting helpers** that render the stored value as a human-readable pattern. They currently receive `'DD/MM/YYYY'` directly; after the fix they receive `'DD_MM_YYYY'` and must map it:

```typescript
import type { DateFormat } from '@brewform/shared/types';

// Add this helper (or update the existing one):
export const DATE_FORMAT_DISPLAY: Record<DateFormat, string> = {
  DD_MM_YYYY: 'DD/MM/YYYY',
  MM_DD_YYYY: 'MM/DD/YYYY',
  YYYY_MM_DD: 'YYYY-MM-DD',
};
```

```bash
# Find every reference to the old slash/dash values in apps/
grep -rn "DD/MM/YYYY\|MM/DD/YYYY\|YYYY-MM-DD" apps/ packages/
```

---

### Step 2 — Add `_VALUES` tuples to existing constants files

Add the following exports at the **end** of each existing file. The `.map()` derivation ensures the values tuple is always derived from the rich objects, so they cannot diverge.

**`packages/shared/src/constants/visibility.ts`** — add:

```typescript
// Derived pure-values tuple — always in sync with VISIBILITY_STATES above
export const VISIBILITY_VALUES = VISIBILITY_STATES.map((s) => s.value) as
  [VisibilityValue, ...VisibilityValue[]];
```

**`packages/shared/src/constants/brew-methods.ts`** — add:

```typescript
// Derived pure-values tuple — always in sync with BREW_METHODS above
export const BREW_METHOD_VALUES = BREW_METHODS.map((m) => m.value) as
  [BrewMethodValue, ...BrewMethodValue[]];
```

**`packages/shared/src/constants/drink-types.ts`** — add:

```typescript
// Derived pure-values tuple — always in sync with DRINK_TYPES above
export const DRINK_TYPE_VALUES = DRINK_TYPES.map((d) => d.value) as
  [DrinkTypeValue, ...DrinkTypeValue[]];
```

**`packages/shared/src/constants/emoji-tags.ts`** — add (note: the field is `key`, not `value`):

```typescript
// Derived pure-values tuple — always in sync with EMOJI_TAGS above
export const EMOJI_TAG_VALUES = EMOJI_TAGS.map((t) => t.key) as
  [EmojiTagKey, ...EmojiTagKey[]];
```

**`packages/shared/src/constants/badges.ts`** — add (note: the field is `rule`, not `value`):

```typescript
// Add the named type (currently missing from this file):
export type BadgeRule = (typeof BADGE_RULES)[number]['rule'];

// Derived pure-values tuple — always in sync with BADGE_RULES above
export const BADGE_RULE_VALUES = BADGE_RULES.map((b) => b.rule) as
  [BadgeRule, ...BadgeRule[]];
```

---

### Step 3 — Create `constants/equipment-types.ts` (migrating from `brew-method-rules.ts`)

`EQUIPMENT_TYPES` and `EQUIPMENT_TYPE_LABELS` already exist in `brew-method-rules.ts` but are typed as mutable `EquipmentType[]` (non-const) and are not exported from `constants/index.ts`. Promote them to a dedicated file.

Create **`packages/shared/src/constants/equipment-types.ts`**:

```typescript
/**
 * Equipment type enum values — single source of truth.
 * Consumed by Drizzle pgEnum, Zod schemas, and TypeScript types.
 */
export const EQUIPMENT_TYPE_VALUES = [
  'espresso_machine',
  'grinder',
  'pour_over_brewer',
  'immersion_brewer',
  'kettle',
  'milk_tool',
  'scale_accessory',
  'roaster',
  'portafilter',
  'basket',
  'puck_screen',
  'paper_filter',
  'tamper',
  'mesh_filter',
  'cezve',
  'thermometer',
  'other',
] as const;

export type EquipmentType = typeof EQUIPMENT_TYPE_VALUES[number];

/** Human-readable labels for each equipment type. */
export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  espresso_machine: 'Espresso Machine',
  grinder: 'Grinder',
  pour_over_brewer: 'Pour-Over & Filter Brewer',
  immersion_brewer: 'Immersion & Pressure Brewer',
  kettle: 'Kettle',
  milk_tool: 'Milk Tool',
  scale_accessory: 'Scale & Accessory',
  roaster: 'Roaster',
  portafilter: 'Portafilter',
  basket: 'Basket',
  puck_screen: 'Puck Screen',
  paper_filter: 'Paper Filter',
  tamper: 'Tamper',
  mesh_filter: 'Mesh Filter',
  cezve: 'Cezve',
  thermometer: 'Thermometer',
  other: 'Other',
};

/** Mutable copy for use in .map()/.filter() in React components. */
export const EQUIPMENT_TYPES: EquipmentType[] = [...EQUIPMENT_TYPE_VALUES];
```

Then **update `constants/brew-method-rules.ts`** to:
1. Import from the new file instead of from `types/`
2. Remove the now-duplicate `EQUIPMENT_TYPES` and `EQUIPMENT_TYPE_LABELS` declarations

```typescript
// BEFORE (top of file):
import type { BrewMethod } from '../types/recipe.ts';
import type { EquipmentType } from '../types/equipment.ts';

export const EQUIPMENT_TYPES: EquipmentType[] = [ ... ];       // DELETE
export const EQUIPMENT_TYPE_LABELS: Record<...> = { ... };     // DELETE

// AFTER:
import type { BrewMethodValue } from './brew-methods.ts';
import type { EquipmentType } from './equipment-types.ts';

// Update the interface and BREW_METHOD_EQUIPMENT_RULES to use BrewMethodValue
// (BrewMethodValue is the same type as BrewMethod — just the name from constants)
export interface BrewMethodEquipmentRuleDef {
  brewMethod: BrewMethodValue;
  equipmentType: EquipmentType;
  compatible: boolean;
}
// BREW_METHOD_EQUIPMENT_RULES array body is unchanged
```

---

### Step 4 — Create new constants files for remaining missing enums

Create **`packages/shared/src/constants/additional-preparation-types.ts`**:

```typescript
export const ADDITIONAL_PREPARATION_TYPE_VALUES = [
  'milk',
  'water',
  'syrup',
  'spice',
  'other',
] as const;

/**
 * Named "Category" to match the existing TypeScript convention in types/recipe.ts.
 * The DB enum and Zod schema use the word "type" but the TS convention is "category".
 */
export type AdditionalPreparationCategory =
  typeof ADDITIONAL_PREPARATION_TYPE_VALUES[number];
```

Create **`packages/shared/src/constants/user-preferences.ts`**:

```typescript
export const UNIT_SYSTEM_VALUES = ['metric', 'imperial'] as const;
export type UnitSystem = typeof UNIT_SYSTEM_VALUES[number];

export const TEMPERATURE_UNIT_VALUES = ['celsius', 'fahrenheit'] as const;
/** Named type — was previously only defined inline in the UserPreferences interface. */
export type TemperatureUnit = typeof TEMPERATURE_UNIT_VALUES[number];

export const THEME_VALUES = ['light', 'dark', 'coffee'] as const;
export type Theme = typeof THEME_VALUES[number];

/**
 * DateFormat values use underscore separators to match the PostgreSQL enum.
 * Display-formatted strings ('DD/MM/YYYY' etc.) must NOT be used as stored values.
 * Use DATE_FORMAT_DISPLAY in your rendering helpers (see Step 1).
 */
export const DATE_FORMAT_VALUES = ['DD_MM_YYYY', 'MM_DD_YYYY', 'YYYY_MM_DD'] as const;
export type DateFormat = typeof DATE_FORMAT_VALUES[number];

export const DATE_FORMAT_DISPLAY: Record<DateFormat, string> = {
  DD_MM_YYYY: 'DD/MM/YYYY',
  MM_DD_YYYY: 'MM/DD/YYYY',
  YYYY_MM_DD: 'YYYY-MM-DD',
};
```

Create **`packages/shared/src/constants/coffee-variety.ts`**:

```typescript
export const COFFEE_VARIETY_CATEGORY_VALUES = [
  'variety',
  'processing',
  'market_name',
] as const;

export type CoffeeVarietyCategory =
  typeof COFFEE_VARIETY_CATEGORY_VALUES[number];
```

Create **`packages/shared/src/constants/equipment-delete-request.ts`**:

```typescript
export const EQUIPMENT_DELETE_REQUEST_STATUS_VALUES = [
  'pending',
  'approved',
  'rejected',
] as const;

export type EquipmentDeleteRequestStatus =
  typeof EQUIPMENT_DELETE_REQUEST_STATUS_VALUES[number];
```

---

### Step 5 — Update `constants/index.ts`

Replace the entire file with the full set of exports, including types that were previously unexported:

```typescript
// ── Existing rich-object exports (unchanged) ─────────────────────────────────
export {
  BREW_METHODS,
  BREW_METHODS_LIST,
  type BrewMethodOption,
} from './brew-methods.ts';
export {
  DRINK_TYPES,
  DRINK_TYPES_LIST,
  type DrinkTypeOption,
} from './drink-types.ts';
export {
  EMOJI_TAGS,
  EMOJI_TAGS_LIST,
  type EmojiTagOption,
} from './emoji-tags.ts';
export { CANONICAL_UNITS, UNIT_CONVERSIONS } from './units.ts';
export {
  VISIBILITY_STATES,
  VISIBILITY_STATES_LIST,
  type VisibilityOption,
} from './visibility.ts';
export { BADGE_RULES } from './badges.ts';
export {
  BREW_METHOD_EQUIPMENT_RULES,
  type BrewMethodEquipmentRuleDef,
} from './brew-method-rules.ts';

// ── New: pure-value tuples and their derived types ────────────────────────────
export {
  BREW_METHOD_VALUES,
  type BrewMethodValue,
} from './brew-methods.ts';
export {
  DRINK_TYPE_VALUES,
  type DrinkTypeValue,
} from './drink-types.ts';
export {
  EMOJI_TAG_VALUES,
  type EmojiTagKey,
} from './emoji-tags.ts';
export {
  VISIBILITY_VALUES,
  type VisibilityValue,
} from './visibility.ts';
export {
  BADGE_RULE_VALUES,
  type BadgeRule,
} from './badges.ts';

// ── New files ─────────────────────────────────────────────────────────────────
export {
  EQUIPMENT_TYPE_VALUES,
  EQUIPMENT_TYPE_LABELS,
  EQUIPMENT_TYPES,
  type EquipmentType,
} from './equipment-types.ts';
export {
  ADDITIONAL_PREPARATION_TYPE_VALUES,
  type AdditionalPreparationCategory,
} from './additional-preparation-types.ts';
export {
  DATE_FORMAT_VALUES,
  DATE_FORMAT_DISPLAY,
  TEMPERATURE_UNIT_VALUES,
  THEME_VALUES,
  UNIT_SYSTEM_VALUES,
  type DateFormat,
  type TemperatureUnit,
  type Theme,
  type UnitSystem,
} from './user-preferences.ts';
export {
  COFFEE_VARIETY_CATEGORY_VALUES,
  type CoffeeVarietyCategory,
} from './coffee-variety.ts';
export {
  EQUIPMENT_DELETE_REQUEST_STATUS_VALUES,
  type EquipmentDeleteRequestStatus,
} from './equipment-delete-request.ts';
```

---

### Step 6 — Derive Zod schemas from constants

**`packages/shared/src/schemas/recipe.ts`** — replace the five inline enum declarations at the top:

```typescript
import { z } from 'zod';
import {
  ADDITIONAL_PREPARATION_TYPE_VALUES,
  BREW_METHOD_VALUES,
  DRINK_TYPE_VALUES,
  EMOJI_TAG_VALUES,
  VISIBILITY_VALUES,
} from '../constants/index.ts';

const BrewMethodEnum = z.enum(BREW_METHOD_VALUES);
const DrinkTypeEnum = z.enum(DRINK_TYPE_VALUES);
const VisibilityEnum = z.enum(VISIBILITY_VALUES);
const EmojiTagEnum = z.enum(EMOJI_TAG_VALUES);
const AdditionalPreparationTypeEnum = z.enum(ADDITIONAL_PREPARATION_TYPE_VALUES);
// ── remainder of the file is unchanged ──────────────────────────────────────
```

**`packages/shared/src/schemas/equipment.ts`** — replace the inline `EquipmentTypeEnum`:

```typescript
import { z } from 'zod';
import { EQUIPMENT_TYPE_VALUES } from '../constants/index.ts';

const EquipmentTypeEnum = z.enum(EQUIPMENT_TYPE_VALUES);
// ── remainder of the file is unchanged ──────────────────────────────────────
```

**`packages/shared/src/schemas/badge.ts`** — replace the inline `BadgeRuleEnum`:

```typescript
import { z } from 'zod';
import { BADGE_RULE_VALUES } from '../constants/index.ts';

const BadgeRuleEnum = z.enum(BADGE_RULE_VALUES);
// ── remainder of the file is unchanged ──────────────────────────────────────
```

**`packages/shared/src/schemas/user.ts`** — replace all four inline enums and fix the DateFormat default (if Step 1 has not already been applied):

```typescript
import { z } from 'zod';
import {
  DATE_FORMAT_VALUES,
  TEMPERATURE_UNIT_VALUES,
  THEME_VALUES,
  UNIT_SYSTEM_VALUES,
} from '../constants/index.ts';

export const UserPreferencesSchema = z.object({
  unitSystem: z.enum(UNIT_SYSTEM_VALUES).default('metric'),
  temperatureUnit: z.enum(TEMPERATURE_UNIT_VALUES).default('celsius'),
  theme: z.enum(THEME_VALUES).default('light'),
  locale: z.string().default('en'),
  timezone: z.string().default('UTC'),
  dateFormat: z.enum(DATE_FORMAT_VALUES).default('YYYY_MM_DD'), // fixed from 'YYYY-MM-DD'
  emailNotifications: z.object({
    newFollower: z.boolean().default(true),
    recipeLiked: z.boolean().default(true),
    recipeCommented: z.boolean().default(true),
    followedUserPosted: z.boolean().default(true),
  }).default({
    newFollower: true,
    recipeLiked: true,
    recipeCommented: true,
    followedUserPosted: true,
  }),
});

export const UserProfileUpdateSchema = z.object({
  displayName: z.string().max(50).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.url().optional(),
});
```

**`packages/shared/src/schemas/coffee-variety.ts`** — replace the inline `CoffeeVarietyCategoryEnum`:

```typescript
import { z } from 'zod';
import { COFFEE_VARIETY_CATEGORY_VALUES } from '../constants/index.ts';

export const CoffeeVarietyCategoryEnum = z.enum(COFFEE_VARIETY_CATEGORY_VALUES);
// ── remainder of the file is unchanged ──────────────────────────────────────
```

---

### Step 7 — Derive TypeScript types from constants

Replace inline string-union type definitions with derivations from constants. The strategy is to import the constants type into the types file and create a local alias — this preserves the existing type name so all consumers continue to compile unchanged.

**`packages/shared/src/types/recipe.ts`** — replace the four standalone type definitions at the top:

```typescript
// REMOVE these four inline definitions:
// export type Visibility = 'draft' | 'private' | 'unlisted' | 'public';
// export type BrewMethod = 'espresso_machine' | 'v60' | ...;
// export type DrinkType = 'espresso' | 'americano' | ...;
// export type EmojiTag = 'fire' | 'rocket' | ...;
// export type AdditionalPreparationCategory = 'milk' | 'water' | ...;

// REPLACE WITH (add at the top, after the JSDoc block):
import type { VisibilityValue } from '../constants/visibility.ts';
import type { BrewMethodValue } from '../constants/brew-methods.ts';
import type { DrinkTypeValue } from '../constants/drink-types.ts';
import type { EmojiTagKey } from '../constants/emoji-tags.ts';
import type {
  AdditionalPreparationCategory as _AdditionalPreparationCategory,
} from '../constants/additional-preparation-types.ts';

/** Visibility state for a recipe. Drafts are only visible to the author. */
export type Visibility = VisibilityValue;

/** Supported brewing devices and techniques. */
export type BrewMethod = BrewMethodValue;

/** Final drink served to the consumer (may differ from the brew method). */
export type DrinkType = DrinkTypeValue;

/** Quick-reaction emoji a user can attach to their own brew. */
export type EmojiTag = EmojiTagKey;

/** Category of an additional preparation step. */
export type AdditionalPreparationCategory = _AdditionalPreparationCategory;

// ── remainder of the file (interfaces using these types) is unchanged ────────
```

**`packages/shared/src/types/user.ts`** — replace the three standalone type definitions:

```typescript
// REMOVE:
// export type Theme = 'light' | 'dark' | 'coffee';
// export type UnitSystem = 'metric' | 'imperial';
// export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
// (temperatureUnit was inline in the interface)

// REPLACE WITH (add after the JSDoc block, before the type declarations):
import type {
  DateFormat as _DateFormat,
  TemperatureUnit as _TemperatureUnit,
  Theme as _Theme,
  UnitSystem as _UnitSystem,
} from '../constants/user-preferences.ts';

/** UI colour theme. */
export type Theme = _Theme;

/** Measurement system for weight and volume display. */
export type UnitSystem = _UnitSystem;

/**
 * Date display format.
 * Stored value uses underscore separators to match the PostgreSQL enum.
 * Use DATE_FORMAT_DISPLAY from @brewform/shared/constants for rendering.
 */
export type DateFormat = _DateFormat;

/** Temperature unit for display. */
export type TemperatureUnit = _TemperatureUnit;

// ── Update UserPreferences interface — replace inline temperatureUnit:
export interface UserPreferences {
  unitSystem: UnitSystem;
  temperatureUnit: TemperatureUnit;   // was: 'celsius' | 'fahrenheit' inline
  theme: Theme;
  locale: string;
  timezone: string;
  dateFormat: DateFormat;
  emailNotifications: {
    newFollower: boolean;
    recipeLiked: boolean;
    recipeCommented: boolean;
    followedUserPosted: boolean;
  };
}
// ── remainder of the file is unchanged ──────────────────────────────────────
```

**`packages/shared/src/types/equipment.ts`** — replace the standalone `EquipmentType` definition:

```typescript
// REMOVE:
// export type EquipmentType = 'espresso_machine' | 'grinder' | ...;

// REPLACE WITH:
import type { EquipmentType as _EquipmentType } from '../constants/equipment-types.ts';

/** Category of brewing equipment. */
export type EquipmentType = _EquipmentType;

// ── remainder of the file (Equipment, Portafilter, Basket, etc.) is unchanged ─
```

**`packages/shared/src/types/badge.ts`** — replace the standalone `BadgeRule` definition:

```typescript
// REMOVE:
// export type BadgeRule = 'first_brew' | 'decade_brewer' | ...;

// REPLACE WITH:
import type { BadgeRule as _BadgeRule } from '../constants/badges.ts';

/** Machine-readable badge rule identifier. */
export type BadgeRule = _BadgeRule;

// ── remainder of the file is unchanged ──────────────────────────────────────
```

**`packages/shared/src/types/coffee-variety.ts`** — replace the standalone `CoffeeVarietyCategory` definition:

```typescript
// REMOVE:
// export type CoffeeVarietyCategory = 'variety' | 'processing' | 'market_name';

// REPLACE WITH:
import type {
  CoffeeVarietyCategory as _CoffeeVarietyCategory,
} from '../constants/coffee-variety.ts';

export type CoffeeVarietyCategory = _CoffeeVarietyCategory;

// ── remainder of the file is unchanged ──────────────────────────────────────
```

---

### Step 8 — Fix missing exports in `types/index.ts`

The following types are defined in their respective files but were not exported through the barrel. Add them to `packages/shared/src/types/index.ts`:

```typescript
// UPDATE the user.ts export line (add Theme, DateFormat, TemperatureUnit):
export type {
  DateFormat,
  TemperatureUnit,
  Theme,
  UnitSystem,
  User,
  UserPreferences,
  UserProfile,
} from './user.ts';

// UPDATE the equipment.ts export line (add EquipmentType):
export type {
  Basket,
  Equipment,
  EquipmentType,   // ← add
  PaperFilter,
  Portafilter,
  PuckScreen,
  Tamper,
} from './equipment.ts';

// UPDATE the recipe.ts export line (add AdditionalPreparationCategory):
export type {
  AdditionalPreparation,
  AdditionalPreparationCategory,  // ← add
  BrewMethod,
  DrinkType,
  EmojiTag,
  Recipe,
  RecipeCreateInput,
  RecipeUpdateInput,
  RecipeVersion,
  Visibility,
} from './recipe.ts';
```

No other lines in `types/index.ts` need to change.

---

### Step 9 — Update Drizzle schema to import from shared constants

In **`packages/db/src/schema.ts`**, add imports from `@brewform/shared/constants` and replace all inline `pgEnum` value arrays with spread calls.

> **Note:** `packages/db` has no dependency on `packages/shared` today. Since this is a Deno workspace, adding `@brewform/shared` as an import is valid — the workspace resolver handles it. No `deno.json` change is needed because workspace members share the same resolution graph.

> **Note on spread:** Drizzle ORM 0.45 `pgEnum` accepts `Readonly<[T, ...T[]]>`. The spread `[...VALUES]` converts to a mutable tuple, which satisfies the constraint in all TypeScript strict-mode configurations without type assertions.

```typescript
import { relations } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  boolean,
  check,
  decimal,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  ADDITIONAL_PREPARATION_TYPE_VALUES,
  BADGE_RULE_VALUES,
  BREW_METHOD_VALUES,
  COFFEE_VARIETY_CATEGORY_VALUES,
  DATE_FORMAT_VALUES,
  DRINK_TYPE_VALUES,
  EMOJI_TAG_VALUES,
  EQUIPMENT_DELETE_REQUEST_STATUS_VALUES,
  EQUIPMENT_TYPE_VALUES,
  TEMPERATURE_UNIT_VALUES,
  THEME_VALUES,
  UNIT_SYSTEM_VALUES,
  VISIBILITY_VALUES,
} from '@brewform/shared/constants';

// ============================================================
// Enums — values imported from @brewform/shared/constants
// ============================================================

export const visibilityEnum = pgEnum('visibility', [...VISIBILITY_VALUES]);
export const brewMethodEnum = pgEnum('brew_method', [...BREW_METHOD_VALUES]);
export const drinkTypeEnum = pgEnum('drink_type', [...DRINK_TYPE_VALUES]);
export const equipmentTypeEnum = pgEnum('equipment_type', [...EQUIPMENT_TYPE_VALUES]);
export const emojiTagEnum = pgEnum('emoji_tag', [...EMOJI_TAG_VALUES]);
export const badgeRuleEnum = pgEnum('badge_rule', [...BADGE_RULE_VALUES]);
export const unitSystemEnum = pgEnum('unit_system', [...UNIT_SYSTEM_VALUES]);
export const temperatureUnitEnum = pgEnum('temperature_unit', [...TEMPERATURE_UNIT_VALUES]);
export const themeEnum = pgEnum('theme', [...THEME_VALUES]);
export const dateFormatEnum = pgEnum('date_format', [...DATE_FORMAT_VALUES]);
export const additionalPreparationTypeEnum = pgEnum(
  'additional_preparation_type',
  [...ADDITIONAL_PREPARATION_TYPE_VALUES],
);
export const coffeeVarietyCategoryEnum = pgEnum(
  'coffee_variety_category',
  [...COFFEE_VARIETY_CATEGORY_VALUES],
);
export const equipmentDeleteRequestStatusEnum = pgEnum(
  'equipment_delete_request_status',
  [...EQUIPMENT_DELETE_REQUEST_STATUS_VALUES],
);

// RecipeVisibility alias is unchanged — it derives from the enum object
export type RecipeVisibility = typeof visibilityEnum.enumValues[number];

// ── All table definitions and relations below this line are unchanged ─────────
```

---

### Step 10 — Run full verification

```bash
deno task db:generate   # Must produce a NO-OP migration (enum values unchanged)
deno task db:migrate    # Apply only if a migration was generated
deno task check         # Zero type errors across all workspaces
deno task lint          # No new warnings
deno task test          # All existing tests pass
```

**If `db:generate` produces a non-empty migration**, stop and investigate before proceeding. A value change (e.g. any lingering DateFormat slash/dash value in the constants) would cause Drizzle to emit a destructive `ALTER TYPE` migration.

---

## Testing Strategy

**Enum consistency test** — add to `packages/shared/src/constants/enums.test.ts` (new file):

```typescript
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { BREW_METHODS, BREW_METHOD_VALUES } from './brew-methods.ts';
import { DRINK_TYPES, DRINK_TYPE_VALUES } from './drink-types.ts';
import { VISIBILITY_STATES, VISIBILITY_VALUES } from './visibility.ts';
import { EMOJI_TAGS, EMOJI_TAG_VALUES } from './emoji-tags.ts';
import { BADGE_RULES, BADGE_RULE_VALUES } from './badges.ts';

describe('Enum single-source-of-truth: _VALUES tuples match rich objects', () => {
  it('BREW_METHOD_VALUES matches BREW_METHODS', () => {
    expect([...BREW_METHOD_VALUES].sort())
      .toEqual(BREW_METHODS.map((m) => m.value).sort());
  });

  it('DRINK_TYPE_VALUES matches DRINK_TYPES', () => {
    expect([...DRINK_TYPE_VALUES].sort())
      .toEqual(DRINK_TYPES.map((d) => d.value).sort());
  });

  it('VISIBILITY_VALUES matches VISIBILITY_STATES', () => {
    expect([...VISIBILITY_VALUES].sort())
      .toEqual(VISIBILITY_STATES.map((s) => s.value).sort());
  });

  it('EMOJI_TAG_VALUES matches EMOJI_TAGS keys', () => {
    expect([...EMOJI_TAG_VALUES].sort())
      .toEqual(EMOJI_TAGS.map((t) => t.key).sort());
  });

  it('BADGE_RULE_VALUES matches BADGE_RULES rules', () => {
    expect([...BADGE_RULE_VALUES].sort())
      .toEqual(BADGE_RULES.map((b) => b.rule).sort());
  });
});
```

**Other verification:**
- `make check` / `deno task check` — zero errors
- `make lint` / `deno task lint` — no new warnings
- `deno task test` — all existing tests pass
- Manual: update a user's date format preference via the API and verify the round-trip succeeds with `'DD_MM_YYYY'`

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| DateFormat data migration | **High if feature was live** | Run audit query before deploying Step 1; write migration if rows found |
| `db:generate` produces non-empty migration | Medium | Verify no-op before committing; investigate immediately if not |
| Import path changes break compilation | Low | `deno task check` catches all errors before merge |
| Dependency direction change (`db` → `shared`) | Low | This direction is architecturally correct; shared has no dependency on db |
| Aliased re-exports confuse IDE tooling | Low | Most language servers resolve through aliases correctly |

---

## Summary of All Changes vs. Previous Plan Version

| Item | Previous plan | This plan (corrected) |
|------|--------------|----------------------|
| Drift found | DateFormat | DateFormat ✅ (confirmed as only active drift) |
| D06 DrinkType note | Listed as unresolved | Removed — already fixed in main branch |
| `AdditionalPreparationType` naming | Used `AdditionalPreparationType` | Corrected to `AdditionalPreparationCategory` (existing TS convention) |
| `BadgeRule` naming | Used `BadgeRuleValue` | Corrected to `BadgeRule` (existing TS type name) |
| `EmojiTag` key field | Referenced as `value` | Corrected to `key` (actual field name in EMOJI_TAGS) |
| `EQUIPMENT_TYPES` / `EQUIPMENT_TYPE_LABELS` migration | Not mentioned | Moved from `brew-method-rules.ts` → new `equipment-types.ts` |
| `brew-method-rules.ts` imports | Not mentioned | Updated to import from `constants/` not `types/` |
| Missing `types/index.ts` exports | Only `EquipmentType`, `TemperatureUnit` | All five: `EquipmentType`, `Theme`, `DateFormat`, `AdditionalPreparationCategory`, `TemperatureUnit` |
| Missing `constants/index.ts` type exports | Not addressed | `BrewMethodValue`, `DrinkTypeValue`, `EmojiTagKey`, `VisibilityValue` now exported |
| `UserPreferencesSchema` default | `'YYYY_MM_DD'` | ✅ Same — confirmed correct |
| `RecipeVisibility` alias in schema.ts | Not mentioned | Preserved explicitly — it derives from Drizzle enum object, not from constants |
| Step to verify `db:generate` is a no-op | Listed only in verification | Elevated to a hard stop — investigate immediately if non-empty |