import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import {
  BadgeOutputSchema,
  ErrorEnvelopeSchema,
  MessageResponseSchema,
  successEnvelope,
  UserBadgeOutputSchema,
} from '@brewform/shared/schemas';
import { adminMiddleware, authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { success } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const badge = new Hono<AppEnv>();

badge.get(
  '/',
  describeRoute({
    tags: ['Badges'],
    summary: 'List badges',
    description: 'Returns all achievement badges.',
    responses: {
      200: {
        description: 'List of badges',
        content: {
          'application/json': {
            schema: resolver(successEnvelope(z.array(BadgeOutputSchema))),
          },
        },
      },
    },
  }),
  async (c) => {
    const badges = await service.listBadges();
    return success(c, badges);
  },
);

badge.get(
  '/user/:userId',
  describeRoute({
    tags: ['Badges'],
    summary: 'List a user\'s badges',
    description: 'Returns the badges awarded to the given user.',
    parameters: [
      { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'List of user badges',
        content: {
          'application/json': {
            schema: resolver(successEnvelope(z.array(UserBadgeOutputSchema))),
          },
        },
      },
    },
  }),
  async (c) => {
    const userId = c.req.param('userId')!;
    const badges = await service.getUserBadges(userId);
    return success(c, badges);
  },
);

badge.post(
  '/evaluate/:userId',
  describeRoute({
    tags: ['Badges'],
    summary: 'Evaluate a user\'s badges',
    description: 'Admin-only: re-evaluates and awards badges for the given user.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Badge evaluation completed',
        content: {
          'application/json': { schema: resolver(successEnvelope(MessageResponseSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Forbidden (requires admin)',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  adminMiddleware,
  async (c) => {
    const userId = c.req.param('userId')!;
    await service.evaluateBadges(userId);
    return success(c, { message: 'Badge evaluation completed' });
  },
);

export default badge;
