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
import * as model from './model.ts';
import * as tasteService from '../taste/service.ts';
import { cacheProvider } from '../../utils/cache/singleton.ts';
import {
  error,
  isEmailVerified,
  paginated,
  success,
  zodValidationHook,
} from '../../utils/response/index.ts';
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
  optionalAuthMiddleware,
  zValidator('query', RecipeFilterSchema),
  async (c) => {
    const filters = c.req.valid('query');
    const userId = c.get('userId') ?? null;
    const isAdmin = (c.get('user') as any)?.isAdmin ?? false;
    const result = await service.listRecipes(
      filters,
      filters.page,
      filters.perPage,
      userId,
      isAdmin,
    );
    return paginated(c, result.recipes, {
      page: filters.page,
      perPage: filters.perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / filters.perPage),
    });
  },
);

recipe.get(
  '/starred',
  describeRoute({
    tags: ['Recipes'],
    summary: 'List starred (favourited) recipes',
    description: 'Paginated, filterable list of recipes the current user has starred.',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Paginated list of starred recipes' },
      401: { description: 'Unauthorized' },
    },
  }),
  authMiddleware,
  zValidator('query', RecipeFilterSchema),
  async (c) => {
    const userId = c.get('userId') as string;
    const filters = c.req.valid('query');
    const result = await service.listStarredRecipes(filters, filters.page, filters.perPage, userId);
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
      // Transform the Drizzle result into the shape the frontend expects:
      // - currentVersion: the latest version (versions[0])
      // - tasteNotes: flattened from currentVersion.tasteNotes[].tasteNote
      //   with resolved rootCategoryName for radar chart
      // - equipment: flattened from currentVersion.equipment[].equipment
      // - userLiked / userFavourited: actual status for the authenticated user
      const currentVersion = (r as any).versions?.[0] ?? null;
      const userId = c.get('userId');
      const recipeId = (r as any).id;
      const [rootMap, likeStatus, favouriteCount, ratingStats, userRating] = await Promise.all([
        tasteService.getTasteNoteRootMap(cacheProvider!),
        userId
          ? model.getUserLikeStatus(userId, recipeId)
          : Promise.resolve({ userLiked: false, userFavourited: false }),
        model.getFavouriteCount(recipeId),
        model.getRecipeRatingStats(recipeId),
        userId ? model.getUserRating(userId, recipeId) : Promise.resolve(null),
      ]);
      const payload = {
        ...(r as any),
        currentVersion,
        tasteNotes: currentVersion?.tasteNotes?.map((t: any) => ({
          ...t.tasteNote,
          tasteNoteId: t.tasteNote?.id,
          rootCategoryName: rootMap[t.tasteNote?.id] ?? t.tasteNote?.name,
          intensity: t.intensity ?? 1,
        })) ?? [],
        equipment: currentVersion?.equipment?.map((e: any) => ({
          ...e.equipment,
          equipmentId: e.equipmentId,
        })) ?? [],
        bean: currentVersion?.bean ?? null,
        versionCount: (r as any).versions?.length ?? 1,
        forkedFromSlug: (r as any).forkedFrom?.slug ?? null,
        userLiked: likeStatus.userLiked,
        userFavourited: likeStatus.userFavourited,
        favouriteCount,
        avgRating: ratingStats.avgRating,
        ratingCount: ratingStats.ratingCount,
        userRating,
      };
      return success(c, payload);
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
  zValidator('json', RecipeCreateSchema, zodValidationHook),
  async (c) => {
    if (!isEmailVerified(c)) {
      return error(c, 'EMAIL_NOT_VERIFIED', 'Please verify your email to perform this action', 403);
    }
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
  zValidator('json', RecipeUpdateSchema, zodValidationHook),
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
  '/:id/rate',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Rate a recipe (1–10)',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Rating saved' },
      400: { description: 'Invalid rating value' },
      404: { description: 'Recipe not found' },
    },
  }),
  authMiddleware,
  async (c) => {
    const recipeId = c.req.param('id')!;
    const userId = c.get('userId') as string;
    const body = await c.req.json().catch(() => ({}));
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
      return error(c, 'VALIDATION_ERROR', 'Rating must be an integer between 1 and 10', 400);
    }
    try {
      const result = await model.upsertUserRating(userId, recipeId, rating);
      const stats = await model.getRecipeRatingStats(recipeId);
      return success(c, { ...result, ...stats });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
      throw err;
    }
  },
);

recipe.post(
  '/:id/notes',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Save personal notes for a recipe',
    description: 'Saves personal notes to the current version of the recipe.',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Notes saved' },
      401: { description: 'Unauthorized' },
      404: { description: 'Recipe not found' },
    },
  }),
  authMiddleware,
  async (c) => {
    const recipeId = c.req.param('id')!;
    const body = await c.req.json().catch(() => ({}));
    const notes = typeof body.notes === 'string' ? body.notes : '';
    try {
      await service.saveNotes(recipeId, notes);
      return success(c, { message: 'Notes saved' });
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
