import type { ActionFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { recipeApi } from '../api/index.ts';
import { type ActionFailure, formString, toActionFailure } from './action-result.ts';
import { withDataLog } from './data-logging.ts';

const logger = createLogger('like');

/**
 * Result of {@link likeAction}: the server's new state, or the failure with the state the user
 * had before the click (`liked`, absent when the form did not carry it).
 */
export type LikeResult = { ok: true; liked: boolean } | (ActionFailure & { liked?: boolean });

/**
 * Action toggling the like state of recipe `:id` via `recipeApi.like` (with `request.signal`,
 * logged through `withDataLog`). Returns `{ ok: true, liked }` (the server's new state), or
 * `{ ok: false, error, code? }` built with `toActionFailure(err, [])` plus the pre-click
 * `liked` (the opposite of the submitted value), so `LikeButton` falls back to the last
 * confirmed state without revalidating the recipe loader. A final 401 returns
 * `code: 'UNAUTHORIZED'` (a resource route never redirects); only an aborted request throws.
 */
export const likeAction = async ({ params, request }: ActionFunctionArgs): Promise<LikeResult> => {
  const id = params.id ?? '';
  if (!id) {
    logger.debug({ id: null }, 'likeAction invalid id');
    return { ok: false, error: 'Missing or invalid route parameter: id' };
  }
  const requested = formString(await request.formData(), 'liked');
  try {
    const { liked } = await withDataLog(logger, 'likeAction', { id }, () =>
      recipeApi.like(id, { signal: request.signal }),
    );
    return { ok: true, liked };
  } catch (err) {
    const failure = toActionFailure(err, []);
    return requested ? { ...failure, liked: requested !== 'true' } : failure;
  }
};
