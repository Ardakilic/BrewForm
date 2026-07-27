import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute, resolver } from 'hono-openapi';
import {
  CollectionAddRecipeSchema,
  CollectionCreateSchema,
  CollectionListFilterSchema,
  CollectionReorderSchema,
  CollectionUpdateSchema,
} from '@brewform/shared/schemas';
import {
  CollectionDetailOutputSchema,
  CollectionListItemOutputSchema,
  ErrorEnvelopeSchema,
  MessageResponseSchema,
  paginatedEnvelope,
  PublicCollectionListItemOutputSchema,
  successEnvelope,
} from '@brewform/shared/schemas';
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, paginated, success, zodValidationHook } from '../../utils/response/index.ts';
import { jsonRequestBody } from '../../utils/openapi/index.ts';
import type { AppEnv } from '../../types/hono.ts';
import type { Context, Next } from 'hono';

/** Dependency-injection proxy for test stubbing (auth middleware). */
export const deps = { authMiddleware, optionalAuthMiddleware };

/** Proxy that resolves authMiddleware at request time (supports test mocking via deps). */
function authGuard(c: Context<AppEnv>, next: Next) {
  return deps.authMiddleware(c, next);
}

/** Proxy that resolves optionalAuthMiddleware at request time (supports test mocking via deps). */
function optionalAuthGuard(c: Context<AppEnv>, next: Next) {
  return deps.optionalAuthMiddleware(c, next);
}

/** Hono sub-router for collection endpoints, mounted at `/api/v1/collections`. */
const collection = new Hono<AppEnv>();

// GET / — List my collections
collection.get(
  '/',
  describeRoute({
    tags: ['Collections'],
    summary: 'List my collections',
    description: "Paginated list of the authenticated user's collections (all visibilities).",
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      {
        name: 'perPage',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: 100 },
      },
      {
        name: 'visibility',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: ['draft', 'private', 'unlisted', 'public'] },
      },
      {
        name: 'recipeId',
        in: 'query',
        required: false,
        schema: { type: 'string' },
        description:
          'Optional recipe context — each returned collection includes `containsRecipe` flagging whether it already contains this recipe.',
      },
    ],
    responses: {
      200: {
        description: 'Paginated list of collections',
        content: {
          'application/json': {
            schema: resolver(paginatedEnvelope(CollectionListItemOutputSchema)),
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
    },
  }),
  authGuard,
  zValidator('query', CollectionListFilterSchema, zodValidationHook),
  async (c) => {
    const userId = c.get('userId') as string;
    const { page, perPage, visibility, recipeId } = c.req.valid('query');
    try {
      const result = await service.listMyCollections(userId, page, perPage, visibility, recipeId);
      return paginated(c, result.collections, {
        page,
        perPage,
        total: result.total,
        totalPages: Math.ceil(result.total / perPage),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your collection', 403);
      throw err;
    }
  },
);

// GET /public — Browse all public collections (global, unauthenticated)
collection.get(
  '/public',
  describeRoute({
    tags: ['Collections'],
    summary: 'Browse all public collections',
    description: 'Paginated list of all public collections across all users.',
    security: [],
    parameters: [
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      {
        name: 'perPage',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: 100 },
      },
    ],
    responses: {
      200: {
        description: 'Paginated list of public collections',
        content: {
          'application/json': {
            schema: resolver(paginatedEnvelope(PublicCollectionListItemOutputSchema)),
          },
        },
      },
      400: {
        description: 'Validation error',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  optionalAuthGuard,
  zValidator('query', CollectionListFilterSchema, zodValidationHook),
  async (c) => {
    const { page, perPage } = c.req.valid('query');
    const result = await service.listAllPublicCollections(page, perPage);
    return paginated(c, result.collections, {
      page,
      perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / perPage),
    });
  },
);

// GET /:id — Get a collection
collection.get(
  '/:id',
  describeRoute({
    tags: ['Collections'],
    summary: 'Get a collection',
    description:
      'Fetch a single collection by ID. Public/unlisted collections are visible to all; private/draft only to the owner.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Collection detail',
        content: {
          'application/json': { schema: resolver(successEnvelope(CollectionDetailOutputSchema)) },
        },
      },
      403: {
        description: 'Forbidden — collection is private/draft',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Collection not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  optionalAuthGuard,
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string | null;
    try {
      const result = await service.getCollection(userId, id);
      return success(c, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'COLLECTION_NOT_FOUND') {
        return error(c, 'NOT_FOUND', 'Collection not found', 404);
      }
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your collection', 403);
      throw err;
    }
  },
);

// POST / — Create a collection
collection.post(
  '/',
  describeRoute({
    tags: ['Collections'],
    summary: 'Create a collection',
    description: 'Create a new collection owned by the authenticated user.',
    security: [{ bearerAuth: [] }],
    requestBody: jsonRequestBody(CollectionCreateSchema),
    responses: {
      201: {
        description: 'Collection created',
        content: {
          'application/json': { schema: resolver(successEnvelope(CollectionDetailOutputSchema)) },
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
    },
  }),
  authGuard,
  zValidator('json', CollectionCreateSchema, zodValidationHook),
  async (c) => {
    const userId = c.get('userId') as string;
    const body = c.req.valid('json');
    const result = await service.createCollection(userId, body);
    return success(c, result, 201);
  },
);

// PATCH /:id — Update a collection
collection.patch(
  '/:id',
  describeRoute({
    tags: ['Collections'],
    summary: 'Update a collection',
    description:
      "Update a collection's name, description, or visibility. Only the owner can update.",
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    requestBody: jsonRequestBody(CollectionUpdateSchema),
    responses: {
      200: {
        description: 'Collection updated',
        content: {
          'application/json': { schema: resolver(successEnvelope(CollectionDetailOutputSchema)) },
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
        description: 'Forbidden — not the owner',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Collection not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  zValidator('json', CollectionUpdateSchema, zodValidationHook),
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    const body = c.req.valid('json');
    try {
      const result = await service.updateCollection(userId, id, body);
      return success(c, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'COLLECTION_NOT_FOUND') {
        return error(c, 'NOT_FOUND', 'Collection not found', 404);
      }
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your collection', 403);
      throw err;
    }
  },
);

// DELETE /:id — Delete a collection
collection.delete(
  '/:id',
  describeRoute({
    tags: ['Collections'],
    summary: 'Delete a collection',
    description: 'Soft-delete a collection. Only the owner can delete.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Collection deleted',
        content: {
          'application/json': { schema: resolver(successEnvelope(MessageResponseSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Forbidden — not the owner',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Collection not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    try {
      await service.deleteCollection(userId, id);
      return success(c, { message: 'Collection deleted' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'COLLECTION_NOT_FOUND') {
        return error(c, 'NOT_FOUND', 'Collection not found', 404);
      }
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your collection', 403);
      throw err;
    }
  },
);

// POST /:id/recipes — Add a recipe to a collection
collection.post(
  '/:id/recipes',
  describeRoute({
    tags: ['Collections'],
    summary: 'Add a recipe to a collection',
    description:
      'Add a recipe to a collection. Only public recipes can be added by non-owners; any recipe can be added by its author.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    requestBody: jsonRequestBody(CollectionAddRecipeSchema),
    responses: {
      201: {
        description: 'Recipe added',
        content: {
          'application/json': { schema: resolver(successEnvelope(MessageResponseSchema)) },
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
        description: 'Forbidden — not the collection owner, or recipe is not public',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Collection or recipe not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      409: {
        description: 'Recipe already in this collection',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  zValidator('json', CollectionAddRecipeSchema, zodValidationHook),
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    const { recipeId, sortOrder } = c.req.valid('json');
    try {
      await service.addRecipeToCollection(userId, id, recipeId, sortOrder);
      return success(c, { message: 'Recipe added' }, 201);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'COLLECTION_NOT_FOUND') {
        return error(c, 'NOT_FOUND', 'Collection not found', 404);
      }
      if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
      if (message === 'FORBIDDEN') {
        return error(c, 'FORBIDDEN', 'Not your collection or recipe is not public', 403);
      }
      if (message === 'ALREADY_IN_COLLECTION') {
        return error(c, 'CONFLICT', 'Recipe already in this collection', 409);
      }
      throw err;
    }
  },
);

// DELETE /:id/recipes/:recipeId — Remove a recipe from a collection
collection.delete(
  '/:id/recipes/:recipeId',
  describeRoute({
    tags: ['Collections'],
    summary: 'Remove a recipe from a collection',
    description: 'Remove a recipe from a collection. Only the collection owner can remove recipes.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'recipeId', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Recipe removed',
        content: {
          'application/json': { schema: resolver(successEnvelope(MessageResponseSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Forbidden — not the owner',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Collection not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  async (c) => {
    const id = c.req.param('id')!;
    const recipeId = c.req.param('recipeId')!;
    const userId = c.get('userId') as string;
    try {
      await service.removeRecipeFromCollection(userId, id, recipeId);
      return success(c, { message: 'Recipe removed' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'COLLECTION_NOT_FOUND') {
        return error(c, 'NOT_FOUND', 'Collection not found', 404);
      }
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your collection', 403);
      throw err;
    }
  },
);

// PATCH /:id/reorder — Reorder recipes in a collection
collection.patch(
  '/:id/reorder',
  describeRoute({
    tags: ['Collections'],
    summary: 'Reorder recipes in a collection',
    description:
      'Reorder recipes by providing the full ordered list of item IDs. The service assigns sortOrder = array index.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    requestBody: jsonRequestBody(CollectionReorderSchema),
    responses: {
      200: {
        description: 'Collection reordered',
        content: {
          'application/json': { schema: resolver(successEnvelope(MessageResponseSchema)) },
        },
      },
      400: {
        description: 'Item IDs do not match collection contents',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Forbidden — not the owner',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Collection not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  zValidator('json', CollectionReorderSchema, zodValidationHook),
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    const { itemIds } = c.req.valid('json');
    try {
      await service.reorderCollection(userId, id, itemIds);
      return success(c, { message: 'Collection reordered' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'COLLECTION_NOT_FOUND') {
        return error(c, 'NOT_FOUND', 'Collection not found', 404);
      }
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your collection', 403);
      if (message === 'REORDER_MISMATCH') {
        return error(c, 'BAD_REQUEST', 'Item IDs do not match collection contents', 400);
      }
      throw err;
    }
  },
);

/** Hono sub-router for user-scoped collection endpoints (mounted at /api/v1/users). */
export const userCollections = new Hono<AppEnv>();

// GET /:userId/collections — List a user's public collections (or all if self)
userCollections.get(
  '/:userId/collections',
  describeRoute({
    tags: ['Collections'],
    summary: "List a user's collections",
    description:
      "Paginated list of a user's public collections. If the requester is the user themselves, all visibilities are returned.",
    parameters: [
      { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      {
        name: 'perPage',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: 100 },
      },
    ],
    responses: {
      200: {
        description: 'Paginated list of collections',
        content: {
          'application/json': {
            schema: resolver(paginatedEnvelope(CollectionListItemOutputSchema)),
          },
        },
      },
      400: {
        description: 'Validation error',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  optionalAuthGuard,
  zValidator('query', CollectionListFilterSchema, zodValidationHook),
  async (c) => {
    const targetUserId = c.req.param('userId')!;
    const requestingUserId = c.get('userId') as string | null;
    const { page, perPage } = c.req.valid('query');
    if (requestingUserId && requestingUserId === targetUserId) {
      const result = await service.listMyCollections(targetUserId, page, perPage);
      return paginated(c, result.collections, {
        page,
        perPage,
        total: result.total,
        totalPages: Math.ceil(result.total / perPage),
      });
    }
    const result = await service.listPublicCollections(targetUserId, page, perPage);
    return paginated(c, result.collections, {
      page,
      perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / perPage),
    });
  },
);

export default collection;
