import { z } from 'zod';

/**
 * Validates bean-creation payloads.
 * Used by POST /api/v1/beans.
 */
export const BeanCreateSchema = z.object({
  name: z.string().min(1).max(200),
  brand: z.string().max(200).optional(),
  vendorId: z.uuid().optional(),
  roaster: z.string().max(200).optional(),
  roastLevel: z.string().max(100).optional(),
  processing: z.string().max(100).optional(),
  origin: z.string().max(200).optional(),
});

/**
 * Validates partial bean-update payloads.
 * Used by PATCH /api/v1/beans/:id.
 */
export const BeanUpdateSchema = BeanCreateSchema.partial();

/** Inferred TypeScript type for bean-creation payloads. */
export type BeanCreate = z.infer<typeof BeanCreateSchema>;
/** Inferred TypeScript type for partial bean-update payloads. */
export type BeanUpdate = z.infer<typeof BeanUpdateSchema>;
