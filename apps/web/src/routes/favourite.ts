import type { ActionFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { recipeApi } from '../api/index.ts';
import { type ActionFailure, formString, toActionFailure } from './action-result.ts';
import { withDataLog } from './data-logging.ts';

const logger = createLogger('favourite');

/**
 * Result of {@link favouriteAction}: the server's new state, or the failure with the state the
 * user had before the click (`favourited`, absent when the form did not carry it).
 */
export type FavouriteResult =
  | { ok: true; favourited: boolean }
  | (ActionFailure & { favourited?: boolean });

/**
 * Action toggling the favourite state of recipe `:id` via `recipeApi.favourite` (with
 * `request.signal`, logged through `withDataLog`). Returns `{ ok: true, favourited }` (the server's new state), or
 * `{ ok: false, error, code? }` built with `toActionFailure(err, [])` plus the pre-click
 * `favourited` (the opposite of the submitted value), so `FavouriteButton` falls back to the last
 * confirmed state without revalidating the recipe loader. A final 401 returns
 * `code: 'UNAUTHORIZED'` (a resource route never redirects); only an aborted request throws.
 */
export const favouriteAction = async ({
  params,
  request,
}: ActionFunctionArgs): Promise<FavouriteResult> => {
  const id = params.id ?? '';
  if (!id) {
    logger.debug({ id: null }, 'favouriteAction invalid id');
    return { ok: false, error: 'Missing or invalid route parameter: id' };
  }
  const requested = formString(await request.formData(), 'favourited');
  try {
    const { favourited } = await withDataLog(logger, 'favouriteAction', { id }, () =>
      recipeApi.favourite(id, { signal: request.signal }),
    );
    return { ok: true, favourited };
  } catch (err) {
    const failure = toActionFailure(err, []);
    return requested ? { ...failure, favourited: requested !== 'true' } : failure;
  }
};
