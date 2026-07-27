import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute, resolver } from 'hono-openapi';
import { ReportCreateSchema, ReportFilterSchema } from '@brewform/shared/schemas';
import {
  ErrorEnvelopeSchema,
  paginatedEnvelope,
  ReportOutputSchema,
  successEnvelope,
} from '@brewform/shared/schemas';
import { adminMiddleware, authMiddleware } from '../../middleware/auth.ts';
import { rateLimitMiddleware } from '../../middleware/rateLimit.ts';
import * as service from './service.ts';
import { error, paginated, success, zodValidationHook } from '../../utils/response/index.ts';
import { jsonRequestBody } from '../../utils/openapi/index.ts';
import type { AppEnv } from '../../types/hono.ts';

/** Hono sub-router for report endpoints, mounted at `/api/v1/reports`. */
const report = new Hono<AppEnv>();

/** Per-IP rate limit for report submission: 3 requests per 15 minutes. */
const REPORT_RATE_LIMIT_WINDOW_MS = 15 * 60_000;
const REPORT_RATE_LIMIT_MAX_REQUESTS = 3;
const REPORT_RATE_LIMIT_KEY_PREFIX = 'report';

report.post(
  '/',
  rateLimitMiddleware({
    windowMs: REPORT_RATE_LIMIT_WINDOW_MS,
    maxRequests: REPORT_RATE_LIMIT_MAX_REQUESTS,
    keyPrefix: REPORT_RATE_LIMIT_KEY_PREFIX,
  }),
  describeRoute({
    tags: ['Reports'],
    summary: 'Create a report',
    description:
      `Submits a moderation report against a recipe or comment. Rate-limited to ${REPORT_RATE_LIMIT_MAX_REQUESTS} requests per ${
        REPORT_RATE_LIMIT_WINDOW_MS / 60_000
      } minutes per IP.`,
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
        description: `Rate limit exceeded (${REPORT_RATE_LIMIT_MAX_REQUESTS} requests per ${
          REPORT_RATE_LIMIT_WINDOW_MS / 60_000
        } minutes)`,
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
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
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
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
