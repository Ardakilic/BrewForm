import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../../types/hono.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import {
  CoffeeVarietyCreateSchema,
  CoffeeVarietyFilterSchema,
  CoffeeVarietyUpdateSchema,
} from '@brewform/shared/schemas';
import * as service from './service.ts';
import { error, paginated, success } from '../../utils/response/index.ts';

const router = new Hono<AppEnv>();

router.get('/', zValidator('query', CoffeeVarietyFilterSchema), async (c) => {
  const query = c.req.valid('query');
  const result = await service.listCoffeeVarieties(query);
  return paginated(c, result.data, {
    page: query.page ?? 1,
    perPage: query.perPage ?? 20,
    total: result.total,
    totalPages: Math.ceil(result.total / (query.perPage ?? 20)),
  });
});

router.get('/search', async (c) => {
  const q = c.req.query('q');
  if (!q || q.length < 2) {
    return success(c, []);
  }
  const result = await service.listCoffeeVarieties({ search: q, page: 1, perPage: 20 });
  return success(c, result.data);
});

router.post('/', authMiddleware, zValidator('json', CoffeeVarietyCreateSchema), async (c) => {
  const body = c.req.valid('json');
  const userId = c.get('userId')!;
  try {
    const result = await service.createCoffeeVariety(body, userId);
    return success(c, result, 201);
  } catch (e: any) {
    return error(c, 'BAD_REQUEST', e.message, 400);
  }
});

router.get('/:id', async (c) => {
  const variety = await service.getCoffeeVarietyById(c.req.param('id')!);
  if (!variety) {
    return error(c, 'NOT_FOUND', 'Coffee variety not found', 404);
  }
  return success(c, variety);
});

router.patch('/:id', authMiddleware, zValidator('json', CoffeeVarietyUpdateSchema), async (c) => {
  const body = c.req.valid('json');
  const userId = c.get('userId')!;
  try {
    const result = await service.updateCoffeeVariety(c.req.param('id')!, body, userId);
    return success(c, result);
  } catch (e: any) {
    return error(c, 'BAD_REQUEST', e.message, 400);
  }
});

router.delete('/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')!;
  try {
    const result = await service.deleteCoffeeVariety(c.req.param('id')!, userId);
    return success(c, result);
  } catch (e: any) {
    return error(c, 'BAD_REQUEST', e.message, 400);
  }
});

router.get('/:id/recipes', async (c) => {
  const page = Number(c.req.query('page') || '1');
  const perPage = Number(c.req.query('perPage') || '12');
  const result = await service.getRecipesForVariety(
    c.req.param('id'),
    page,
    perPage,
  );
  return paginated(c, result.data, {
    page,
    perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / perPage),
  });
});

export default router;
