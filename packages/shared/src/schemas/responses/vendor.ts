import { z } from 'zod';

/**
 * Vendor Output Schema — mirrors the full `vendors` row returned by
 * `vendor/service.ts` (`model.findById`/`create`/`update`/`search`).
 *
 * Verified against `packages/db/src/schema.ts` (`vendors`) and
 * `apps/api/src/modules/vendor/{service,model}.ts`.
 */
export const VendorOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  website: z.string().nullable(),
  description: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

/** Inferred type of {@link VendorOutputSchema}. */
export type VendorOutput = z.infer<typeof VendorOutputSchema>;
