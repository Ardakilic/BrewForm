import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute, resolver } from 'hono-openapi';
import { BeanCreateSchema, BeanUpdateSchema, PaginationSchema } from '@brewform/shared/schemas';
import {
  BeanOutputSchema,
  ErrorEnvelopeSchema,
  MessageResponseSchema,
  paginatedEnvelope,
  successEnvelope,
} from '@brewform/shared/schemas';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, paginated, success } from '../../utils/response/index.ts';
import { jsonRequestBody } from '../../utils/openapi/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const bean = new Hono<AppEnv>();

bean.get(
  '/',
  describeRoute({
    tags: ['Beans'],
    summary: 'List beans',
    description: 'Paginated list of coffee beans owned by the authenticated user.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'perPage', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
    ],
    responses: {
      200: {
        description: 'Paginated list of beans',
        content: {
          'application/json': { schema: resolver(paginatedEnvelope(BeanOutputSchema)) },
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
    const result = await service.listBeans(userId, page, perPage);
    return paginated(c, result.beans, {
      page,
      perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / perPage),
    });
  },
);

bean.get(
  '/:id',
  describeRoute({
    tags: ['Beans'],
    summary: 'Get a bean by id',
    description: 'Returns a single coffee bean by its id.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Bean payload',
        content: { 'application/json': { schema: resolver(successEnvelope(BeanOutputSchema)) } },
      },
      404: {
        description: 'Bean not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  async (c) => {
    const id = c.req.param('id')!;
    try {
      const b = await service.getBean(id);
      return success(c, b);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'BEAN_NOT_FOUND') return error(c, 'NOT_FOUND', 'Bean not found', 404);
      throw err;
    }
  },
);

bean.post(
  '/',
  describeRoute({
    tags: ['Beans'],
    summary: 'Create a bean',
    description: 'Creates a coffee bean owned by the authenticated user.',
    security: [{ bearerAuth: [] }],
    requestBody: jsonRequestBody(BeanCreateSchema),
    responses: {
      201: {
        description: 'Bean created',
        content: { 'application/json': { schema: resolver(successEnvelope(BeanOutputSchema)) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  zValidator('json', BeanCreateSchema),
  async (c) => {
    const userId = c.get('userId') as string;
    const body = c.req.valid('json');
    const b = await service.createBean(userId, body);
    return success(c, b, 201);
  },
);

bean.patch(
  '/:id',
  describeRoute({
    tags: ['Beans'],
    summary: 'Update a bean',
    description: 'Updates a coffee bean owned by the authenticated user.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    requestBody: jsonRequestBody(BeanUpdateSchema),
    responses: {
      200: {
        description: 'Bean updated',
        content: { 'application/json': { schema: resolver(successEnvelope(BeanOutputSchema)) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Not your bean',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Bean not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  zValidator('json', BeanUpdateSchema),
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    const body = c.req.valid('json');
    try {
      const b = await service.updateBean(userId, id, body);
      return success(c, b);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'BEAN_NOT_FOUND') return error(c, 'NOT_FOUND', 'Bean not found', 404);
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your bean', 403);
      throw err;
    }
  },
);

bean.delete(
  '/:id',
  describeRoute({
    tags: ['Beans'],
    summary: 'Delete a bean',
    description: 'Deletes a coffee bean owned by the authenticated user.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Bean deleted',
        content: {
          'application/json': { schema: resolver(successEnvelope(MessageResponseSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Not your bean',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Bean not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    try {
      await service.deleteBean(userId, id);
      return success(c, { message: 'Bean deleted' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'BEAN_NOT_FOUND') return error(c, 'NOT_FOUND', 'Bean not found', 404);
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your bean', 403);
      throw err;
    }
  },
);

export default bean;
