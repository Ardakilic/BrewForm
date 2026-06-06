import type { ActionFunctionArgs } from 'react-router';
import { commentApi } from '../api/index.ts';

export const createCommentAction = async ({ params, request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const content = form.get('content') as string;
  const parentCommentId = form.get('parentCommentId') as string | null;
  return commentApi.create(params.recipeId!, {
    content,
    ...(parentCommentId ? { parentCommentId } : {}),
  });
};

export const deleteCommentAction = async ({ params }: ActionFunctionArgs) => {
  await commentApi.delete(params.id!);
  return null;
};
