import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute } from 'hono-openapi';
import {
  RecipeCreateSchema,
  RecipeFilterSchema,
  RecipeUpdateSchema,
} from '@brewform/shared/schemas';
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, paginated, success } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const recipe = new Hono<AppEnv>();

recipe.get(
  '/',
  describeRoute({
    tags: ['Recipes'],
    summary: 'List recipes',
    description: 'Paginated, filterable list of recipes.',
    responses: { 200: { description: 'Paginated list of recipes' } },
  }),
  zValidator('query', RecipeFilterSchema),
  async (c) => {
    const filters = c.req.valid('query');
    const result = await service.listRecipes(filters, filters.page, filters.perPage);
    return paginated(c, result.recipes, {
      page: filters.page,
      perPage: filters.perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / filters.perPage),
    });
  },
);

recipe.get(
  '/meta/:slug',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Get recipe metadata for share previews',
    description: 'Returns lightweight metadata used for OG/Twitter share cards.',
    responses: {
      200: { description: 'Recipe metadata' },
      404: { description: 'Recipe not found or not public' },
    },
  }),
  async (c) => {
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
  },
);

recipe.get(
  '/:slugOrId',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Get a recipe by slug or id',
    description: 'Drafts and private recipes are visible only to their author.',
    responses: {
      200: { description: 'Recipe payload' },
      404: { description: 'Recipe not found' },
    },
  }),
  optionalAuthMiddleware,
  async (c) => {
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
  },
);

recipe.post(
  '/',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Create a recipe',
    security: [{ bearerAuth: [] }],
    responses: {
      201: { description: 'Recipe created' },
      403: { description: 'Forbidden' },
    },
  }),
  authMiddleware,
  zValidator('json', RecipeCreateSchema),
  async (c) => {
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
  },
);

recipe.patch(
  '/:id',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Update a recipe',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Recipe updated' },
      404: { description: 'Recipe not found' },
      403: { description: 'Not the recipe owner' },
    },
  }),
  authMiddleware,
  zValidator('json', RecipeUpdateSchema),
  async (c) => {
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
  },
);

recipe.delete(
  '/:id',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Soft-delete a recipe',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Recipe deleted' },
      404: { description: 'Recipe not found' },
      403: { description: 'Not the recipe owner' },
    },
  }),
  authMiddleware,
  async (c) => {
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
  },
);

recipe.post(
  '/:id/fork',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Fork a recipe',
    description: 'Creates a copy of the source recipe owned by the calling user.',
    security: [{ bearerAuth: [] }],
    responses: {
      201: { description: 'Forked recipe created' },
      403: { description: 'Source recipe is not forkable for this user' },
      404: { description: 'Source recipe not found' },
    },
  }),
  authMiddleware,
  async (c) => {
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
  },
);

recipe.post(
  '/:id/like',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Toggle the like on a recipe',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Like state toggled' },
      404: { description: 'Recipe not found' },
    },
  }),
  authMiddleware,
  async (c) => {
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
  },
);

recipe.post(
  '/:id/favourite',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Toggle the favourite flag on a recipe',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Favourite state toggled' },
      404: { description: 'Recipe not found' },
    },
  }),
  authMiddleware,
  async (c) => {
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
  },
);

recipe.post(
  '/:id/feature',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Toggle the featured flag on a recipe',
    description: 'Owner-only: marks a recipe as featured on the author profile.',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Featured state toggled' },
      404: { description: 'Recipe not found' },
      403: { description: 'Not the recipe owner' },
    },
  }),
  authMiddleware,
  async (c) => {
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
  },
);

export default recipe;
