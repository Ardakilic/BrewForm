import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  EquipmentCreateSchema,
  EquipmentFilterSchema,
  EquipmentUpdateSchema,
} from '@brewform/shared/schemas';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, paginated, success } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const equipment = new Hono<AppEnv>();

equipment.get('/', zValidator('query', EquipmentFilterSchema), async (c) => {
  const query = c.req.valid('query');
  const result = await service.listEquipmentWithFilters(query);
  return paginated(c, result.items, {
    page: query.page,
    perPage: query.perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / query.perPage),
  });
});

equipment.get('/search', async (c) => {
  const q = c.req.query('q') || '';
  if (q.length < 2) return success(c, []);
  const results = await service.searchEquipment(q);
  return success(c, results);
});

equipment.post('/', authMiddleware, zValidator('json', EquipmentCreateSchema), async (c) => {
  const userId = c.get('userId') as string;
  const body = c.req.valid('json');
  const item = await service.createEquipment(userId, body);
  return success(c, item, 201);
});

equipment.get('/:id/recipes', async (c) => {
  const id = c.req.param('id')!;
  const page = Number(c.req.query('page') || '1');
  const perPage = Number(c.req.query('perPage') || '12');
  const result = await service.getRecipesForEquipment(id, page, perPage);
  return c.json({ success: true, ...result });
});

equipment.post('/:id/delete-request', authMiddleware, async (c) => {
  const userId = c.get('userId') as string;
  const reason = c.req.query('reason');
  try {
    const result = await service.requestEquipmentDeletion(
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
});

equipment.get('/:id', async (c) => {
  const id = c.req.param('id')!;
  try {
    const item = await service.getEquipment(id);
    return success(c, item);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'EQUIPMENT_NOT_FOUND') return error(c, 'NOT_FOUND', 'Equipment not found', 404);
    throw err;
  }
});

equipment.patch('/:id', authMiddleware, zValidator('json', EquipmentUpdateSchema), async (c) => {
  const id = c.req.param('id')!;
  const userId = c.get('userId') as string;
  const body = c.req.valid('json');
  try {
    const item = await service.updateEquipment(userId, id, body);
    return success(c, item);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'EQUIPMENT_NOT_FOUND') return error(c, 'NOT_FOUND', 'Equipment not found', 404);
    if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your equipment', 403);
    throw err;
  }
});

equipment.delete('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id')!;
  const userId = c.get('userId') as string;
  try {
    await service.deleteEquipment(userId, id);
    return success(c, { message: 'Equipment deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'EQUIPMENT_NOT_FOUND') return error(c, 'NOT_FOUND', 'Equipment not found', 404);
    if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your equipment', 403);
    throw err;
  }
});

export default equipment;
