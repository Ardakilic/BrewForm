import type { ActionFunctionArgs } from 'react-router';
import { recipeApi } from '../api/index.ts';
import { createLogger } from '@/utils/logger.ts';

const logger = createLogger('like');

/**
 * Action toggling the like state of recipe `:id` via `recipeApi.like`.
 * Returns `{ ok: true }` or `{ ok: false, error }` so `LikeButton` can
 * settle its optimistic UI.
 */
export const likeAction = async ({ params }: ActionFunctionArgs) => {
  const id = params.id;
  if (typeof id !== 'string' || id.length === 0) {
    logger.debug(
      { route: 'like', id: null, error: 'Missing or invalid route parameter' },
      'route.like.exit.invalid_id',
    );
    return { ok: false, error: 'Missing or invalid route parameter: id' };
  }

  logger.debug({ id }, 'likeAction started');

  try {
    await recipeApi.like(id);
    logger.debug({ id }, 'likeAction completed');
    return { ok: true };
  } catch (err: unknown) {
    const errorType = err instanceof Error ? err.name : typeof err;
    const errorMessage = err instanceof Error ? err.message : undefined;
    logger.error({ errorType, errorMessage, id }, 'likeAction failed');
    return { ok: false, error: errorMessage ?? 'Like failed' };
  }
};
