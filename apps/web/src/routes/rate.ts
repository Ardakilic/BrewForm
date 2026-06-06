import type { ActionFunctionArgs } from 'react-router';
import { recipeApi } from '../api/index.ts';

export const rateAction = async ({ params, request }: ActionFunctionArgs) => {
  const id = params.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Response('Missing or invalid route parameter: id', { status: 400 });
  }
  const form = await request.formData();
  const rawRating = form.get('rating');
  const rating = typeof rawRating === 'string' ? Number(rawRating) : NaN;
  if (!Number.isFinite(rating)) {
    throw new Response('Invalid rating value', { status: 400 });
  }
  return recipeApi.rate(id, rating);
};
