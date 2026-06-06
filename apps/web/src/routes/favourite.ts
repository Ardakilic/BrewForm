import type { ActionFunctionArgs } from 'react-router';
import { recipeApi } from '../api/index.ts';

export const favouriteAction = async ({ params }: ActionFunctionArgs) => {
  await recipeApi.favourite(params.id!);
  return null;
};
