import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { FollowSchema, PaginationSchema } from '@brewform/shared/schemas';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { success, error, paginated } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const follow = new Hono<AppEnv>();

follow.post('/:userId', authMiddleware, async (c) => {
  const followingId = c.req.param('userId')!;
  const followerId = c.get('userId') as string;
  try {
    const result = await service.followUser(followerId, followingId);
    return success(c, result, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'CANNOT_FOLLOW_SELF') return error(c, 'BAD_REQUEST', 'Cannot follow yourself', 400);
    if (message === 'ALREADY_FOLLOWING') return error(c, 'CONFLICT', 'Already following this user', 409);
    throw err;
  }
});

follow.delete('/:userId', authMiddleware, async (c) => {
  const followingId = c.req.param('userId')!;
  const followerId = c.get('userId') as string;
  try {
    await service.unfollowUser(followerId, followingId);
    return success(c, { message: 'Unfollowed' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'FOLLOW_NOT_FOUND') return error(c, 'NOT_FOUND', 'Follow relationship not found', 404);
    throw err;
  }
});

follow.get('/:userId/followers', zValidator('query', PaginationSchema), async (c) => {
  const userId = c.req.param('userId')!;
  const { page, perPage } = c.req.valid('query');
  const result = await service.getFollowers(userId, page, perPage);
  return paginated(c, result.followers, {
    page,
    perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / perPage),
  });
});

follow.get('/:userId/following', zValidator('query', PaginationSchema), async (c) => {
  const userId = c.req.param('userId')!;
  const { page, perPage } = c.req.valid('query');
  const result = await service.getFollowing(userId, page, perPage);
  return paginated(c, result.following, {
    page,
    perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / perPage),
  });
});

follow.get('/feed', authMiddleware, zValidator('query', PaginationSchema), async (c) => {
  const userId = c.get('userId') as string;
  const { page, perPage } = c.req.valid('query');
  const result = await service.getFeed(userId, page, perPage);
  return paginated(c, result.recipes, {
    page,
    perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / perPage),
  });
});

export default follow;