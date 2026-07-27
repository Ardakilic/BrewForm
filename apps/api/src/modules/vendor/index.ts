import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import {
  PaginationSchema,
  SearchQuerySchema,
  VendorCreateSchema,
  VendorUpdateSchema,
} from '@brewform/shared/schemas';
import {
  ErrorEnvelopeSchema,
  MessageResponseSchema,
  paginatedEnvelope,
  successEnvelope,
  VendorOutputSchema,
} from '@brewform/shared/schemas';
import { adminMiddleware, authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, paginated, success } from '../../utils/response/index.ts';
import { jsonRequestBody } from '../../utils/openapi/index.ts';
import type { AppEnv } from '../../types/hono.ts';

/** Hono sub-router for vendor endpoints, mounted at `/api/v1/vendors`. */
const vendor = new Hono<AppEnv>();

vendor.get(
  '/',
  describeRoute({
    tags: ['Vendors'],
    summary: 'List vendors',
    description: 'Paginated list of coffee vendors/roasters.',
    parameters: [
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'perPage', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
    ],
    responses: {
      200: {
        description: 'Paginated list of vendors',
        content: {
          'application/json': { schema: resolver(paginatedEnvelope(VendorOutputSchema)) },
        },
      },
    },
  }),
  zValidator('query', PaginationSchema),
  async (c) => {
    const { page, perPage } = c.req.valid('query');
    const result = await service.listVendors(page, perPage);
    return paginated(c, result.vendors, {
      page,
      perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / perPage),
    });
  },
);

vendor.get(
  '/search',
  describeRoute({
    tags: ['Vendors'],
    summary: 'Search vendors',
    description: 'Returns vendors matching the search query.',
    parameters: [
      { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'List of matching vendors',
        content: {
          'application/json': {
            schema: resolver(successEnvelope(z.array(VendorOutputSchema))),
          },
        },
      },
    },
  }),
  zValidator('query', SearchQuerySchema),
  async (c) => {
    const { q } = c.req.valid('query');
    const results = await service.searchVendors(q);
    return success(c, results);
  },
);

vendor.post(
  '/',
  describeRoute({
    tags: ['Vendors'],
    summary: 'Create a vendor',
    description: 'Creates a coffee vendor/roaster entry.',
    security: [{ bearerAuth: [] }],
    requestBody: jsonRequestBody(VendorCreateSchema),
    responses: {
      201: {
        description: 'Vendor created',
        content: {
          'application/json': { schema: resolver(successEnvelope(VendorOutputSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  zValidator('json', VendorCreateSchema),
  async (c) => {
    const userId = c.get('userId') as string;
    const body = c.req.valid('json');
    const v = await service.createVendor(userId, body);
    return success(c, v, 201);
  },
);

vendor.get(
  '/:id',
  describeRoute({
    tags: ['Vendors'],
    summary: 'Get a vendor by id',
    description: 'Returns a single coffee vendor/roaster by its id.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Vendor payload',
        content: {
          'application/json': { schema: resolver(successEnvelope(VendorOutputSchema)) },
        },
      },
      404: {
        description: 'Vendor not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  async (c) => {
    const id = c.req.param('id')!;
    try {
      const v = await service.getVendor(id);
      return success(c, v);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'VENDOR_NOT_FOUND') return error(c, 'NOT_FOUND', 'Vendor not found', 404);
      throw err;
    }
  },
);

vendor.patch(
  '/:id',
  describeRoute({
    tags: ['Vendors'],
    summary: 'Update a vendor',
    description: 'Updates a coffee vendor/roaster. Owner or admin only.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    requestBody: jsonRequestBody(VendorUpdateSchema),
    responses: {
      200: {
        description: 'Vendor updated',
        content: {
          'application/json': { schema: resolver(successEnvelope(VendorOutputSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Not your vendor',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Vendor not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  zValidator('json', VendorUpdateSchema),
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    const user = c.get('user') as { isAdmin: boolean } | null;
    const isAdmin = user?.isAdmin ?? false;
    const body = c.req.valid('json');
    try {
      const v = await service.updateVendor(userId, id, body, isAdmin);
      return success(c, v);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'VENDOR_NOT_FOUND') return error(c, 'NOT_FOUND', 'Vendor not found', 404);
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your vendor', 403);
      throw err;
    }
  },
);

vendor.delete(
  '/:id',
  describeRoute({
    tags: ['Vendors'],
    summary: 'Delete a vendor',
    description: 'Deletes a coffee vendor/roaster. Admin only.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Vendor deleted',
        content: {
          'application/json': { schema: resolver(successEnvelope(MessageResponseSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Forbidden (admin only)',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Vendor not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  adminMiddleware,
  async (c) => {
    const id = c.req.param('id')!;
    try {
      await service.deleteVendor(id);
      return success(c, { message: 'Vendor deleted' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'VENDOR_NOT_FOUND') return error(c, 'NOT_FOUND', 'Vendor not found', 404);
      throw err;
    }
  },
);

export default vendor;
