import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { PaginationSchema } from '@brewform/shared/schemas';
import {
  cursorEnvelope,
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
import {
  cursorPaginated,
  error,
  invalidCursor,
  paginated,
  success,
} from '../../utils/response/index.ts';
import { decodeCursor } from '@brewform/shared/utils';
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
    description:
      'Paginated feed of recipes from users the authenticated user follows. Supports cursor-based pagination when `cursor` is provided. When offset pagination is active, `meta.pagination` replaces `meta.cursor`.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'perPage', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'cursor', in: 'query', required: false, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description:
          'Paginated feed of recipes. Returns `meta.cursor` when cursor pagination is active, or `meta.pagination` when offset pagination is active.',
        content: {
          'application/json': {
            schema: resolver(
              z.union([
                cursorEnvelope(FeedRecipeOutputSchema),
                paginatedEnvelope(FeedRecipeOutputSchema),
              ]),
            ),
          },
        },
      },
      400: {
        description: 'Invalid cursor',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  zValidator(
    'query',
    z.object({
      page: z.coerce.number().int().positive().default(1).optional(),
      perPage: z.coerce.number().int().positive().max(100).default(20).optional(),
      cursor: z.string().optional(),
    }),
  ),
  async (c) => {
    const userId = c.get('userId') as string;
    const { page, perPage, cursor } = c.req.valid('query');
    const effectivePage = page ?? 1;
    const effectivePerPage = perPage ?? 20;

    if (cursor) {
      let decoded: { createdAt: string; id: string };
      try {
        decoded = decodeCursor(cursor);
      } catch {
        return invalidCursor(c);
      }
      const result = await service.getFeed(userId, effectivePage, effectivePerPage, decoded);
      if (service.isFeedOffsetResult(result)) {
        return paginated(c, result.recipes, {
          page: effectivePage,
          perPage: effectivePerPage,
          total: result.total,
          totalPages: Math.ceil(result.total / effectivePerPage),
        });
      }
      return cursorPaginated(c, result.recipes, {
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
        total: result.total,
      });
    }

    const offsetResult = await service.getFeed(userId, effectivePage, effectivePerPage);
    if (!service.isFeedOffsetResult(offsetResult)) {
      // A cursor was not provided, so the service should never return cursor meta here.
      throw new Error('Unexpected cursor result without cursor parameter');
    }
    return paginated(c, offsetResult.recipes, {
      page: effectivePage,
      perPage: effectivePerPage,
      total: offsetResult.total,
      totalPages: Math.ceil(offsetResult.total / effectivePerPage),
    });
  },
);

export default follow;
