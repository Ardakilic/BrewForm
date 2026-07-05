import { z } from 'zod';

/**
 * Validates vendor-creation payloads.
 * Used by POST /api/v1/vendors and POST /api/v1/admin/vendors.
 */
export const VendorCreateSchema = z.object({
  name: z.string().min(1).max(200),
  website: z.url().optional().or(z.literal('')),
  description: z.string().max(1000).optional(),
});

/**
 * Validates partial vendor-update payloads.
 * Used by PATCH /api/v1/vendors/:id and PATCH /api/v1/admin/vendors/:id.
 */
export const VendorUpdateSchema = VendorCreateSchema.partial();

/** Inferred TypeScript type for vendor-creation payloads. */
export type VendorCreate = z.infer<typeof VendorCreateSchema>;
/** Inferred TypeScript type for partial vendor-update payloads. */
export type VendorUpdate = z.infer<typeof VendorUpdateSchema>;
