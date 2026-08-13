import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { describeRoute, resolver } from 'hono-openapi';
import {
  BrewLogCreateSchema,
  BrewLogUpdateSchema,
  PaginationSchema,
  UuidSchema,
} from '@brewform/shared/schemas';
import {
  BrewLogListItemOutputSchema,
  BrewLogOutputSchema,
  ErrorEnvelopeSchema,
  MessageResponseSchema,
  paginatedEnvelope,
  RecipeBrewStatsOutputSchema,
  successEnvelope,
  UserBrewStatsOutputSchema,
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

/** Hono sub-router for brew-log endpoints, mounted at `/api/v1/brew-logs`. */
const brewLog = new Hono<AppEnv>();

/** Validates a `:recipeId` path param as a UUID (400 on malformed input). */
const recipeIdParam = zValidator('param', z.object({ recipeId: UuidSchema }), zodValidationHook);

/** Validates an `:id` path param as a UUID (400 on malformed input). */
const idParam = zValidator('param', z.object({ id: UuidSchema }), zodValidationHook);

// GET / — List my brew logs
brewLog.get(
  '/',
  describeRoute({
    tags: ['Brew Logs'],
    summary: 'List my brew logs',
    description:
      "Paginated list of the authenticated user's brew logs, newest brews first, with recipe title/slug per row.",
    security: [{ bearerAuth: [] }],
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
        description: 'Paginated list of brew logs',
        content: {
          'application/json': {
            schema: resolver(paginatedEnvelope(BrewLogListItemOutputSchema)),
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
  zValidator('query', PaginationSchema, zodValidationHook),
  async (c) => {
    const userId = c.get('userId') as string;
    const { page, perPage } = c.req.valid('query');
    const result = await service.listUserBrewLogs(userId, page, perPage);
    return paginated(c, result.brewLogs, {
      page,
      perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / perPage),
    });
  },
);

// GET /stats/user — My journal stats
brewLog.get(
  '/stats/user',
  describeRoute({
    tags: ['Brew Logs'],
    summary: 'Get my brew stats',
    description:
      'Aggregate journal stats for the authenticated user: total brews, brews in the last 30 days, distinct recipes brewed, and first/last brew timestamps.',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'User brew stats',
        content: {
          'application/json': { schema: resolver(successEnvelope(UserBrewStatsOutputSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  async (c) => {
    const userId = c.get('userId') as string;
    const stats = await service.getUserBrewStats(userId);
    return success(c, stats);
  },
);

// GET /stats/recipe/:recipeId — Per-recipe brew stats (public)
brewLog.get(
  '/stats/recipe/:recipeId',
  describeRoute({
    tags: ['Brew Logs'],
    summary: 'Get recipe brew stats',
    description:
      "Aggregate brew stats for one recipe: brew count and average personal rating across all users' brew logs. Public — no authentication required.",
    parameters: [
      {
        name: 'recipeId',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
    ],
    responses: {
      200: {
        description: 'Recipe brew stats',
        content: {
          'application/json': { schema: resolver(successEnvelope(RecipeBrewStatsOutputSchema)) },
        },
      },
      400: {
        description: 'Validation error',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  optionalAuthGuard,
  recipeIdParam,
  async (c) => {
    const recipeId = c.req.param('recipeId')!;
    const stats = await service.getRecipeBrewStats(recipeId);
    return success(c, stats);
  },
);

// GET /recipe/:recipeId — List my brew logs for a recipe
brewLog.get(
  '/recipe/:recipeId',
  describeRoute({
    tags: ['Brew Logs'],
    summary: 'List my brew logs for a recipe',
    description:
      "Paginated list of the authenticated user's brew logs for one recipe, newest brews first.",
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: 'recipeId',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
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
        description: 'Paginated list of brew logs',
        content: {
          'application/json': {
            schema: resolver(paginatedEnvelope(BrewLogListItemOutputSchema)),
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
  recipeIdParam,
  zValidator('query', PaginationSchema, zodValidationHook),
  async (c) => {
    const userId = c.get('userId') as string;
    const recipeId = c.req.param('recipeId')!;
    const { page, perPage } = c.req.valid('query');
    const result = await service.listRecipeBrewLogs(userId, recipeId, page, perPage);
    return paginated(c, result.brewLogs, {
      page,
      perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / perPage),
    });
  },
);

// POST / — Create a brew log
brewLog.post(
  '/',
  describeRoute({
    tags: ['Brew Logs'],
    summary: 'Create a brew log',
    description:
      'Log a brew of a recipe for the authenticated user. The recipe must exist and be visible (public or authored by the user); an optional recipeVersionId must belong to that recipe.',
    security: [{ bearerAuth: [] }],
    requestBody: jsonRequestBody(BrewLogCreateSchema),
    responses: {
      201: {
        description: 'Brew log created',
        content: {
          'application/json': { schema: resolver(successEnvelope(BrewLogOutputSchema)) },
        },
      },
      400: {
        description: 'Validation error (invalid body or recipe version mismatch)',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Recipe not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  zValidator('json', BrewLogCreateSchema, zodValidationHook),
  async (c) => {
    const userId = c.get('userId') as string;
    const body = c.req.valid('json');
    try {
      const created = await service.createBrewLog(userId, body);
      return success(c, created, 201);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'RECIPE_NOT_FOUND') return error(c, 'NOT_FOUND', 'Recipe not found', 404);
      if (message === 'RECIPE_VERSION_MISMATCH') {
        return error(c, 'VALIDATION_ERROR', 'Recipe version does not belong to the recipe', 400);
      }
      throw err;
    }
  },
);

// GET /:id — Get one of my brew logs
brewLog.get(
  '/:id',
  describeRoute({
    tags: ['Brew Logs'],
    summary: 'Get one of my brew logs',
    description:
      'Fetch a single brew log by id. Only the owner can read it; a missing or foreign log returns 404.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    responses: {
      200: {
        description: 'The brew log',
        content: {
          'application/json': { schema: resolver(successEnvelope(BrewLogOutputSchema)) },
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
      404: {
        description: 'Brew log not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  idParam,
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    try {
      const log = await service.getBrewLog(userId, id);
      return success(c, log);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'BREW_LOG_NOT_FOUND') {
        return error(c, 'NOT_FOUND', 'Brew log not found', 404);
      }
      throw err;
    }
  },
);

// PATCH /:id — Update a brew log
brewLog.patch(
  '/:id',
  describeRoute({
    tags: ['Brew Logs'],
    summary: 'Update a brew log',
    description:
      "Update a brew log's brewedAt, yieldActual, doseActual, notes, or personalRating. Only the owner can update; explicit nulls clear fields.",
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    requestBody: jsonRequestBody(BrewLogUpdateSchema),
    responses: {
      200: {
        description: 'Brew log updated',
        content: {
          'application/json': { schema: resolver(successEnvelope(BrewLogOutputSchema)) },
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
      404: {
        description: 'Brew log not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  idParam,
  zValidator('json', BrewLogUpdateSchema, zodValidationHook),
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    const body = c.req.valid('json');
    try {
      const updated = await service.updateBrewLog(userId, id, body);
      return success(c, updated);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'BREW_LOG_NOT_FOUND') {
        return error(c, 'NOT_FOUND', 'Brew log not found', 404);
      }
      throw err;
    }
  },
);

// DELETE /:id — Delete a brew log
brewLog.delete(
  '/:id',
  describeRoute({
    tags: ['Brew Logs'],
    summary: 'Delete a brew log',
    description: 'Soft-delete a brew log. Only the owner can delete.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    responses: {
      200: {
        description: 'Brew log deleted',
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
      404: {
        description: 'Brew log not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authGuard,
  idParam,
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    try {
      await service.deleteBrewLog(userId, id);
      return success(c, { message: 'Brew log deleted' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'BREW_LOG_NOT_FOUND') {
        return error(c, 'NOT_FOUND', 'Brew log not found', 404);
      }
      throw err;
    }
  },
);

export default brewLog;
