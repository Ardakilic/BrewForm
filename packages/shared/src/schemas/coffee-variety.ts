import { z } from 'zod';
import { COFFEE_VARIETY_CATEGORY_VALUES } from '../constants/index.ts';

/** Zod enum of coffee-variety categories; shared by the variety create and filter schemas. */
export const CoffeeVarietyCategoryEnum = z.enum(COFFEE_VARIETY_CATEGORY_VALUES);

/**
 * Validates coffee-variety creation payloads.
 * Used by POST /api/v1/coffee-varieties and POST /api/v1/admin/coffee-varieties.
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
  processingCompatibility: z.array(z.string()).optional(),
  diseaseResistance: z.string().max(100).optional(),
  yield: z.string().max(100).optional(),
  plantSize: z.string().max(100).optional(),
  notes: z.string().max(5000).optional(),
  subVarieties: z.array(z.string()).optional(),
  fermentation: z.string().max(2000).optional(),
  dryingTimeDays: z.string().max(50).optional(),
  dryingMethod: z.string().max(1000).optional(),
  mucilageRetentionPct: z.string().max(50).optional(),
  priceRange: z.string().max(100).optional(),
  processing: z.string().max(255).optional(),
  typeLabel: z.string().max(255).optional(),
  notableFarms: z.array(z.string()).optional(),
  notableRegions: z.array(z.string()).optional(),
  regionalVariants: z.array(z.string()).optional(),
  globalSharePct: z.string().max(50).optional(),
});

/**
 * Validates partial coffee-variety update payloads.
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
