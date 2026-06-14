import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { UserProfileUpdateSchema } from '@brewform/shared/schemas';
import { describeRoute, resolver } from 'hono-openapi';
import {
  ErrorEnvelopeSchema,
  MessageResponseSchema,
  PublicUserOutputSchema,
  SelfUserOutputSchema,
  successEnvelope,
  UserRowOutputSchema,
} from '@brewform/shared/schemas';
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, success } from '../../utils/response/index.ts';
import { jsonRequestBody } from '../../utils/openapi/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const user = new Hono<AppEnv>();

user.get(
  '/me',
  describeRoute({
    tags: ['Users'],
    summary: 'Get the authenticated user profile',
    description: 'Returns the full profile of the authenticated user, including preferences and stats.',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Authenticated user profile',
        content: {
          'application/json': { schema: resolver(successEnvelope(SelfUserOutputSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'User not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  async (c) => {
    const userId = c.get('userId') as string;
    try {
      const profile = await service.getProfile(userId);
      return success(c, profile);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'USER_NOT_FOUND') return error(c, 'NOT_FOUND', 'User not found', 404);
      throw err;
    }
  },
);

user.patch(
  '/me',
  describeRoute({
    tags: ['Users'],
    summary: 'Update the authenticated user profile',
    description: 'Updates the authenticated user\'s profile fields.',
    security: [{ bearerAuth: [] }],
    requestBody: jsonRequestBody(UserProfileUpdateSchema),
    responses: {
      200: {
        description: 'Updated user row',
        content: {
          'application/json': { schema: resolver(successEnvelope(UserRowOutputSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  zValidator('json', UserProfileUpdateSchema),
  async (c) => {
    const userId = c.get('userId') as string;
    const body = c.req.valid('json');
    const updated = await service.updateProfile(userId, body);
    return success(c, updated);
  },
);

user.delete(
  '/me',
  describeRoute({
    tags: ['Users'],
    summary: 'Delete the authenticated user account',
    description: 'Soft-deletes the authenticated user\'s account.',
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Account deleted',
        content: {
          'application/json': { schema: resolver(successEnvelope(MessageResponseSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  async (c) => {
    const userId = c.get('userId') as string;
    await service.deleteAccount(userId);
    return success(c, { message: 'Account deleted' });
  },
);

user.get(
  '/:username',
  describeRoute({
    tags: ['Users'],
    summary: 'Get a public user profile',
    description:
      'Returns the public profile for a username, including stats, recipes, badges, and follow status.',
    parameters: [
      { name: 'username', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Public user profile',
        content: {
          'application/json': { schema: resolver(successEnvelope(PublicUserOutputSchema)) },
        },
      },
      404: {
        description: 'User not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  optionalAuthMiddleware,
  async (c) => {
    const username = c.req.param('username') as string;
    const requesterId = c.get('userId') as string | undefined;
    try {
      const profile = await service.getPublicProfile(username, requesterId);
      return success(c, profile);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'USER_NOT_FOUND') return error(c, 'NOT_FOUND', 'User not found', 404);
      throw err;
    }
  },
);

export default user;
