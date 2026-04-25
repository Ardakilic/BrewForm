import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CommentCreateSchema, PaginationSchema } from '@brewform/shared/schemas';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { success, error, paginated } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const comment = new Hono<AppEnv>();

comment.post('/recipe/:recipeId', authMiddleware, zValidator('json', CommentCreateSchema), async (c) => {
  const recipeId = c.req.param('recipeId')!;
  const userId = c.get('userId') as string;
  const body = c.req.valid('json');
  try {
    const result = await service.createComment(userId, recipeId, body.content, body.parentCommentId);
    return success(c, result, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'COMMENT_NOT_FOUND') return error(c, 'NOT_FOUND', 'Parent comment not found', 404);
    if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Only the recipe author can reply to comments', 403);
    throw err;
  }
});

comment.get('/recipe/:recipeId', zValidator('query', PaginationSchema), async (c) => {
  const recipeId = c.req.param('recipeId')!;
  const { page, perPage } = c.req.valid('query');
  const result = await service.listComments(recipeId, page, perPage);
  return paginated(c, result.comments, {
    page,
    perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / perPage),
  });
});

comment.delete('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id')!;
  const userId = c.get('userId') as string;
  try {
    await service.deleteComment(userId, id);
    return success(c, { message: 'Comment deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'COMMENT_NOT_FOUND') return error(c, 'NOT_FOUND', 'Comment not found', 404);
    if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your comment', 403);
    throw err;
  }
});

export default comment;