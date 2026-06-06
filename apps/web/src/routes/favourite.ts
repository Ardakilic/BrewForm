import type { ActionFunctionArgs } from 'react-router';
import { recipeApi } from '../api/index.ts';

export const favouriteAction = async ({ params }: ActionFunctionArgs) => {
  const id = params.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Response('Missing route parameter: id', { status: 400 });
  }
  await recipeApi.favourite(id);
  return null;
};
