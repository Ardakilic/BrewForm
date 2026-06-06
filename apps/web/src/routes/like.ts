import type { ActionFunctionArgs } from 'react-router';
import { recipeApi } from '../api/index.ts';

export const likeAction = async ({ params }: ActionFunctionArgs) => {
  await recipeApi.like(params.id!);
  return null;
};
