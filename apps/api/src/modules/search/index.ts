import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { SearchSchema } from '@brewform/shared/schemas';
import * as service from './service.ts';
import { paginated } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const search = new Hono<AppEnv>();

search.get('/', zValidator('query', SearchSchema), async (c) => {
  const filters = c.req.valid('query');
  const { page, perPage } = filters;
  const _sortBy = filters.sortBy;
  const _sortOrder = filters.sortOrder;
  const result = await service.search(filters, page, perPage);
  return paginated(c, result.recipes, {
    page,
    perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / perPage),
  });
});

export default search;
