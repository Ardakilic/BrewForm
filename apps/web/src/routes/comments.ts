import type { ActionFunctionArgs } from 'react-router';
import { commentApi } from '../api/index.ts';

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
  return commentApi.create(recipeId, {
    content,
    ...(parentCommentId ? { parentCommentId } : {}),
  });
};

export const deleteCommentAction = async ({ params }: ActionFunctionArgs) => {
  const id = params.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Response('Missing or invalid comment id', { status: 400 });
  }
  await commentApi.delete(id);
  return null;
};
