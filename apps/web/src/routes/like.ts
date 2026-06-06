import type { ActionFunctionArgs } from 'react-router';
import { recipeApi } from '../api/index.ts';

export const likeAction = async ({ params }: ActionFunctionArgs) => {
  const id = params.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Response('Missing or invalid route parameter: id', { status: 400 });
  }
  await recipeApi.like(id);
  return null;
};
