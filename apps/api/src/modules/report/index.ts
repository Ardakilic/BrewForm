import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { PaginationSchema } from '@brewform/shared/schemas';
import { z } from 'zod';
import { authMiddleware, adminMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { success, error, paginated } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const ReportCreateSchema = z.object({
  entityType: z.enum(['recipe', 'comment', 'user']),
  entityId: z.string().uuid(),
  reason: z.string().min(1).max(2000),
});

const report = new Hono<AppEnv>();

report.post('/', authMiddleware, zValidator('json', ReportCreateSchema), async (c) => {
  const userId = c.get('userId') as string;
  const body = c.req.valid('json');
  const result = await service.createReport(userId, body.entityType, body.entityId, body.reason);
  return success(c, result, 201);
});

report.get('/', authMiddleware, adminMiddleware, zValidator('query', PaginationSchema), async (c) => {
  const { page, perPage } = c.req.valid('query');
  const status = c.req.query('status');
  const result = await service.listReports(status, page, perPage);
  return paginated(c, result.reports, {
    page,
    perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / perPage),
  });
});

report.patch('/:id/resolve', authMiddleware, adminMiddleware, async (c) => {
  const id = c.req.param('id')!;
  const userId = c.get('userId') as string;
  try {
    const result = await service.resolveReport(id, userId);
    return success(c, result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'REPORT_NOT_FOUND') return error(c, 'NOT_FOUND', 'Report not found', 404);
    if (message === 'REPORT_ALREADY_RESOLVED') return error(c, 'CONFLICT', 'Report already resolved', 409);
    throw err;
  }
});

export default report;