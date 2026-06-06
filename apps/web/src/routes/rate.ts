import type { ActionFunctionArgs } from 'react-router';
import { recipeApi } from '../api/index.ts';

export const rateAction = async ({ params, request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const rating = Number(form.get('rating'));
  return recipeApi.rate(params.id!, rating);
};
