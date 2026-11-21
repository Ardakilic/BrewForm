/**
 * Private recipe notes routes, mounted at `/api/v1/recipes` next to the recipe router.
 *
 * `GET`, `PUT` and `DELETE /:id/notes` act only on the authenticated caller's
 * own note (the user id comes from the auth context; nothing in the request can
 * name another user). There is deliberately NO `POST` handler: the legacy
 * `POST /:id/notes` (an IDOR that overwrote the author's public brewer notes) is
 * removed, so Hono answers it with its default 404 before any guard runs.
 *
 * Every response — success or error — carries `Cache-Control: private, no-store`
 * so no shared cache can store a private note.
 */
import {
  ErrorEnvelopeSchema,
  RecipeNotesSchema,
  RecipeUserNoteOutputSchema,
  successEnvelope,
  UuidSchema,
} from '@brewform/shared/schemas';
import { zValidator } from '@hono/zod-validator';
import type { Context, Next } from 'hono';
import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.ts';
import type { AppEnv } from '../../types/hono.ts';
import { AppError } from '../../utils/errors.ts';
import { jsonRequestBody } from '../../utils/openapi/index.ts';
import { error, success, zodValidationHook } from '../../utils/response/index.ts';
import * as service from './service.ts';

/** Dependency-injection proxy for test stubbing (auth middleware). */
export const deps = { authMiddleware };

/** Proxy that resolves authMiddleware at request time (supports test mocking via deps). */
function authGuard(c: Context<AppEnv>, next: Next) {
  return deps.authMiddleware(c, next);
}

/** `Cache-Control` value sent on every notes response. */
export const NOTES_CACHE_CONTROL = 'private, no-store';

/**
 * Mark the response private and uncacheable. Runs first in every notes route,
 * so the header is also present on 400/401/404 responses built later with `c.json`.
 */
async function noStore(c: Context<AppEnv>, next: Next) {
  c.header('Cache-Control', NOTES_CACHE_CONTROL);
  await next();
}

/** Validates the `:id` path param as a UUID (400 on malformed input). */
const idParam = zValidator('param', z.object({ id: UuidSchema }), zodValidationHook);

/**
 * Map the service's typed client errors (`NotFoundError` → 404 `NOT_FOUND`,
 * `ValidationError` → 400 `VALIDATION_ERROR` with details) to the error
 * envelope; anything else is rethrown to the global error handler.
 *
 * @param c - Request context.
 * @param err - The error thrown by the service.
 */
function mapServiceError(c: Context<AppEnv>, err: unknown) {
  if (err instanceof AppError) return error(c, err.code, err.message, err.status, err.details);
  throw err;
}

/** Whether the authenticated caller is an admin (widens viewable recipes, never whose notes). */
function callerIsAdmin(c: Context<AppEnv>): boolean {
  return c.get('user')?.isAdmin === true;
}

/** OpenAPI description of the `:id` path parameter. */
const idParameter = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' },
  description: 'Recipe UUID',
};

/** OpenAPI 200 response: the caller's note in the success envelope. */
function noteResponse(description: string) {
  return {
    description,
    content: {
      'application/json': { schema: resolver(successEnvelope(RecipeUserNoteOutputSchema)) },
    },
  };
}

/** OpenAPI error response documented with the standard error envelope. */
function errorResponse(description: string) {
  return {
    description,
    content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
  };
}

/** Hono sub-router for the caller-scoped private notes endpoints. */
const recipeNote = new Hono<AppEnv>();

recipeNote.get(
  '/:id/notes',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Get my private note on a recipe',
    description:
      "Returns the authenticated caller's own private note on the recipe, or `notes: null` and `updatedAt: null` when they have none. Never returns another user's note (admins included) and never the author's public brewer notes. The recipe must be viewable by the caller; otherwise 404. Responses carry `Cache-Control: private, no-store`.",
    security: [{ bearerAuth: [] }],
    parameters: [idParameter],
    responses: {
      200: noteResponse("The caller's private note (or an absent-note payload)"),
      400: errorResponse('Malformed recipe id'),
      401: errorResponse('Unauthorized'),
      404: errorResponse('Recipe not found, deleted or not viewable by the caller'),
    },
  }),
  noStore,
  authGuard,
  idParam,
  async (c) => {
    const userId = c.get('userId') as string;
    const { id } = c.req.valid('param');
    try {
      return success(c, await service.getMyNote(userId, id, callerIsAdmin(c)));
    } catch (err: unknown) {
      return mapServiceError(c, err);
    }
  },
);

recipeNote.put(
  '/:id/notes',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Create or replace my private note on a recipe',
    description:
      "Creates or replaces the authenticated caller's own private note on the recipe (one note per user and recipe). The text is sanitized (HTML tags and zero-width characters stripped); text that is empty afterwards is rejected with 400. Never modifies another user's note or the author's public brewer notes, and ignores any user id in the request. Does not require a verified email. Responses carry `Cache-Control: private, no-store`.",
    security: [{ bearerAuth: [] }],
    parameters: [idParameter],
    requestBody: jsonRequestBody(RecipeNotesSchema, 'Private note text (1–10,000 characters)'),
    responses: {
      200: noteResponse('The stored private note'),
      400: errorResponse('Malformed recipe id, or empty or over-long note text'),
      401: errorResponse('Unauthorized'),
      404: errorResponse('Recipe not found, deleted or not viewable by the caller'),
    },
  }),
  noStore,
  authGuard,
  idParam,
  zValidator('json', RecipeNotesSchema, zodValidationHook),
  async (c) => {
    const userId = c.get('userId') as string;
    const { id } = c.req.valid('param');
    const { notes } = c.req.valid('json');
    try {
      return success(c, await service.saveMyNote(userId, id, notes, callerIsAdmin(c)));
    } catch (err: unknown) {
      return mapServiceError(c, err);
    }
  },
);

recipeNote.delete(
  '/:id/notes',
  describeRoute({
    tags: ['Recipes'],
    summary: 'Delete my private note on a recipe',
    description:
      "Soft-deletes the authenticated caller's own private note on the recipe and scrubs its text; idempotent (200 when there is no note). A later PUT revives the same note. Never touches another user's note. The recipe must be viewable by the caller; otherwise 404. Responses carry `Cache-Control: private, no-store`.",
    security: [{ bearerAuth: [] }],
    parameters: [idParameter],
    responses: {
      200: noteResponse('Note deleted (absent-note payload)'),
      400: errorResponse('Malformed recipe id'),
      401: errorResponse('Unauthorized'),
      404: errorResponse('Recipe not found, deleted or not viewable by the caller'),
    },
  }),
  noStore,
  authGuard,
  idParam,
  async (c) => {
    const userId = c.get('userId') as string;
    const { id } = c.req.valid('param');
    try {
      return success(c, await service.deleteMyNote(userId, id, callerIsAdmin(c)));
    } catch (err: unknown) {
      return mapServiceError(c, err);
    }
  },
);

export default recipeNote;
