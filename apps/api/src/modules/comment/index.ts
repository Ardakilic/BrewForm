import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute, resolver } from 'hono-openapi';
import { CommentCreateSchema, PaginationSchema } from '@brewform/shared/schemas';
import {
  CommentOutputSchema,
  CommentWithRepliesOutputSchema,
  ErrorEnvelopeSchema,
  MessageResponseSchema,
  paginatedEnvelope,
  successEnvelope,
} from '@brewform/shared/schemas';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, isEmailVerified, paginated, success } from '../../utils/response/index.ts';
import { jsonRequestBody } from '../../utils/openapi/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const comment = new Hono<AppEnv>();

comment.post(
  '/recipe/:recipeId',
  describeRoute({
    tags: ['Comments'],
    summary: 'Create a comment on a recipe',
    description: 'Creates a comment (or reply) on a recipe. Requires a verified email.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'recipeId', in: 'path', required: true, schema: { type: 'string' } },
    ],
    requestBody: jsonRequestBody(CommentCreateSchema),
    responses: {
      201: {
        description: 'Comment created',
        content: {
          'application/json': { schema: resolver(successEnvelope(CommentOutputSchema)) },
        },
      },
      400: {
        description: 'Comment thread depth limit exceeded',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Email not verified, or only the recipe author may reply',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Parent comment not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  zValidator('json', CommentCreateSchema),
  async (c) => {
    if (!isEmailVerified(c)) {
      return error(c, 'EMAIL_NOT_VERIFIED', 'Please verify your email to perform this action', 403);
    }
    const recipeId = c.req.param('recipeId')!;
    const userId = c.get('userId') as string;
    const user = c.get('user') as { isAdmin: boolean } | null;
    const isAdmin = user?.isAdmin ?? false;
    const body = c.req.valid('json');
    try {
      const result = await service.createComment(
        userId,
        recipeId,
        body.content,
        isAdmin,
        body.parentCommentId,
      );
      return success(c, result, 201);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'COMMENT_NOT_FOUND') {
        return error(
          c,
          'NOT_FOUND',
          'Parent comment not found',
          404,
        );
      }
      if (message === 'FORBIDDEN') {
        return error(
          c,
          'FORBIDDEN',
          'Only the recipe author can reply to comments',
          403,
        );
      }
      if (message === 'COMMENT_DEPTH_EXCEEDED') {
        return error(c, 'BAD_REQUEST', 'Comment thread depth limit exceeded', 400);
      }
      throw err;
    }
  },
);

comment.get(
  '/recipe/:recipeId',
  describeRoute({
    tags: ['Comments'],
    summary: 'List comments for a recipe',
    description: 'Paginated list of top-level comments with their replies.',
    parameters: [
      { name: 'recipeId', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
      { name: 'perPage', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
    ],
    responses: {
      200: {
        description: 'Paginated list of comments with replies',
        content: {
          'application/json': {
            schema: resolver(paginatedEnvelope(CommentWithRepliesOutputSchema)),
          },
        },
      },
    },
  }),
  zValidator('query', PaginationSchema),
  async (c) => {
    const recipeId = c.req.param('recipeId')!;
    const { page, perPage } = c.req.valid('query');
    const result = await service.listComments(recipeId, page, perPage);
    return paginated(c, result.comments, {
      page,
      perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / perPage),
    });
  },
);

comment.delete(
  '/:id',
  describeRoute({
    tags: ['Comments'],
    summary: 'Delete a comment',
    description: 'Deletes a comment owned by the authenticated user (or by an admin).',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      200: {
        description: 'Comment deleted',
        content: {
          'application/json': { schema: resolver(successEnvelope(MessageResponseSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      403: {
        description: 'Not your comment',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Comment not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  async (c) => {
    const id = c.req.param('id')!;
    const userId = c.get('userId') as string;
    const user = c.get('user') as { isAdmin: boolean } | null;
    const isAdmin = user?.isAdmin ?? false;
    try {
      await service.deleteComment(userId, id, isAdmin);
      return success(c, { message: 'Comment deleted' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'COMMENT_NOT_FOUND') return error(c, 'NOT_FOUND', 'Comment not found', 404);
      if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your comment', 403);
      throw err;
    }
  },
);

export default comment;
