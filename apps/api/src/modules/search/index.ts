import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { SearchSchema } from '@brewform/shared/schemas';
import { optionalAuthMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, paginated } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const search = new Hono<AppEnv>();

search.get(
  '/',
  optionalAuthMiddleware,
  zValidator('query', SearchSchema),
  async (c) => {
    const filters = c.req.valid('query');
    const { page, perPage } = filters;
    const _sortBy = filters.sortBy;
    const _sortOrder = filters.sortOrder;
    const userId = c.get('userId');

    if (userId === null) {
      filters.visibility = 'public';
    } else if (
      filters.visibility === 'private' || filters.visibility === 'draft'
    ) {
      if (filters.authorId !== userId) {
        return error(
          c,
          'FORBIDDEN',
          'Private and draft recipes can only be searched by their author',
          403,
        );
      }
    }

    const result = await service.search(filters, page, perPage);
    return paginated(c, result.recipes, {
      page,
      perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / perPage),
    });
  },
);

export default search;
