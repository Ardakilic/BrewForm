import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { RecipeCreateSchema, RecipeUpdateSchema, RecipeFilterSchema } from '@brewform/shared/schemas';
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { success, error, paginated } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const recipe = new Hono<AppEnv>();

recipe.get('/', zValidator('query', RecipeFilterSchema), async (c) => {
  const filters = c.req.valid('query');
  const result = await service.listRecipes(filters, filters.page, filters.perPage);
  return paginated(c, result.recipes, {
    page: filters.page,
    perPage: filters.perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / filters.perPage),
  });
});

recipe.get('/meta/:slug', async (c) => {
  const slug = c.req.param('slug')!;
  try {
    const meta = await service.getRecipeMeta(slug);
    if (meta.visibility !== 'public') {
      return error(c, 'NOT_FOUND', 'Recipe not found', 404);
    }
    return success(c, meta);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
    throw err;
  }
});

recipe.get('/:slugOrId', optionalAuthMiddleware, async (c) => {
  const slugOrId = c.req.param('slugOrId')!;
  try {
    const r = await service.getRecipe(slugOrId);
    if (r.visibility === 'draft' || r.visibility === 'private') {
      const userId = c.get('userId');
      if (userId !== r.authorId) return error(c, 'NOT_FOUND', 'Recipe not found', 404);
    }
    return success(c, r);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
    throw err;
  }
});

recipe.post('/', authMiddleware, zValidator('json', RecipeCreateSchema), async (c) => {
  const authorId = c.get('userId') as string;
  const body = c.req.valid('json');
  try {
    const r = await service.createRecipe(authorId, body);
    return success(c, r, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not authorized', 403);
    throw err;
  }
});

recipe.patch('/:id', authMiddleware, zValidator('json', RecipeUpdateSchema), async (c) => {
  const recipeId = c.req.param('id')!;
  const authorId = c.get('userId') as string;
  const body = c.req.valid('json');
  try {
    const r = await service.updateRecipe(recipeId, authorId, body);
    return success(c, r);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
    if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your recipe', 403);
    throw err;
  }
});

recipe.delete('/:id', authMiddleware, async (c) => {
  const recipeId = c.req.param('id')!;
  const authorId = c.get('userId') as string;
  try {
    await service.deleteRecipe(recipeId, authorId);
    return success(c, { message: 'Recipe deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
    if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your recipe', 403);
    throw err;
  }
});

recipe.post('/:id/fork', authMiddleware, async (c) => {
  const sourceId = c.req.param('id')!;
  const authorId = c.get('userId') as string;
  const body = await c.req.json().catch(() => ({}));
  try {
    const forked = await service.forkRecipe(sourceId, authorId, body.title);
    return success(c, forked, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
    if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Cannot fork this recipe', 403);
    throw err;
  }
});

recipe.post('/:id/like', authMiddleware, async (c) => {
  const recipeId = c.req.param('id')!;
  const userId = c.get('userId') as string;
  try {
    const result = await service.toggleLike(userId, recipeId);
    return success(c, result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
    throw err;
  }
});

recipe.post('/:id/favourite', authMiddleware, async (c) => {
  const recipeId = c.req.param('id')!;
  const userId = c.get('userId') as string;
  try {
    const result = await service.toggleFavourite(userId, recipeId);
    return success(c, result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
    throw err;
  }
});

recipe.post('/:id/feature', authMiddleware, async (c) => {
  const recipeId = c.req.param('id')!;
  const userId = c.get('userId') as string;
  try {
    const result = await service.toggleFeature(recipeId, userId);
    return success(c, result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
    if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your recipe', 403);
    throw err;
  }
});

export default recipe;