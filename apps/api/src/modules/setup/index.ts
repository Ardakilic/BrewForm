import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { SetupCreateSchema, SetupUpdateSchema, PaginationSchema } from '@brewform/shared/schemas';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { success, error, paginated } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const setup = new Hono<AppEnv>();

setup.get('/', authMiddleware, zValidator('query', PaginationSchema), async (c) => {
  const userId = c.get('userId') as string;
  const { page, perPage } = c.req.valid('query');
  const result = await service.listSetups(userId, page, perPage);
  return paginated(c, result.setups, {
    page,
    perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / perPage),
  });
});

setup.post('/', authMiddleware, zValidator('json', SetupCreateSchema), async (c) => {
  const userId = c.get('userId') as string;
  const body = c.req.valid('json');
  const result = await service.createSetup(userId, body);
  return success(c, result, 201);
});

setup.get('/:id', async (c) => {
  const id = c.req.param('id')!;
  try {
    const s = await service.getSetup(id);
    return success(c, s);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'SETUP_NOT_FOUND') return error(c, 'NOT_FOUND', 'Setup not found', 404);
    throw err;
  }
});

setup.patch('/:id', authMiddleware, zValidator('json', SetupUpdateSchema), async (c) => {
  const id = c.req.param('id')!;
  const userId = c.get('userId') as string;
  const body = c.req.valid('json');
  try {
    const s = await service.updateSetup(userId, id, body);
    return success(c, s);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'SETUP_NOT_FOUND') return error(c, 'NOT_FOUND', 'Setup not found', 404);
    if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your setup', 403);
    throw err;
  }
});

setup.delete('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id')!;
  const userId = c.get('userId') as string;
  try {
    await service.deleteSetup(userId, id);
    return success(c, { message: 'Setup deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'SETUP_NOT_FOUND') return error(c, 'NOT_FOUND', 'Setup not found', 404);
    if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your setup', 403);
    throw err;
  }
});

setup.post('/:id/set-default', authMiddleware, async (c) => {
  const id = c.req.param('id')!;
  const userId = c.get('userId') as string;
  try {
    const s = await service.setDefault(userId, id);
    return success(c, s);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'SETUP_NOT_FOUND') return error(c, 'NOT_FOUND', 'Setup not found', 404);
    if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your setup', 403);
    throw err;
  }
});

export default setup;