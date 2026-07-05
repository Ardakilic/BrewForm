import type { ActionFunctionArgs } from 'react-router';
import { recipeApi } from '../api/index.ts';
import { createLogger } from '@/utils/logger.ts';

const logger = createLogger('rate');

/**
 * Action submitting a 1–10 rating for recipe `:id`. Returns the API
 * rating result; throws a 400 Response for a missing id or
 * non-numeric rating.
 */
export const rateAction = async ({ params, request }: ActionFunctionArgs) => {
  const id = params.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Response('Missing or invalid route parameter: id', { status: 400 });
  }
  const form = await request.formData();
  const rawRating = form.get('rating');
  const rating = typeof rawRating === 'string' ? Number(rawRating) : NaN;
  if (!Number.isFinite(rating)) {
    logger.error({ id, rating: rawRating }, 'rateAction invalid rating value');
    throw new Response('Invalid rating value', { status: 400 });
  }

  logger.debug({ id, rating }, 'rateAction started');

  const result = await recipeApi.rate(id, rating);

  logger.debug({ id, rating }, 'rateAction completed');

  return result;
};
