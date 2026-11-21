import { z } from 'zod';
import { COFFEE_VARIETY_CATEGORY_VALUES } from '../constants/index.ts';

/** Zod enum of coffee-variety categories; shared by the variety create and filter schemas. */
export const CoffeeVarietyCategoryEnum = z.enum(COFFEE_VARIETY_CATEGORY_VALUES);

/** Most items in one coffee-variety list field (the seed catalogue uses at most 7). */
export const COFFEE_VARIETY_LIST_MAX_ITEMS = 20;

/** Longest item of a coffee-variety list field, in characters (the seed uses at most 30). */
export const COFFEE_VARIETY_LIST_ITEM_MAX_LENGTH = 100;

/**
 * A bounded coffee-variety list field: at most {@link COFFEE_VARIETY_LIST_MAX_ITEMS} trimmed,
 * non-empty items of at most {@link COFFEE_VARIETY_LIST_ITEM_MAX_LENGTH} characters.
 */
const VarietyListSchema = z
  .array(z.string().trim().min(1).max(COFFEE_VARIETY_LIST_ITEM_MAX_LENGTH))
  .max(COFFEE_VARIETY_LIST_MAX_ITEMS);

/**
 * Validates coffee-variety creation payloads.
 * Used by POST /api/v1/coffee-varieties and POST /api/v1/admin/coffee-varieties.
 *
 * Every scalar string has a maximum length, and the five list fields (`processingCompatibility`,
 * `subVarieties`, `notableFarms`, `notableRegions`, `regionalVariants`) hold at most
 * {@link COFFEE_VARIETY_LIST_MAX_ITEMS} trimmed, non-empty items of at most
 * {@link COFFEE_VARIETY_LIST_ITEM_MAX_LENGTH} characters (the columns stay `text[]`).
 */
export const CoffeeVarietyCreateSchema = z.object({
  name: z.string().min(1).max(255),
  category: CoffeeVarietyCategoryEnum,
  species: z.string().max(255).optional(),
  origin: z.string().max(500).optional(),
  spread: z.string().max(1000).optional(),
  altitudeRangeM: z.string().max(100).optional(),
  cupProfile: z.string().max(2000).optional(),
  body: z.string().max(100).optional(),
  acidity: z.string().max(100).optional(),
  caffeinePct: z.string().max(50).optional(),
  processingCompatibility: VarietyListSchema.optional(),
  diseaseResistance: z.string().max(100).optional(),
  yield: z.string().max(100).optional(),
  plantSize: z.string().max(100).optional(),
  notes: z.string().max(5000).optional(),
  subVarieties: VarietyListSchema.optional(),
  fermentation: z.string().max(2000).optional(),
  dryingTimeDays: z.string().max(50).optional(),
  dryingMethod: z.string().max(1000).optional(),
  mucilageRetentionPct: z.string().max(50).optional(),
  priceRange: z.string().max(100).optional(),
  processing: z.string().max(255).optional(),
  typeLabel: z.string().max(255).optional(),
  notableFarms: VarietyListSchema.optional(),
  notableRegions: VarietyListSchema.optional(),
  regionalVariants: VarietyListSchema.optional(),
  globalSharePct: z.string().max(50).optional(),
});

/**
 * Validates partial coffee-variety update payloads (the create bounds, every field optional).
 * Used by PATCH /api/v1/coffee-varieties/:id and PATCH /api/v1/admin/coffee-varieties/:id.
 */
export const CoffeeVarietyUpdateSchema = CoffeeVarietyCreateSchema.partial();

/**
 * Validates coffee-variety list query params (category, search, pagination).
 * Used by GET /api/v1/coffee-varieties.
 */
export const CoffeeVarietyFilterSchema = z.object({
  category: CoffeeVarietyCategoryEnum.optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
});

/** Inferred TypeScript type for coffee-variety creation payloads. */
export type CoffeeVarietyCreate = z.infer<typeof CoffeeVarietyCreateSchema>;
/** Inferred TypeScript type for partial coffee-variety update payloads. */
export type CoffeeVarietyUpdate = z.infer<typeof CoffeeVarietyUpdateSchema>;
