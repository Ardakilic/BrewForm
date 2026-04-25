import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { EquipmentCreateSchema, EquipmentUpdateSchema, PaginationSchema } from '@brewform/shared/schemas';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { success, error, paginated } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const equipment = new Hono<AppEnv>();

equipment.get('/', zValidator('query', PaginationSchema), async (c) => {
  const { page, perPage } = c.req.valid('query');
  const type = c.req.query('type');
  const result = await service.listEquipment(type, page, perPage);
  return paginated(c, result.items, {
    page,
    perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / perPage),
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