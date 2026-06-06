import type { ActionFunctionArgs } from 'react-router';
import { commentApi } from '../api/index.ts';
import { createLogger } from '@/utils/logger.ts';

const logger = createLogger('comments');

export const createCommentAction = async ({ params, request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const rawContent = form.get('content');
  if (typeof rawContent !== 'string' || rawContent.trim() === '') {
    throw new Response('Comment content is required', { status: 400 });
  }
  const content = rawContent.trim();
  const recipeId = params.recipeId;
  if (typeof recipeId !== 'string' || recipeId.length === 0) {
    throw new Response('Missing recipe id', { status: 400 });
  }
  const rawParent = form.get('parentCommentId');
  const parentCommentId = typeof rawParent === 'string' && rawParent.length > 0
    ? rawParent
    : undefined;

  logger.debug(
    { recipeId, hasParentCommentId: Boolean(parentCommentId) },
    'createCommentAction started',
  );

  try {
    const created = await commentApi.create(recipeId, {
      content,
      ...(parentCommentId ? { parentCommentId } : {}),
    });
    logger.debug({ recipeId, commentId: created.id }, 'createCommentAction completed');
    return created;
  } catch (err: unknown) {
    logger.error({ err, recipeId }, 'createCommentAction failed');
    throw err;
  }
};

export const deleteCommentAction = async ({ params }: ActionFunctionArgs) => {
  const id = params.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Response('Missing or invalid comment id', { status: 400 });
  }

  logger.debug({ id }, 'deleteCommentAction started');

  try {
    await commentApi.delete(id);
    logger.debug({ id }, 'deleteCommentAction completed');
    return null;
  } catch (err: unknown) {
    logger.error({ err, id }, 'deleteCommentAction failed');
    throw err;
  }
};
