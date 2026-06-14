import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute, resolver } from 'hono-openapi';
import { PaginationSchema } from '@brewform/shared/schemas';
import {
  ErrorEnvelopeSchema,
  FeedRecipeOutputSchema,
  FollowerListItemOutputSchema,
  FollowingListItemOutputSchema,
  FollowOutputSchema,
  MessageResponseSchema,
  paginatedEnvelope,
  successEnvelope,
} from '@brewform/shared/schemas';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, paginated, success } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const follow = new Hono<AppEnv>();

follow.post(
  '/:userId',
  describeRoute({
    tags: ['Follow'],
    summary: 'Follow a user',
    description: 'Creates a follow relationship from the authenticated user to the target user.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      201: {
        description: 'Follow created',
        content: {
          'application/json': { schema: resolver(successEnvelope(FollowOutputSchema)) },
        },
      },
      400: {
        description: 'Cannot follow yourself',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      409: {
        description: 'Already following this user',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  async (c) => {
    const followingId = c.req.param('userId')!;
    const followerId = c.get('userId') as string;
    try {
      const result = await service.followUser(followerId, followingId);
      return success(c, result, 201);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'CANNOT_FOLLOW_SELF') {
        return error(c, 'BAD_REQUEST', 'Cannot follow yourself', 400);
      }
      if (message === 'ALREADY_FOLLOWING') {
        return error(c, 'CONFLICT', 'Already following this user', 409);
      }
      throw err;
    }
  },
);

follow.delete(
  '/:userId',
  describeRoute({
    tags: ['Follow'],
    summary: 'Unfollow a user',
    description: 'Removes the follow relationship from the authenticated user to the target user.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Unfollowed',
        content: {
          'application/json': { schema: resolver(successEnvelope(MessageResponseSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Follow relationship not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  async (c) => {
    const followingId = c.req.param('userId')!;
    const followerId = c.get('userId') as string;
    try {
      await service.unfollowUser(followerId, followingId);
      return success(c, { message: 'Unfollowed' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'FOLLOW_NOT_FOUND') {
        return error(c, 'NOT_FOUND', 'Follow relationship not found', 404);
      }
      throw err;
    }
  },
);

follow.get(
  '/:userId/followers',
  describeRoute({
    tags: ['Follow'],
    summary: 'List followers',
    description: 'Paginated list of users following the given user.',
    parameters: [
      { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'perPage', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
    ],
    responses: {
      200: {
        description: 'Paginated list of followers',
        content: {
          'application/json': {
            schema: resolver(paginatedEnvelope(FollowerListItemOutputSchema)),
          },
        },
      },
    },
  }),
  zValidator('query', PaginationSchema),
  async (c) => {
    const userId = c.req.param('userId')!;
    const { page, perPage } = c.req.valid('query');
    const result = await service.getFollowers(userId, page, perPage);
    return paginated(c, result.followers, {
      page,
      perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / perPage),
    });
  },
);

follow.get(
  '/:userId/following',
  describeRoute({
    tags: ['Follow'],
    summary: 'List following',
    description: 'Paginated list of users the given user is following.',
    parameters: [
      { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'perPage', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
    ],
    responses: {
      200: {
        description: 'Paginated list of following',
        content: {
          'application/json': {
            schema: resolver(paginatedEnvelope(FollowingListItemOutputSchema)),
          },
        },
      },
    },
  }),
  zValidator('query', PaginationSchema),
  async (c) => {
    const userId = c.req.param('userId')!;
    const { page, perPage } = c.req.valid('query');
    const result = await service.getFollowing(userId, page, perPage);
    return paginated(c, result.following, {
      page,
      perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / perPage),
    });
  },
);

follow.get(
  '/feed',
  describeRoute({
    tags: ['Follow'],
    summary: 'Get the followed-users feed',
    description: 'Paginated feed of recipes from users the authenticated user follows.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'perPage', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
    ],
    responses: {
      200: {
        description: 'Paginated feed of recipes',
        content: {
          'application/json': { schema: resolver(paginatedEnvelope(FeedRecipeOutputSchema)) },
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
    const result = await service.getFeed(userId, page, perPage);
    return paginated(c, result.recipes, {
      page,
      perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / perPage),
    });
  },
);

export default follow;
