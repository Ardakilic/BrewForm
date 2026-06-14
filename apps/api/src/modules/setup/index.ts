import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute, resolver } from 'hono-openapi';
import { PaginationSchema, SetupCreateSchema, SetupUpdateSchema } from '@brewform/shared/schemas';
import {
  ErrorEnvelopeSchema,
  MessageResponseSchema,
  paginatedEnvelope,
  SetupOutputSchema,
  successEnvelope,
} from '@brewform/shared/schemas';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, paginated, success } from '../../utils/response/index.ts';
import { jsonRequestBody } from '../../utils/openapi/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const setup = new Hono<AppEnv>();

setup.get(
  '/',
  describeRoute({
    tags: ['Setups'],
    summary: 'List setups',
    description: 'Paginated list of brewing-equipment setups owned by the authenticated user.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'perPage', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
    ],
    responses: {
      200: {
        description: 'Paginated list of setups',
        content: {
          'application/json': { schema: resolver(paginatedEnvelope(SetupOutputSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  zValidator('query', PaginationSchema),
  async (c) => {
    const userId = c.get('userId') as string;
    const { page, perPage } = c.req.valid('query');
    const result = await service.listSetups(userId, page, perPage);
    return paginated(c, result.setups, {
      page,
      perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / perPage),
    });
  },
);

setup.post(
  '/',
  describeRoute({
    tags: ['Setups'],
    summary: 'Create a setup',
    description: 'Creates a brewing-equipment setup owned by the authenticated user.',
    security: [{ bearerAuth: [] }],
    requestBody: jsonRequestBody(SetupCreateSchema),
    responses: {
      201: {
        description: 'Setup created',
        content: {
          'application/json': { schema: resolver(successEnvelope(SetupOutputSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  zValidator('json', SetupCreateSchema),
  async (c) => {
    const userId = c.get('userId') as string;
    const body = c.req.valid('json');
    const result = await service.createSetup(userId, body);
    return success(c, result, 201);
  },
);

setup.get(
  '/:id',
  describeRoute({
    tags: ['Setups'],
    summary: 'Get a setup by id',
    description: 'Returns a single brewing-equipment setup by its id.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Setup payload',
        content: {
          'application/json': { schema: resolver(successEnvelope(SetupOutputSchema)) },
        },
      },
      404: {
        description: 'Setup not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  async (c) => {
    const id = c.req.param('id')!;
    try {
      const s = await service.getSetup(id);
      return success(c, s);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'SETUP_NOT_FOUND') return error(c, 'NOT_FOUND', 'Setup not found', 404);
      throw err;
    }
  },
);

setup.patch(
  '/:id',
  describeRoute({
    tags: ['Setups'],
    summary: 'Update a setup',
    description: 'Updates a brewing-equipment setup owned by the authenticated user.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    requestBody: jsonRequestBody(SetupUpdateSchema),
    responses: {
      200: {
        description: 'Setup updated',
        content: {
          'application/json': { schema: resolver(successEnvelope(SetupOutputSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Not your setup',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Setup not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  zValidator('json', SetupUpdateSchema),
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    const body = c.req.valid('json');
    try {
      const s = await service.updateSetup(userId, id, body);
      return success(c, s);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'SETUP_NOT_FOUND') return error(c, 'NOT_FOUND', 'Setup not found', 404);
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your setup', 403);
      throw err;
    }
  },
);

setup.delete(
  '/:id',
  describeRoute({
    tags: ['Setups'],
    summary: 'Delete a setup',
    description: 'Deletes a brewing-equipment setup owned by the authenticated user.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Setup deleted',
        content: {
          'application/json': { schema: resolver(successEnvelope(MessageResponseSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Not your setup',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Setup not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    try {
      await service.deleteSetup(userId, id);
      return success(c, { message: 'Setup deleted' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'SETUP_NOT_FOUND') return error(c, 'NOT_FOUND', 'Setup not found', 404);
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your setup', 403);
      throw err;
    }
  },
);

setup.post(
  '/:id/set-default',
  describeRoute({
    tags: ['Setups'],
    summary: 'Set a setup as default',
    description: "Marks the given setup as the authenticated user's default setup.",
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Setup marked as default',
        content: {
          'application/json': { schema: resolver(successEnvelope(SetupOutputSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Not your setup',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Setup not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    try {
      const s = await service.setDefault(userId, id);
      return success(c, s);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'SETUP_NOT_FOUND') return error(c, 'NOT_FOUND', 'Setup not found', 404);
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your setup', 403);
      throw err;
    }
  },
);

export default setup;
