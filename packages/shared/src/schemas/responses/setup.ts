import { z } from 'zod';

/**
 * Setup Output Schema — mirrors the full `setups` row returned by
 * `setup/service.ts` (`model.findById`/`create`/`update`/`setDefault`).
 *
 * Verified against `packages/db/src/schema.ts` (`setups`) and
 * `apps/api/src/modules/setup/{service,model}.ts`.
 */
export const SetupOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  userId: z.string(),
  brewerDetails: z.string().nullable(),
  grinder: z.string().nullable(),
  portafilterId: z.string().nullable(),
  basketId: z.string().nullable(),
  puckScreenId: z.string().nullable(),
  paperFilterId: z.string().nullable(),
  tamperId: z.string().nullable(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

/** Inferred type of {@link SetupOutputSchema}. */
export type SetupOutput = z.infer<typeof SetupOutputSchema>;
