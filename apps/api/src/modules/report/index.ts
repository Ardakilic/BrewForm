import {
  ErrorEnvelopeSchema,
  paginatedEnvelope,
  ReportCreateSchema,
  ReportFilterSchema,
  ReportOutputSchema,
  successEnvelope,
} from '@brewform/shared/schemas';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { adminMiddleware, authMiddleware } from '../../middleware/auth.ts';
import { rateLimit } from '../../middleware/rateLimit.ts';
import type { AppEnv } from '../../types/hono.ts';
import { jsonRequestBody } from '../../utils/openapi/index.ts';
import { POLICIES } from '../../utils/rate-limit/policies.ts';
import { error, paginated, success, zodValidationHook } from '../../utils/response/index.ts';
import * as service from './service.ts';

/** Hono sub-router for report endpoints, mounted at `/api/v1/reports`. */
const report = new Hono<AppEnv>();

// Report submission: `report-ip` (3 per 15 min per client IP) runs first, before
// auth and validation; `report-user` (3 per 15 min per user) right after auth.
// The admin GET / PATCH routes below are not throttled by either policy.
report.post(
  '/',
  rateLimit(POLICIES.reportIp),
  describeRoute({
    tags: ['Reports'],
    summary: 'Create a report',
    description:
      'Submits a moderation report against a recipe or comment. ' +
      'Rate-limited to 3 requests per 15 minutes per client IP and per user.',
    security: [{ bearerAuth: [] }],
    requestBody: jsonRequestBody(ReportCreateSchema),
    responses: {
      201: {
        description: 'Report created',
        content: {
          'application/json': { schema: resolver(successEnvelope(ReportOutputSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      429: {
        description: 'Rate limit exceeded (3 requests per 15 minutes)',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  rateLimit(POLICIES.reportUser),
  zValidator('json', ReportCreateSchema, zodValidationHook),
  async (c) => {
    const userId = c.get('userId') as string;
    const body = c.req.valid('json');
    const entityType = body.recipeId ? 'recipe' : 'comment';
    const entityId = (body.recipeId ?? body.commentId)!;
    const result = await service.createReport(userId, entityType, entityId, body.reason);
    return success(c, result, 201);
  },
);

report.get(
  '/',
  describeRoute({
    tags: ['Reports'],
    summary: 'List reports',
    description: 'Paginated list of moderation reports. Admin only.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'perPage', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'status', in: 'query', required: false, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Paginated list of reports',
        content: {
          'application/json': { schema: resolver(paginatedEnvelope(ReportOutputSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Forbidden (admin only)',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  adminMiddleware,
  zValidator('query', ReportFilterSchema, zodValidationHook),
  async (c) => {
    const { page, perPage, status } = c.req.valid('query');
    const result = await service.listReports(status, page, perPage);
    return paginated(c, result.reports, {
      page,
      perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / perPage),
    });
  },
);

report.patch(
  '/:id/resolve',
  describeRoute({
    tags: ['Reports'],
    summary: 'Resolve a report',
    description: 'Marks a moderation report as resolved. Admin only.',
    security: [{ bearerAuth: [] }],
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    responses: {
      200: {
        description: 'Report resolved',
        content: {
          'application/json': { schema: resolver(successEnvelope(ReportOutputSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Forbidden (admin only)',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Report not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      409: {
        description: 'Report already resolved',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  adminMiddleware,
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    try {
      const result = await service.resolveReport(id, userId);
      return success(c, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'REPORT_NOT_FOUND') return error(c, 'NOT_FOUND', 'Report not found', 404);
      if (message === 'REPORT_ALREADY_RESOLVED') {
        return error(c, 'CONFLICT', 'Report already resolved', 409);
      }
      throw err;
    }
  },
);

export default report;
