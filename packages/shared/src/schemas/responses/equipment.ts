import { z } from 'zod';
import { RecipeWithAuthorOutputSchema } from './recipe.ts';

/**
 * Equipment Output Schemas.
 *
 * `EquipmentOutputSchema` mirrors the full `equipment` row.
 * `EquipmentDeleteRequestOutputSchema` mirrors the full `equipmentDeleteRequests`
 * row from `createDeleteRequest`.
 *
 * Two routes return **bespoke** envelopes (no `meta` wrapper), matching the real
 * handler returns in `equipment/index.ts`:
 *   - `GET /:id/recipes` → `c.json({ success: true, ...{ data, total } })`
 *   - `POST /:id/delete-request` → `c.json({ success: true, data }, 201)`
 *
 * `RecipeWithAuthorOutputSchema` is referenced lazily via `z.lazy` in
 * `EquipmentRecipesResponseSchema` to avoid the `recipe.ts` ↔ `equipment.ts`
 * import cycle (recipe detail now imports `EquipmentOutputSchema`).
 *
 * Verified against `packages/db/src/schema.ts` (`equipment`,
 * `equipmentDeleteRequests`) and `apps/api/src/modules/equipment/*`.
 */
export const EquipmentOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  description: z.string().nullable(),
  createdBy: z.string().nullable(),
  isSystem: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

export type EquipmentOutput = z.infer<typeof EquipmentOutputSchema>;

/** Validates a full `equipmentDeleteRequests` row; response payload for POST /api/v1/equipment/:id/delete-request. */
export const EquipmentDeleteRequestOutputSchema = z.object({
  id: z.string(),
  equipmentId: z.string(),
  requestedById: z.string(),
  reason: z.string().nullable(),
  status: z.string(),
  reviewedById: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
});

export type EquipmentDeleteRequestOutput = z.infer<typeof EquipmentDeleteRequestOutputSchema>;

/** Bespoke envelope for `POST /:id/delete-request` (201, no `meta`). */
export const EquipmentDeleteRequestResponseSchema = z.object({
  success: z.literal(true),
  data: EquipmentDeleteRequestOutputSchema,
});

export type EquipmentDeleteRequestResponse = z.infer<typeof EquipmentDeleteRequestResponseSchema>;

/** Bespoke envelope for `GET /:id/recipes` (200, `total` instead of `meta`). */
export const EquipmentRecipesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(z.lazy(() => RecipeWithAuthorOutputSchema)),
  total: z.number().int(),
});

export type EquipmentRecipesResponse = z.infer<typeof EquipmentRecipesResponseSchema>;
