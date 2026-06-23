import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import {
  cursorEnvelope,
  ErrorEnvelopeSchema,
  FeedRecipeOutputSchema,
  paginatedEnvelope,
  RecipeCreateSchema,
  RecipeDetailOutputSchema,
  RecipeFilterSchema,
  RecipeForkSchema,
  RecipeNotesSchema,
  RecipeRateSchema,
  RecipeUpdateSchema,
  successEnvelope,
} from '@brewform/shared/schemas';
import { jsonRequestBody } from '../../utils/openapi/index.ts';
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import * as model from './model.ts';
import * as tasteService from '../taste/service.ts';
import { cacheProvider } from '../../utils/cache/singleton.ts';
import {
  cursorPaginated,
  error,
  invalidCursor,
  isEmailVerified,
  paginated,
  success,
  zodValidationHook,
} from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

export const deps = { authMiddleware };

/** Proxy that resolves authMiddleware at request time (supports test mocking via deps). */
async function authGuard(c: Context, next: Next) {
  return deps.authMiddleware(c, next);
}

const recipe = new Hono<AppEnv>();

recipe.get(
  '/',
  describeRoute({
    tags: ['Recipes'],
    summary: 'List recipes',
    description:
      'Paginated, filterable list of recipes. Supports cursor-based pagination when `cursor` is provided with `sortBy=createdAt`. When offset pagination is active, `meta.pagination` replaces `meta.cursor`.',
    parameters: [
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'perPage', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'sortBy', in: 'query', required: false, schema: { type: 'string' } },
      { name: 'sortOrder', in: 'query', required: false, schema: { type: 'string' } },
      { name: 'cursor', in: 'query', required: false, schema: { type: 'string' } },
      { name: 'includeTotal', in: 'query', required: false, schema: { type: 'boolean' } },
      {
        name: 'tasteNoteId',
        in: 'query',
        required: false,
        deprecated: true,
        description: 'Deprecated. Use tasteNoteIds instead. See D28.',
        schema: { type: 'string', format: 'uuid' },
      },
      {
        name: 'tasteNoteIds',
        in: 'query',
        required: false,
        description: 'Comma-separated taste note UUIDs (AND logic, max 10)',
        schema: { type: 'string' },
      },
    ],
    responses: {
      200: {
        description:
          'Paginated list of recipes. Returns `meta.cursor` when cursor pagination is active, or `meta.pagination` when offset pagination is active.',
        headers: {
          Deprecation: {
            schema: { type: 'string' },
            description:
              'Present (value "true") when the deprecated tasteNoteId parameter is used. See RFC 8594.',
          },
        },
        content: {
          'application/json': {
            schema: resolver(
              z.union([
                cursorEnvelope(FeedRecipeOutputSchema),
                paginatedEnvelope(FeedRecipeOutputSchema),
              ]),
            ),
          },
        },
      },
      400: {
        description: 'Invalid cursor',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  optionalAuthMiddleware,
  zValidator('query', RecipeFilterSchema),
  async (c) => {
    const filters = c.req.valid('query');
    const userId = c.get('userId') ?? null;
    const isAdmin = c.get('user')?.isAdmin ?? false;
    const requestId = c.get('requestId');
    try {
      const result = await service.listRecipes(
        filters,
        filters.page,
        filters.perPage,
        userId,
        isAdmin,
        requestId,
      );

      const depHeaders = result.deprecations?.tasteNoteId === true
        ? { headers: { Deprecation: 'true' } }
        : undefined;

      if ('hasMore' in result) {
        return cursorPaginated(
          c,
          result.recipes,
          {
            nextCursor: result.nextCursor,
            hasMore: result.hasMore,
            total: result.total,
          },
          depHeaders,
        );
      }

      return paginated(
        c,
        result.recipes,
        {
          page: filters.page,
          perPage: filters.perPage,
          total: result.total,
          totalPages: Math.ceil(result.total / filters.perPage),
        },
        depHeaders,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'VALIDATION_ERROR: INVALID_CURSOR') {
        return invalidCursor(c);
      }
      throw err;
    }
  },
);

recipe.get(
  '/starred',
  describeRoute({
    tags: ['Recipes'],
    summary: 'List starred (favourited) recipes',
    description: 'Paginated, filterable list of recipes the current user has starred.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'perPage', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'sortBy', in: 'query', required: false, schema: { type: 'string' } },
      { name: 'sortOrder', in: 'query', required: false, schema: { type: 'string' } },
      {
        name: 'tasteNoteId',
        in: 'query',
        required: false,
        deprecated: true,
        description: 'Deprecated. Use tasteNoteIds instead. See D28.',
        schema: { type: 'string', format: 'uuid' },
      },
      {
        name: 'tasteNoteIds',
        in: 'query',
        required: false,
        description: 'Comma-separated taste note UUIDs (AND logic, max 10)',
        schema: { type: 'string' },
      },
    ],
    responses: {
      200: {
        description: 'Paginated list of starred recipes',
        headers: {
          Deprecation: {
            schema: { type: 'string' },
            description:
              'Present (value "true") when the deprecated tasteNoteId parameter is used. See RFC 8594.',
          },
        },
        content: {
          'application/json': {
            schema: resolver(paginatedEnvelope(FeedRecipeOutputSchema)),
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  zValidator('query', RecipeFilterSchema),
  async (c) => {
    const userId = c.get('userId') as string;
    const filters = c.req.valid('query');
    const requestId = c.get('requestId');
    const result = await service.listStarredRecipes(
      filters,
      filters.page,
      filters.perPage,
      userId,
      requestId,
    );
    return paginated(
      c,
      result.recipes,
      {
        page: filters.page,
        perPage: filters.perPage,
        total: result.total,
        totalPages: Math.ceil(result.total / filters.perPage),
      },
      result.deprecations?.tasteNoteId === true ? { headers: { Deprecation: 'true' } } : undefined,
    );
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
  '/:slug/versions',
  describeRoute({
    tags: ['Recipes'],
    summary: 'List recipe version history',
    description:
      'Returns recipe title, slug, and all versions ordered by version number descending.',
    responses: {
      200: { description: 'Version history payload' },
      404: { description: 'Recipe not found' },
    },
  }),
  optionalAuthMiddleware,
  async (c) => {
    const { slug } = c.req.param();
    try {
      const recipe = await service.getRecipe(slug);
      if (!recipe) return error(c, 'NOT_FOUND', 'Recipe not found', 404);
      if (recipe.visibility === 'draft' || recipe.visibility === 'private') {
        const userId = c.get('userId');
        if (userId !== recipe.authorId) return error(c, 'NOT_FOUND', 'Recipe not found', 404);
      }
      const versions = await model.getVersionsByRecipeId(recipe.id);
      return success(c, {
        id: recipe.id,
        title: recipe.title,
        slug: recipe.slug,
        versions,
      });
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
      const currentVersion = r.versions?.[0] ?? null;
      const userId = c.get('userId');
      const recipeId = r.id;
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
        ...r,
        currentVersion,
        tasteNotes: currentVersion?.tasteNotes?.map((t) => ({
          ...t.tasteNote,
          tasteNoteId: t.tasteNote?.id,
          rootCategoryName: rootMap[t.tasteNote?.id] ?? t.tasteNote?.name,
          intensity: t.intensity ?? 1,
        })) ?? [],
        equipment: currentVersion?.equipment?.map((e) => ({
          ...e.equipment,
          equipmentId: e.equipmentId,
        })) ?? [],
        bean: currentVersion?.bean ?? null,
        versionCount: r.versions?.length ?? 1,
        forkedFromSlug: r.forkedFrom?.slug ?? null,
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
    description: 'Creates a recipe with its first version and all child relations.',
    security: [{ bearerAuth: [] }],
    requestBody: jsonRequestBody(RecipeCreateSchema),
    responses: {
      201: {
        description: 'Recipe created',
        content: {
          'application/json': {
            schema: resolver(successEnvelope(RecipeDetailOutputSchema)),
          },
        },
      },
      400: {
        description: 'Validation error',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Forbidden (email not verified or not authorized)',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
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
  authGuard,
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
  authGuard,
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
  authGuard,
  zValidator('json', RecipeForkSchema, zodValidationHook),
  async (c) => {
    const sourceId = c.req.param('id')!;
    const authorId = c.get('userId') as string;
    const body = c.req.valid('json');
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
  authGuard,
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
  authGuard,
  zValidator('json', RecipeRateSchema, zodValidationHook),
  async (c) => {
    const recipeId = c.req.param('id')!;
    const userId = c.get('userId') as string;
    const { rating } = c.req.valid('json');
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
  authGuard,
  zValidator('json', RecipeNotesSchema, zodValidationHook),
  async (c) => {
    const recipeId = c.req.param('id')!;
    const { notes } = c.req.valid('json');
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
  authGuard,
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
  authGuard,
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
