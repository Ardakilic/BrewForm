import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import type { AppEnv } from '../../types/hono.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import {
  CoffeeVarietyCreateSchema,
  CoffeeVarietyFilterSchema,
  CoffeeVarietyUpdateSchema,
  SearchQuerySchema,
} from '@brewform/shared/schemas';
import {
  CoffeeVarietyOutputSchema,
  ErrorEnvelopeSchema,
  paginatedEnvelope,
  RecipeWithVersionsOutputSchema,
  successEnvelope,
} from '@brewform/shared/schemas';
import * as service from './service.ts';
import { error, paginated, success } from '../../utils/response/index.ts';
import { jsonRequestBody } from '../../utils/openapi/index.ts';

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

router.get(
  '/',
  describeRoute({
    tags: ['Coffee Varieties'],
    summary: 'List coffee varieties',
    description: 'Paginated, filterable list of coffee varieties.',
    responses: {
      200: {
        description: 'Paginated list of coffee varieties',
        content: {
          'application/json': {
            schema: resolver(paginatedEnvelope(CoffeeVarietyOutputSchema)),
          },
        },
      },
    },
  }),
  zValidator('query', CoffeeVarietyFilterSchema),
  async (c) => {
    const query = c.req.valid('query');
    const result = await deps.service.listCoffeeVarieties(query);
    return paginated(c, result.data, {
      page: query.page ?? 1,
      perPage: query.perPage ?? 20,
      total: result.total,
      totalPages: Math.ceil(result.total / (query.perPage ?? 20)),
    });
  },
);

router.get(
  '/search',
  describeRoute({
    tags: ['Coffee Varieties'],
    summary: 'Search coffee varieties',
    description: 'Returns coffee varieties matching the search query.',
    parameters: [
      { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'List of matching coffee varieties',
        content: {
          'application/json': {
            schema: resolver(successEnvelope(z.array(CoffeeVarietyOutputSchema))),
          },
        },
      },
    },
  }),
  zValidator('query', SearchQuerySchema),
  async (c) => {
    const { q } = c.req.valid('query');
    const result = await deps.service.listCoffeeVarieties({ search: q, page: 1, perPage: 20 });
    return success(c, result.data);
  },
);

router.post(
  '/',
  describeRoute({
    tags: ['Coffee Varieties'],
    summary: 'Create a coffee variety',
    description: 'Creates a coffee variety.',
    security: [{ bearerAuth: [] }],
    requestBody: jsonRequestBody(CoffeeVarietyCreateSchema),
    responses: {
      201: {
        description: 'Coffee variety created',
        content: {
          'application/json': { schema: resolver(successEnvelope(CoffeeVarietyOutputSchema)) },
        },
      },
      400: {
        description: 'Bad request',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  zValidator('json', CoffeeVarietyCreateSchema),
  async (c) => {
    const body = c.req.valid('json');
    const userId = c.get('userId')!;
    try {
      const result = await deps.service.createCoffeeVariety(body, userId);
      return success(c, result, 201);
    } catch (e: unknown) {
      return error(c, 'BAD_REQUEST', e instanceof Error ? e.message : String(e), 400);
    }
  },
);

router.get(
  '/:id',
  describeRoute({
    tags: ['Coffee Varieties'],
    summary: 'Get a coffee variety by id',
    description: 'Returns a single coffee variety by its id.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Coffee variety payload',
        content: {
          'application/json': { schema: resolver(successEnvelope(CoffeeVarietyOutputSchema)) },
        },
      },
      404: {
        description: 'Coffee variety not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  async (c) => {
    const variety = await deps.service.getCoffeeVarietyById(c.req.param('id')!);
    if (!variety) {
      return error(c, 'NOT_FOUND', 'Coffee variety not found', 404);
    }
    return success(c, variety);
  },
);

router.patch(
  '/:id',
  describeRoute({
    tags: ['Coffee Varieties'],
    summary: 'Update a coffee variety',
    description: 'Updates a coffee variety owned by the authenticated user.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    requestBody: jsonRequestBody(CoffeeVarietyUpdateSchema),
    responses: {
      200: {
        description: 'Coffee variety updated',
        content: {
          'application/json': { schema: resolver(successEnvelope(CoffeeVarietyOutputSchema)) },
        },
      },
      400: {
        description: 'Bad request',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Forbidden',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Coffee variety not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  zValidator('json', CoffeeVarietyUpdateSchema),
  async (c) => {
    const body = c.req.valid('json');
    const userId = c.get('userId')!;
    const user = c.get('user') as { isAdmin: boolean } | null;
    const isAdmin = user?.isAdmin ?? false;
    try {
      const result = await deps.service.updateCoffeeVariety(
        c.req.param('id')!,
        body,
        userId,
        undefined,
        isAdmin,
      );
      return success(c, result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === 'COFFEE_VARIETY_NOT_FOUND') {
        return error(c, 'NOT_FOUND', 'Coffee variety not found', 404);
      }
      if (message === 'SYSTEM_VARIETY_IMMUTABLE') {
        return error(c, 'FORBIDDEN', 'Cannot modify system varieties', 403);
      }
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your coffee variety', 403);
      return error(c, 'BAD_REQUEST', message, 400);
    }
  },
);

router.delete(
  '/:id',
  describeRoute({
    tags: ['Coffee Varieties'],
    summary: 'Delete a coffee variety',
    description: 'Deletes a coffee variety owned by the authenticated user.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Coffee variety deleted',
        content: {
          'application/json': { schema: resolver(successEnvelope(CoffeeVarietyOutputSchema)) },
        },
      },
      400: {
        description: 'Bad request',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Forbidden',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Coffee variety not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  async (c) => {
    const userId = c.get('userId')!;
    const user = c.get('user') as { isAdmin: boolean } | null;
    const isAdmin = user?.isAdmin ?? false;
    try {
      const result = await deps.service.deleteCoffeeVariety(
        c.req.param('id')!,
        userId,
        undefined,
        isAdmin,
      );
      return success(c, result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === 'COFFEE_VARIETY_NOT_FOUND') {
        return error(c, 'NOT_FOUND', 'Coffee variety not found', 404);
      }
      if (message === 'SYSTEM_VARIETY_IMMUTABLE') {
        return error(c, 'FORBIDDEN', 'Cannot delete system varieties', 403);
      }
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your coffee variety', 403);
      return error(c, 'BAD_REQUEST', message, 400);
    }
  },
);

router.get(
  '/:id/recipes',
  describeRoute({
    tags: ['Coffee Varieties'],
    summary: 'List recipes using a coffee variety',
    description: 'Paginated list of recipes that use the given coffee variety.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'perPage', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
    ],
    responses: {
      200: {
        description: 'Paginated list of recipes using the variety',
        content: {
          'application/json': {
            schema: resolver(paginatedEnvelope(RecipeWithVersionsOutputSchema)),
          },
        },
      },
    },
  }),
  zValidator('query', CoffeeVarietyRecipesQuerySchema),
  async (c) => {
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
  },
);

export default router;
