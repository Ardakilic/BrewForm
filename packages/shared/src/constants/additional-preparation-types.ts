/**
 * Additional preparation category enum — single source of truth.
 *
 * Consumed by:
 * - `packages/db/src/schema.ts` — Drizzle `pgEnum('additional_preparation_type', …)`
 * - `packages/shared/src/schemas/recipe.ts` — Zod `z.enum(…)`
 * - `packages/shared/src/types/recipe.ts` — `AdditionalPreparationCategory` type
 *
 * The database enum and Zod schema use the word `type` but the TypeScript
 * convention (preserved for backward compatibility) is `Category`, since this
 * enum is used on the `type` field of an `AdditionalPreparation`.
 */
export const ADDITIONAL_PREPARATION_TYPE_VALUES = [
  'milk',
  'water',
  'syrup',
  'spice',
  'other',
] as const;

/**
 * Category of an additional preparation step (e.g. milk, syrup, spice).
 *
 * Note: named with the suffix `Category` (not `Type`) to match the existing
 * TypeScript convention in `types/recipe.ts` and to avoid shadowing the
 * built-in `Type` global.
 */
export type AdditionalPreparationCategory = (typeof ADDITIONAL_PREPARATION_TYPE_VALUES)[number];
