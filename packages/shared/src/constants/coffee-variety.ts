/**
 * Coffee variety category enum — single source of truth.
 *
 * Consumed by:
 * - `packages/db/src/schema.ts` — Drizzle `pgEnum('coffee_variety_category', …)`
 * - `packages/shared/src/schemas/coffee-variety.ts` — Zod `z.enum(…)`
 * - `packages/shared/src/types/coffee-variety.ts` — `CoffeeVarietyCategory` type
 */
export const COFFEE_VARIETY_CATEGORY_VALUES = [
  'variety',
  'processing',
  'market_name',
] as const;

/** Classification of a {@link CoffeeVariety} entry. */
export type CoffeeVarietyCategory = (typeof COFFEE_VARIETY_CATEGORY_VALUES)[number];
