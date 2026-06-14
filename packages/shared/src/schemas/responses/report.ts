import { z } from 'zod';

/**
 * Report Output Schema — mirrors the full `reports` row returned by
 * `report/service.ts` (`model.create`/`findMany`/`resolve`).
 *
 * Verified against `packages/db/src/schema.ts` (`reports`) and
 * `apps/api/src/modules/report/{service,model}.ts`.
 */
export const ReportOutputSchema = z.object({
  id: z.string(),
  reporterId: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  reason: z.string(),
  status: z.string(),
  resolvedAt: z.string().nullable(),
  resolvedBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ReportOutput = z.infer<typeof ReportOutputSchema>;
