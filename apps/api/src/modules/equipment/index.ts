import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  EquipmentCreateSchema,
  EquipmentDeleteRequestSchema,
  EquipmentFilterSchema,
  EquipmentUpdateSchema,
  PaginationSchema,
  SearchQuerySchema,
} from '@brewform/shared/schemas';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, paginated, success, zodValidationHook } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

export const deps = { authMiddleware, service };

/** Proxy that resolves authMiddleware at request time (supports test mocking via deps). */
async function authGuard(c: Context, next: Next) {
  return deps.authMiddleware(c, next);
}

const equipment = new Hono<AppEnv>();

equipment.get('/', zValidator('query', EquipmentFilterSchema), async (c) => {
  const query = c.req.valid('query');
  const result = await deps.service.listEquipmentWithFilters(query);
  return paginated(c, result.items, {
    page: query.page,
    perPage: query.perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / query.perPage),
  });
});

equipment.get('/search', zValidator('query', SearchQuerySchema), async (c) => {
  const { q } = c.req.valid('query');
  const results = await deps.service.searchEquipment(q);
  return success(c, results);
});

equipment.post('/', authGuard, zValidator('json', EquipmentCreateSchema), async (c) => {
  const userId = c.get('userId') as string;
  const body = c.req.valid('json');
  const item = await deps.service.createEquipment(userId, body);
  return success(c, item, 201);
});

equipment.get('/:id/recipes', zValidator('query', PaginationSchema), async (c) => {
  const id = c.req.param('id')!;
  const { page, perPage } = c.req.valid('query');
  const result = await deps.service.getRecipesForEquipment(id, page, perPage);
  return c.json({ success: true, ...result });
});

equipment.post(
  '/:id/delete-request',
  authGuard,
  zValidator('query', EquipmentDeleteRequestSchema, zodValidationHook),
  async (c) => {
    const userId = c.get('userId') as string;
    const { reason } = c.req.valid('query');
    try {
      const result = await deps.service.requestEquipmentDeletion(
        c.req.param('id')!,
        userId,
        reason ?? undefined,
      );
      return c.json({ success: true, data: result }, 201);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === 'EQUIPMENT_NOT_FOUND') {
        return error(c, 'NOT_FOUND', 'Equipment not found', 404);
      }
      throw e;
    }
  },
);

equipment.get('/:id', async (c) => {
  const id = c.req.param('id')!;
  try {
    const item = await deps.service.getEquipment(id);
    return success(c, item);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'EQUIPMENT_NOT_FOUND') return error(c, 'NOT_FOUND', 'Equipment not found', 404);
    throw err;
  }
});

equipment.patch('/:id', authGuard, zValidator('json', EquipmentUpdateSchema), async (c) => {
  const id = c.req.param('id')!;
  const userId = c.get('userId') as string;
  const body = c.req.valid('json');
  try {
    const item = await deps.service.updateEquipment(userId, id, body);
    return success(c, item);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'EQUIPMENT_NOT_FOUND') return error(c, 'NOT_FOUND', 'Equipment not found', 404);
    if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your equipment', 403);
    throw err;
  }
});

equipment.delete('/:id', authGuard, async (c) => {
  const id = c.req.param('id')!;
  const userId = c.get('userId') as string;
  try {
    await deps.service.deleteEquipment(userId, id);
    return success(c, { message: 'Equipment deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'EQUIPMENT_NOT_FOUND') return error(c, 'NOT_FOUND', 'Equipment not found', 404);
    if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your equipment', 403);
    throw err;
  }
});

export default equipment;
