import { z } from 'zod';

/**
 * Validates brew-log-creation payloads.
 * Used by POST /api/v1/brew-logs.
 */
export const BrewLogCreateSchema = z.object({
  recipeId: z.uuid(),
  recipeVersionId: z.uuid().optional(),
  brewedAt: z.string().datetime().optional(),
  yieldActual: z.number().positive().optional(),
  doseActual: z.number().positive().optional(),
  notes: z.string().max(5000).optional(),
  personalRating: z.number().int().min(1).max(10).optional(),
});

/**
 * Validates partial brew-log-update payloads.
 * Used by PATCH /api/v1/brew-logs/:id.
 */
export const BrewLogUpdateSchema = z.object({
  brewedAt: z.string().datetime().optional(),
  yieldActual: z.number().positive().nullable().optional(),
  doseActual: z.number().positive().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  personalRating: z.number().int().min(1).max(10).nullable().optional(),
}).refine(
  (data) =>
    data.brewedAt !== undefined || data.yieldActual !== undefined ||
    data.doseActual !== undefined || data.notes !== undefined ||
    data.personalRating !== undefined,
  {
    message:
      'At least one field (brewedAt, yieldActual, doseActual, notes, or personalRating) must be provided',
  },
);

/** Inferred TypeScript type for brew-log-creation payloads. */
export type BrewLogCreate = z.infer<typeof BrewLogCreateSchema>;
/** Inferred TypeScript type for partial brew-log-update payloads. */
export type BrewLogUpdate = z.infer<typeof BrewLogUpdateSchema>;
