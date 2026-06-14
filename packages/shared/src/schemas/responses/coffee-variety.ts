import { z } from 'zod';

/**
 * Coffee variety Output Schema — mirrors the full `coffeeVarieties` row returned
 * by `coffee-variety/service.ts` (`model.findById`/`findMany`/`create`/`update`).
 * Several columns are Postgres `text[]` arrays (`string[]`, nullable).
 *
 * Verified against `packages/db/src/schema.ts` (`coffeeVarieties`) and
 * `apps/api/src/modules/coffee-variety/{service,model}.ts`.
 */
export const CoffeeVarietyOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  species: z.string().nullable(),
  origin: z.string().nullable(),
  spread: z.string().nullable(),
  altitudeRangeM: z.string().nullable(),
  cupProfile: z.string().nullable(),
  body: z.string().nullable(),
  acidity: z.string().nullable(),
  caffeinePct: z.string().nullable(),
  processingCompatibility: z.array(z.string()).nullable(),
  diseaseResistance: z.string().nullable(),
  yield: z.string().nullable(),
  plantSize: z.string().nullable(),
  notes: z.string().nullable(),
  subVarieties: z.array(z.string()).nullable(),
  fermentation: z.string().nullable(),
  dryingTimeDays: z.string().nullable(),
  dryingMethod: z.string().nullable(),
  mucilageRetentionPct: z.string().nullable(),
  priceRange: z.string().nullable(),
  processing: z.string().nullable(),
  typeLabel: z.string().nullable(),
  notableFarms: z.array(z.string()).nullable(),
  notableRegions: z.array(z.string()).nullable(),
  regionalVariants: z.array(z.string()).nullable(),
  globalSharePct: z.string().nullable(),
  isSystem: z.boolean(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

export type CoffeeVarietyOutput = z.infer<typeof CoffeeVarietyOutputSchema>;
