import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { BeanCreateSchema, BeanUpdateSchema, PaginationSchema } from '@brewform/shared/schemas';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { success, error, paginated } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const bean = new Hono<AppEnv>();

bean.get('/', authMiddleware, zValidator('query', PaginationSchema), async (c) => {
  const userId = c.get('userId') as string;
  const { page, perPage } = c.req.valid('query');
  const result = await service.listBeans(userId, page, perPage);
  return paginated(c, result.beans, {
    page,
    perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / perPage),
  });
});

bean.get('/:id', async (c) => {
  const id = c.req.param('id')!;
  try {
    const b = await service.getBean(id);
    return success(c, b);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'BEAN_NOT_FOUND') return error(c, 'NOT_FOUND', 'Bean not found', 404);
    throw err;
  }
});

bean.post('/', authMiddleware, zValidator('json', BeanCreateSchema), async (c) => {
  const userId = c.get('userId') as string;
  const body = c.req.valid('json');
  const b = await service.createBean(userId, body);
  return success(c, b, 201);
});

bean.patch('/:id', authMiddleware, zValidator('json', BeanUpdateSchema), async (c) => {
  const id = c.req.param('id')!;
  const userId = c.get('userId') as string;
  const body = c.req.valid('json');
  try {
    const b = await service.updateBean(userId, id, body);
    return success(c, b);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'BEAN_NOT_FOUND') return error(c, 'NOT_FOUND', 'Bean not found', 404);
    if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your bean', 403);
    throw err;
  }
});

bean.delete('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id')!;
  const userId = c.get('userId') as string;
  try {
    await service.deleteBean(userId, id);
    return success(c, { message: 'Bean deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'BEAN_NOT_FOUND') return error(c, 'NOT_FOUND', 'Bean not found', 404);
    if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your bean', 403);
    throw err;
  }
});

export default bean;