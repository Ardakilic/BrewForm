import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import {
  EquipmentCreateSchema,
  EquipmentDeleteRequestSchema,
  EquipmentFilterSchema,
  EquipmentUpdateSchema,
  PaginationSchema,
  SearchQuerySchema,
} from '@brewform/shared/schemas';
import {
  EquipmentDeleteRequestResponseSchema,
  EquipmentOutputSchema,
  EquipmentRecipesResponseSchema,
  ErrorEnvelopeSchema,
  MessageResponseSchema,
  paginatedEnvelope,
  successEnvelope,
} from '@brewform/shared/schemas';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, paginated, success, zodValidationHook } from '../../utils/response/index.ts';
import { jsonRequestBody } from '../../utils/openapi/index.ts';
import type { AppEnv } from '../../types/hono.ts';

export const deps = { authMiddleware, service };

/** Proxy that resolves authMiddleware at request time (supports test mocking via deps). */
async function authGuard(c: Context, next: Next) {
  return deps.authMiddleware(c, next);
}

const equipment = new Hono<AppEnv>();

equipment.get(
  '/',
  describeRoute({
    tags: ['Equipment'],
    summary: 'List equipment',
    description: 'Paginated, filterable list of brewing equipment.',
    responses: {
      200: {
        description: 'Paginated list of equipment',
        content: {
          'application/json': { schema: resolver(paginatedEnvelope(EquipmentOutputSchema)) },
        },
      },
    },
  }),
  zValidator('query', EquipmentFilterSchema),
  async (c) => {
    const query = c.req.valid('query');
    const result = await deps.service.listEquipmentWithFilters(query);
    return paginated(c, result.items, {
      page: query.page,
      perPage: query.perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / query.perPage),
    });
  },
);

equipment.get(
  '/search',
  describeRoute({
    tags: ['Equipment'],
    summary: 'Search equipment',
    description: 'Returns equipment matching the search query.',
    parameters: [
      { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'List of matching equipment',
        content: {
          'application/json': {
            schema: resolver(successEnvelope(z.array(EquipmentOutputSchema))),
          },
        },
      },
    },
  }),
  zValidator('query', SearchQuerySchema),
  async (c) => {
    const { q } = c.req.valid('query');
    const results = await deps.service.searchEquipment(q);
    return success(c, results);
  },
);

equipment.post(
  '/',
  describeRoute({
    tags: ['Equipment'],
    summary: 'Create equipment',
    description: 'Creates a brewing-equipment entry.',
    security: [{ bearerAuth: [] }],
    requestBody: jsonRequestBody(EquipmentCreateSchema),
    responses: {
      201: {
        description: 'Equipment created',
        content: {
          'application/json': { schema: resolver(successEnvelope(EquipmentOutputSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  zValidator('json', EquipmentCreateSchema),
  async (c) => {
    const userId = c.get('userId') as string;
    const body = c.req.valid('json');
    const item = await deps.service.createEquipment(userId, body);
    return success(c, item, 201);
  },
);

equipment.get(
  '/:id/recipes',
  describeRoute({
    tags: ['Equipment'],
    summary: 'List recipes using a piece of equipment',
    description: 'Returns recipes that use the given equipment along with a total count.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'perPage', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
    ],
    responses: {
      200: {
        description: 'Recipes using the equipment (non-standard envelope, no meta)',
        content: {
          'application/json': { schema: resolver(EquipmentRecipesResponseSchema) },
        },
      },
    },
  }),
  zValidator('query', PaginationSchema),
  async (c) => {
    const id = c.req.param('id')!;
    const { page, perPage } = c.req.valid('query');
    const result = await deps.service.getRecipesForEquipment(id, page, perPage);
    return c.json({ success: true, ...result });
  },
);

equipment.post(
  '/:id/delete-request',
  describeRoute({
    tags: ['Equipment'],
    summary: 'Request equipment deletion',
    description: 'Submits a deletion request for the given equipment.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'reason', in: 'query', required: false, schema: { type: 'string' } },
    ],
    responses: {
      201: {
        description: 'Deletion request created (non-standard envelope, no meta)',
        content: {
          'application/json': { schema: resolver(EquipmentDeleteRequestResponseSchema) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Equipment not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  zValidator('query', EquipmentDeleteRequestSchema, zodValidationHook),
  async (c) => {
    const userId = c.get('userId') as string;
    const { reason } = c.req.valid('query');
    try {
      const result = await deps.service.requestEquipmentDeletion(
        c.req.param('id')!,
        userId,
        reason ?? undefined,
      );
      return c.json({ success: true, data: result }, 201);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === 'EQUIPMENT_NOT_FOUND') {
        return error(c, 'NOT_FOUND', 'Equipment not found', 404);
      }
      throw e;
    }
  },
);

equipment.get(
  '/:id',
  describeRoute({
    tags: ['Equipment'],
    summary: 'Get equipment by id',
    description: 'Returns a single piece of equipment by its id.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Equipment payload',
        content: {
          'application/json': { schema: resolver(successEnvelope(EquipmentOutputSchema)) },
        },
      },
      404: {
        description: 'Equipment not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  async (c) => {
    const id = c.req.param('id')!;
    try {
      const item = await deps.service.getEquipment(id);
      return success(c, item);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'EQUIPMENT_NOT_FOUND') {
        return error(c, 'NOT_FOUND', 'Equipment not found', 404);
      }
      throw err;
    }
  },
);

equipment.patch(
  '/:id',
  describeRoute({
    tags: ['Equipment'],
    summary: 'Update equipment',
    description: 'Updates a piece of equipment owned by the authenticated user.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    requestBody: jsonRequestBody(EquipmentUpdateSchema),
    responses: {
      200: {
        description: 'Equipment updated',
        content: {
          'application/json': { schema: resolver(successEnvelope(EquipmentOutputSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Not your equipment',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Equipment not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  zValidator('json', EquipmentUpdateSchema),
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    const body = c.req.valid('json');
    try {
      const item = await deps.service.updateEquipment(userId, id, body);
      return success(c, item);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'EQUIPMENT_NOT_FOUND') {
        return error(c, 'NOT_FOUND', 'Equipment not found', 404);
      }
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your equipment', 403);
      throw err;
    }
  },
);

equipment.delete(
  '/:id',
  describeRoute({
    tags: ['Equipment'],
    summary: 'Delete equipment',
    description: 'Deletes a piece of equipment owned by the authenticated user.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Equipment deleted',
        content: {
          'application/json': { schema: resolver(successEnvelope(MessageResponseSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Not your equipment',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Equipment not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    try {
      await deps.service.deleteEquipment(userId, id);
      return success(c, { message: 'Equipment deleted' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'EQUIPMENT_NOT_FOUND') {
        return error(c, 'NOT_FOUND', 'Equipment not found', 404);
      }
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your equipment', 403);
      throw err;
    }
  },
);

export default equipment;
