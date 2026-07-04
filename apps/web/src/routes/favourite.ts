import type { ActionFunctionArgs } from 'react-router';
import { recipeApi } from '../api/index.ts';
import { createLogger } from '@/utils/logger.ts';

const logger = createLogger('favourite');

/**
 * Action toggling the favourite state of recipe `:id` via
 * `recipeApi.favourite`. Returns `{ ok: true }` or `{ ok: false, error }`
 * so `FavouriteButton` can settle its optimistic UI.
 */
export const favouriteAction = async ({ params }: ActionFunctionArgs) => {
  const id = params.id;
  if (typeof id !== 'string' || id.length === 0) {
    return { ok: false, error: 'Missing route parameter: id' };
  }

  logger.debug({ id }, 'favouriteAction started');

  try {
    await recipeApi.favourite(id);
    logger.debug({ id }, 'favouriteAction completed');
    return { ok: true };
  } catch (err: unknown) {
    logger.error({ err, id }, 'favouriteAction failed');
    return { ok: false, error: err instanceof Error ? err.message : 'Favourite failed' };
  }
};
