import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import {
  TasteNoteCreateSchema,
  TasteNoteFilterSchema,
  TasteNoteUpdateSchema,
} from '@brewform/shared/schemas';
import {
  ErrorEnvelopeSchema,
  MessageResponseSchema,
  successEnvelope,
  TasteNoteNodeOutputSchema,
  TasteNoteOutputSchema,
} from '@brewform/shared/schemas';
import { adminMiddleware, authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, success, zodValidationHook } from '../../utils/response/index.ts';
import { jsonRequestBody } from '../../utils/openapi/index.ts';
import { cacheProvider } from '../../utils/cache/singleton.ts';
import type { AppEnv } from '../../types/hono.ts';

const taste = new Hono<AppEnv>();

taste.get(
  '/hierarchy',
  describeRoute({
    tags: ['Taste Notes'],
    summary: 'Get the taste-note hierarchy',
    description: 'Returns the full taste-note tree, each node carrying its nested `children`.',
    responses: {
      200: {
        description: 'Taste-note hierarchy',
        content: {
          'application/json': {
            schema: resolver(successEnvelope(z.array(TasteNoteNodeOutputSchema))),
          },
        },
      },
    },
  }),
  async (c) => {
    const hierarchy = await service.getHierarchy(cacheProvider!);
    return success(c, hierarchy);
  },
);

taste.get(
  '/search',
  describeRoute({
    tags: ['Taste Notes'],
    summary: 'Search taste notes',
    description:
      'Returns a flat list of taste notes matching the search query. With no query, returns the full flat list.',
    parameters: [
      { name: 'search', in: 'query', required: false, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'List of matching taste notes',
        content: {
          'application/json': {
            schema: resolver(successEnvelope(z.array(TasteNoteOutputSchema))),
          },
        },
      },
      400: {
        description: 'Search query too short',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  zValidator('query', TasteNoteFilterSchema),
  async (c) => {
    const { search } = c.req.valid('query');
    if (!search) {
      const allNotes = await service.getFlatList(cacheProvider!);
      return success(c, allNotes);
    }
    try {
      const results = await service.searchTasteNotes(search, cacheProvider!);
      return success(c, results);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'QUERY_TOO_SHORT') {
        return error(c, 'QUERY_TOO_SHORT', 'Search query must be at least 3 characters', 400);
      }
      throw err;
    }
  },
);

taste.get(
  '/flat',
  describeRoute({
    tags: ['Taste Notes'],
    summary: 'Get the flat taste-note list',
    description: 'Returns all taste notes as a flat list, without hierarchy.',
    responses: {
      200: {
        description: 'Flat list of taste notes',
        content: {
          'application/json': {
            schema: resolver(successEnvelope(z.array(TasteNoteOutputSchema))),
          },
        },
      },
    },
  }),
  async (c) => {
    const allNotes = await service.getFlatList(cacheProvider!);
    return success(c, allNotes);
  },
);

taste.post(
  '/',
  describeRoute({
    tags: ['Taste Notes'],
    summary: 'Create a taste note',
    description: 'Creates a taste note. Admin only.',
    security: [{ bearerAuth: [] }],
    requestBody: jsonRequestBody(TasteNoteCreateSchema),
    responses: {
      201: {
        description: 'Taste note created',
        content: {
          'application/json': { schema: resolver(successEnvelope(TasteNoteOutputSchema)) },
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
    },
  }),
  authMiddleware,
  adminMiddleware,
  zValidator('json', TasteNoteCreateSchema, zodValidationHook),
  async (c) => {
    const body = c.req.valid('json');
    const note = await service.createTasteNote(body, cacheProvider!);
    return success(c, note, 201);
  },
);

taste.patch(
  '/:id',
  describeRoute({
    tags: ['Taste Notes'],
    summary: 'Update a taste note',
    description: 'Updates a taste note. Admin only.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    requestBody: jsonRequestBody(TasteNoteUpdateSchema),
    responses: {
      200: {
        description: 'Taste note updated',
        content: {
          'application/json': { schema: resolver(successEnvelope(TasteNoteOutputSchema)) },
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
    },
  }),
  authMiddleware,
  adminMiddleware,
  zValidator('json', TasteNoteUpdateSchema, zodValidationHook),
  async (c) => {
    const id = c.req.param('id')!;
    const body = c.req.valid('json');
    const note = await service.updateTasteNote(id, body, cacheProvider!);
    return success(c, note);
  },
);

taste.delete(
  '/:id',
  describeRoute({
    tags: ['Taste Notes'],
    summary: 'Delete a taste note',
    description: 'Deletes a taste note. Admin only.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Taste note deleted',
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
    },
  }),
  authMiddleware,
  adminMiddleware,
  async (c) => {
    const id = c.req.param('id')!;
    await service.deleteTasteNote(id, cacheProvider!);
    return success(c, { message: 'Taste note deleted' });
  },
);

export default taste;
