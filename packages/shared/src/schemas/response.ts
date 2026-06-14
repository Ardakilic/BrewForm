import { z } from 'zod';

/**
 * Shared response-envelope schemas mirroring the runtime helpers in
 * `apps/api/src/utils/response/index.ts`. These are used purely for OpenAPI
 * documentation via `hono-openapi`'s `resolver()` and never alter runtime
 * behavior.
 *
 * Note: `hono-openapi` v1 + `zod-openapi` v5 read field metadata directly from
 * the Zod schema structure — no `zod-openapi/extend` side-effect import is
 * required (and v5 no longer exports that subpath).
 */

/** Mirrors error() — { success:false, error:{ code, message, details?, requestId } }. */
export const ErrorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .optional(),
    requestId: z.string(),
  }),
});

/** Mirrors PaginationMeta in `@brewform/shared/types`. */
export const PaginationMetaSchema = z.object({
  page: z.number().int().min(1),
  perPage: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

/** Mirrors success(c, data) — { success:true, data, meta:{ requestId } }. */
export function successEnvelope<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: z.object({ requestId: z.string() }),
  });
}

/** Mirrors paginated(c, items, meta) — data is an array + meta.pagination. */
export function paginatedEnvelope<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    success: z.literal(true),
    data: z.array(itemSchema),
    meta: z.object({
      requestId: z.string(),
      pagination: PaginationMetaSchema,
    }),
  });
}
