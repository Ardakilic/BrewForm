import {
  cursorEnvelope,
  ErrorEnvelopeSchema,
  FeedRecipeOutputSchema,
  paginatedEnvelope,
  RecipeCollectionsOutputSchema,
  RecipeCreateSchema,
  RecipeDetailOutputSchema,
  RecipeFilterSchema,
  RecipeForkSchema,
  RecipeMergeSchema,
  RecipeRateSchema,
  RecipeUpdateSchema,
  successEnvelope,
  VersionDiffOutputSchema,
} from '@brewform/shared/schemas';
import { zValidator } from '@hono/zod-validator';
import type { Context, Next } from 'hono';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/auth.ts';
import type { AppEnv } from '../../types/hono.ts';
import { cacheProvider } from '../../utils/cache/singleton.ts';
import { AppError } from '../../utils/errors.ts';
import { jsonRequestBody } from '../../utils/openapi/index.ts';
import {
  cursorPaginated,
  error,
  invalidCursor,
  isEmailVerified,
  paginated,
  success,
  zodValidationHook,
} from '../../utils/response/index.ts';
import * as collectionService from '../collection/service.ts';
import * as tasteService from '../taste/service.ts';
import * as service from './service.ts';

/** Dependency-injection proxy for test stubbing (auth + optional-auth middleware). */
export const deps = { authMiddleware, optionalAuthMiddleware };

/** Proxy that resolves authMiddleware at request time (supports test mocking via deps). */
function authGuard(c: Context<AppEnv>, next: Next) {
  return deps.authMiddleware(c, next);
}

/** Proxy that resolves optionalAuthMiddleware at request time (supports test mocking via deps). */
function optionalAuthGuard(c: Context<AppEnv>, next: Next) {
  return deps.optionalAuthMiddleware(c, next);
}

/**
 * Map a service validation failure to a `400 VALIDATION_ERROR` envelope with its field
 * details: a typed `VALIDATION_ERROR` {@link AppError} (empty title, cross-field rules on merged
 * values, invalid references) or a legacy `VALIDATION_ERROR…` message.
 *
 * @param c - The request context.
 * @param err - The caught error.
 * @returns The 400 response, or `null` when `err` is not a validation failure.
 */
function validationFailure(c: Context<AppEnv>, err: unknown): Response | null {
  if (err instanceof AppError && err.code === 'VALIDATION_ERROR') {
    return error(c, 'VALIDATION_ERROR', err.message, 400, err.details);
  }
  if (err instanceof Error && err.message.startsWith('VALIDATION_ERROR')) {
    return error(c, 'VALIDATION_ERROR', 'Validation failed', 400);
  }
  return null;
}

/** Hono sub-router for recipe endpoints, mounted at `/api/v1/recipes`. */
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
      {
        name: 'perPage',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: 100 },
      },
      {
        name: 'sortBy',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: ['createdAt', 'likeCount', 'rating'] },
      },
      {
        name: 'sortOrder',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: ['asc', 'desc'] },
      },
      {
        name: 'cursor',
        in: 'query',
        required: false,
        schema: { type: 'string' },
        description: 'Base64 cursor for keyset pagination (sortBy=createdAt only)',
      },
      { name: 'includeTotal', in: 'query', required: false, schema: { type: 'boolean' } },
      {
        name: 'search',
        in: 'query',
        required: false,
        schema: { type: 'string' },
        description: 'Full-text search (ilike on title, productName, personalNotes)',
      },
      { name: 'brewMethod', in: 'query', required: false, schema: { type: 'string' } },
      { name: 'drinkType', in: 'query', required: false, schema: { type: 'string' } },
      { name: 'visibility', in: 'query', required: false, schema: { type: 'string' } },
      {
        name: 'authorId',
        in: 'query',
        required: false,
        schema: { type: 'string', format: 'uuid' },
      },
      {
        name: 'equipmentId',
        in: 'query',
        required: false,
        schema: { type: 'string', format: 'uuid' },
      },
      { name: 'mainBrewer', in: 'query', required: false, schema: { type: 'string' } },
      {
        name: 'coffeeVarietyId',
        in: 'query',
        required: false,
        schema: { type: 'string', format: 'uuid' },
      },
      // F11 new params:
      {
        name: 'author',
        in: 'query',
        required: false,
        schema: { type: 'string', maxLength: 100 },
        description: 'Author username/displayName substring (case-insensitive)',
      },
      {
        name: 'dateFrom',
        in: 'query',
        required: false,
        schema: { type: 'string', format: 'date' },
        description: 'Recipes created on or after this date (inclusive)',
      },
      {
        name: 'dateTo',
        in: 'query',
        required: false,
        schema: { type: 'string', format: 'date' },
        description: 'Recipes created on or before this date (inclusive)',
      },
      {
        name: 'minRating',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: 10 },
        description: 'Minimum average rating (1-10)',
      },
      {
        name: 'maxRating',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: 10 },
        description: 'Maximum average rating (1-10)',
      },
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

      const depHeaders =
        result.deprecations?.tasteNoteId === true
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
      if (!service.canViewRecipe(recipe, c.get('userId'))) {
        return error(c, 'NOT_FOUND', 'Recipe not found', 404);
      }
      const versions = await service.getVersionsByRecipeId(recipe.id);
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

const VersionDiffQuerySchema = z.object({
  v1: z.string().uuid(),
  v2: z.string().uuid(),
});

recipe.get(
  '/:slug/versions/diff',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Diff two versions of a recipe',
    description:
      'Returns a field-by-field comparison between two versions of the same recipe, including scalar field diffs and set diffs for taste notes and equipment.',
    parameters: [
      {
        name: 'slug',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      },
      {
        name: 'v1',
        in: 'query',
        required: true,
        description: 'UUID of the first version',
        schema: { type: 'string', format: 'uuid' },
      },
      {
        name: 'v2',
        in: 'query',
        required: true,
        description: 'UUID of the second version',
        schema: { type: 'string', format: 'uuid' },
      },
    ],
    responses: {
      200: {
        description: 'Version diff payload',
        content: {
          'application/json': {
            schema: resolver(successEnvelope(VersionDiffOutputSchema)),
          },
        },
      },
      400: {
        description: 'Missing params or same version requested',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Recipe or version not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  optionalAuthGuard,
  zValidator('query', VersionDiffQuerySchema, zodValidationHook),
  async (c) => {
    const { slug } = c.req.param();
    const { v1, v2 } = c.req.valid('query');
    try {
      const recipe = await service.getRecipe(slug);
      if (!recipe) return error(c, 'NOT_FOUND', 'Recipe not found', 404);
      if (!service.canViewRecipe(recipe, c.get('userId'), c.get('user')?.isAdmin)) {
        return error(c, 'NOT_FOUND', 'Recipe not found', 404);
      }
      const diff = await service.diffVersions(recipe.id, v1, v2);
      return success(c, diff);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
      if (message === 'SAME_VERSION') {
        return error(c, 'VALIDATION_ERROR', 'v1 and v2 must be different versions', 400);
      }
      if (message === 'VERSION_NOT_FOUND') {
        return error(c, 'VERSION_NOT_FOUND', 'Version not found for this recipe', 404);
      }
      throw err;
    }
  },
);

// NOTE: registered BEFORE the catch-all GET '/:slugOrId' so Hono matches the
// more specific path first.
recipe.get(
  '/:slugOrId/collections',
  describeRoute({
    tags: ['Recipes'],
    summary: 'List collections containing a recipe',
    description:
      "Returns the collections containing the recipe, visibility-filtered for the caller: public collections for anyone, plus the caller's own collections of any visibility (US-9/D99.5).",
    parameters: [{ name: 'slugOrId', in: 'path', required: true, schema: { type: 'string' } }],
    responses: {
      200: {
        description: 'Collections containing the recipe',
        content: {
          'application/json': { schema: resolver(successEnvelope(RecipeCollectionsOutputSchema)) },
        },
      },
      404: {
        description: 'Recipe not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  optionalAuthGuard,
  async (c) => {
    const slugOrId = c.req.param('slugOrId')!;
    try {
      const r = await service.getRecipe(slugOrId);
      // Same existence-hiding visibility gate as GET '/:slugOrId' (no admin bypass).
      if (!service.canViewRecipe(r, c.get('userId'))) {
        return error(c, 'NOT_FOUND', 'Recipe not found', 404);
      }
      const result = await collectionService.listCollectionsForRecipe(
        c.get('userId') ?? null,
        r.id,
      );
      return success(c, result);
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
      if (!service.canViewRecipe(r, c.get('userId'))) {
        return error(c, 'NOT_FOUND', 'Recipe not found', 404);
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
          ? service.getUserLikeStatus(userId, recipeId)
          : Promise.resolve({ userLiked: false, userFavourited: false }),
        service.getFavouriteCount(recipeId),
        service.getRecipeRatingStats(recipeId),
        userId ? service.getUserRating(userId, recipeId) : Promise.resolve(null),
      ]);
      const payload = {
        ...r,
        currentVersion,
        tasteNotes:
          currentVersion?.tasteNotes?.map((t) => ({
            ...t.tasteNote,
            tasteNoteId: t.tasteNote?.id,
            rootCategoryName: rootMap[t.tasteNote?.id] ?? t.tasteNote?.name,
            intensity: t.intensity ?? 1,
          })) ?? [],
        equipment:
          currentVersion?.equipment?.map((e) => ({
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
    description:
      'Creates a recipe with its first version and all child relations. `tds` is stored as a ' +
      'two-decimal string; `coffeeVarietyId` links a catalogue variety whose name is copied ' +
      'server-side; `brewRatio` and `flowRate` are derived from the measurements. Every ' +
      'referenced id (taste notes, equipment, vendor, coffee variety, and a bean owned by the ' +
      'caller) is checked before anything is written.',
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
        description:
          'Validation error: invalid body, duplicate relation ids, a title that is empty after ' +
          'sanitization, or an unknown/inaccessible referenced record (with field details)',
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
      const invalid = validationFailure(c, err);
      if (invalid) return invalid;
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not authorized', 403);
      throw err;
    }
  },
);

recipe.post(
  '/merge',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Merge two recipe versions',
    description: 'Creates a new recipe draft from selected parameters of two recipe versions.',
    security: [{ bearerAuth: [] }],
    requestBody: jsonRequestBody(RecipeMergeSchema, 'Merge selection payload'),
    responses: {
      201: {
        description: 'Merged recipe draft created',
        content: {
          'application/json': {
            schema: resolver(successEnvelope(RecipeDetailOutputSchema)),
          },
        },
      },
      400: {
        description: 'Invalid merge parameters',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      401: {
        description: 'Authentication required',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Email not verified or equipment compatibility violation',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'One or both recipe versions not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  zValidator('json', RecipeMergeSchema, zodValidationHook),
  async (c) => {
    if (!isEmailVerified(c)) {
      return error(c, 'EMAIL_NOT_VERIFIED', 'Please verify your email to perform this action', 403);
    }
    const authorId = c.get('userId') as string;
    const body = c.req.valid('json');
    try {
      const merged = await service.mergeRecipes(authorId, body);
      return success(c, merged, 201);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
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
    description:
      'Updates a recipe owned by the caller (verified email required). With `bumpVersion: false` ' +
      '(the default) the current version is amended in place; with `bumpVersion: true` a new ' +
      'version is created that carries forward every value and relation the body does not ' +
      'provide (taste notes with intensities, equipment, preparations, photos, `tds`, coffee ' +
      'variety, `isFavourite`), and `brewDate` is the body value or now. Earlier versions are ' +
      'never modified. Body semantics: an absent key keeps the stored value, `null` clears a ' +
      'clearable field, and a relation array replaces the rows (`[]` removes them all). An ' +
      'omitted `visibility` or `isFavourite` is kept. Cross-field rules are checked on the ' +
      'payload and on the merged result; referenced ids are checked before anything is written.',
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        description: 'Recipe UUID',
        schema: { type: 'string', format: 'uuid' },
      },
    ],
    requestBody: jsonRequestBody(RecipeUpdateSchema),
    responses: {
      200: {
        description: 'Recipe updated',
        content: {
          'application/json': {
            schema: resolver(successEnvelope(RecipeDetailOutputSchema)),
          },
        },
      },
      400: {
        description:
          'Validation error: invalid body, null on a required field, a cross-field violation ' +
          '(payload or merged values), an empty title, or an unknown referenced record',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      401: {
        description: 'Authentication required',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Email not verified (EMAIL_NOT_VERIFIED) or not the author (FORBIDDEN)',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Recipe not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      409: {
        description: 'Conflict with existing data',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      422: {
        description: 'Equipment incompatible with the brew method',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  zValidator('json', RecipeUpdateSchema, zodValidationHook),
  async (c) => {
    if (!isEmailVerified(c)) {
      return error(c, 'EMAIL_NOT_VERIFIED', 'Please verify your email to perform this action', 403);
    }
    const recipeId = c.req.param('id')!;
    const authorId = c.get('userId') as string;
    const body = c.req.valid('json');
    try {
      const r = await service.updateRecipe(recipeId, authorId, body);
      return success(c, r);
    } catch (err: unknown) {
      const invalid = validationFailure(c, err);
      if (invalid) return invalid;
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
      const result = await service.upsertUserRating(userId, recipeId, rating);
      const stats = await service.getRecipeRatingStats(recipeId);
      return success(c, { ...result, ...stats });
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
