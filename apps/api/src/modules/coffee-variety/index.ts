import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppEnv } from '../../types/hono.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import {
  CoffeeVarietyCreateSchema,
  CoffeeVarietyFilterSchema,
  CoffeeVarietyUpdateSchema,
  SearchQuerySchema,
} from '@brewform/shared/schemas';
import * as service from './service.ts';
import { error, paginated, success } from '../../utils/response/index.ts';

export const deps = { authMiddleware, service };

/** Proxy that resolves authMiddleware at request time (supports test mocking via deps). */
async function authGuard(c: Context, next: Next) {
  return deps.authMiddleware(c, next);
}

const CoffeeVarietyRecipesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(12),
});

const router = new Hono<AppEnv>();

router.get('/', zValidator('query', CoffeeVarietyFilterSchema), async (c) => {
  const query = c.req.valid('query');
  const result = await deps.service.listCoffeeVarieties(query);
  return paginated(c, result.data, {
    page: query.page ?? 1,
    perPage: query.perPage ?? 20,
    total: result.total,
    totalPages: Math.ceil(result.total / (query.perPage ?? 20)),
  });
});

router.get('/search', zValidator('query', SearchQuerySchema), async (c) => {
  const { q } = c.req.valid('query');
  const result = await deps.service.listCoffeeVarieties({ search: q, page: 1, perPage: 20 });
  return success(c, result.data);
});

router.post('/', authGuard, zValidator('json', CoffeeVarietyCreateSchema), async (c) => {
  const body = c.req.valid('json');
  const userId = c.get('userId')!;
  try {
    const result = await deps.service.createCoffeeVariety(body, userId);
    return success(c, result, 201);
  } catch (e: unknown) {
    return error(c, 'BAD_REQUEST', e instanceof Error ? e.message : String(e), 400);
  }
});

router.get('/:id', async (c) => {
  const variety = await deps.service.getCoffeeVarietyById(c.req.param('id')!);
  if (!variety) {
    return error(c, 'NOT_FOUND', 'Coffee variety not found', 404);
  }
  return success(c, variety);
});

router.patch('/:id', authGuard, zValidator('json', CoffeeVarietyUpdateSchema), async (c) => {
  const body = c.req.valid('json');
  const userId = c.get('userId')!;
  try {
    const result = await deps.service.updateCoffeeVariety(c.req.param('id')!, body, userId);
    return success(c, result);
  } catch (e: unknown) {
    return error(c, 'BAD_REQUEST', e instanceof Error ? e.message : String(e), 400);
  }
});

router.delete('/:id', authGuard, async (c) => {
  const userId = c.get('userId')!;
  try {
    const result = await deps.service.deleteCoffeeVariety(c.req.param('id')!, userId);
    return success(c, result);
  } catch (e: unknown) {
    return error(c, 'BAD_REQUEST', e instanceof Error ? e.message : String(e), 400);
  }
});

router.get('/:id/recipes', zValidator('query', CoffeeVarietyRecipesQuerySchema), async (c) => {
  const query = c.req.valid('query');
  const page = query.page;
  const perPage = query.perPage;
  const result = await deps.service.getRecipesForVariety(
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
