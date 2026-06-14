import { z } from 'zod';

/**
 * Bean Output Schema — mirrors the full `beans` row returned by
 * `bean/service.ts` (`model.create`/`findById`/`update` use `.returning()` /
 * `db.select()`), so every column is present. Nullable columns use
 * `.nullable()`. Timestamps are `z.string()` for the JSON wire shape.
 *
 * Verified against `packages/db/src/schema.ts` (`beans`) and
 * `apps/api/src/modules/bean/{service,model}.ts`.
 */
export const BeanOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  vendorId: z.string().nullable(),
  roaster: z.string().nullable(),
  roastLevel: z.string().nullable(),
  processing: z.string().nullable(),
  origin: z.string().nullable(),
  userId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

export type BeanOutput = z.infer<typeof BeanOutputSchema>;
