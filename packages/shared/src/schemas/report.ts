// deno-lint-ignore-file no-explicit-any require-await
import { z } from 'zod';

const ReportStatusEnum = z.enum(['pending', 'reviewed', 'resolved', 'dismissed']);

/**
 * Validates report creation payloads.
 * Used by POST /api/v1/report.
 */
export const ReportCreateSchema = z.object({
  recipeId: z.uuid().optional(),
  commentId: z.uuid().optional(),
  reason: z.string().min(1).max(2000),
  type: z.enum(['spam', 'harassment', 'inappropriate', 'other']),
}).superRefine((data, ctx) => {
  if (!data.recipeId && !data.commentId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Either recipeId or commentId is required',
      path: ['recipeId'],
    });
  }
  if (data.recipeId && data.commentId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Only one of recipeId or commentId should be provided',
      path: ['recipeId'],
    });
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Only one of recipeId or commentId should be provided',
      path: ['commentId'],
    });
  }
});

/**
 * Validates report listing query parameters.
 * Used by GET /api/v1/report.
 */
export const ReportFilterSchema = z.object({
  status: ReportStatusEnum.optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
});
