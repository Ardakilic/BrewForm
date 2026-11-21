import type { ActionFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { ApiError } from '../api/errors.ts';
import { followApi } from '../api/index.ts';
import { type ActionFailure, toActionFailure } from './action-result.ts';
import { withDataLog } from './data-logging.ts';

const logger = createLogger('follow');

/**
 * Result of {@link followAction}: the new follow state, or the failure with the state the user had
 * before the click (`following`, implied by the method: a failed follow leaves `false`, a failed
 * unfollow `true`).
 */
export type FollowResult =
  | { ok: true; following: boolean }
  | (ActionFailure & { following?: boolean });

/**
 * Action for `/follow/:userId`: POST follows, DELETE unfollows (with `request.signal`, logged
 * through `withDataLog` with `{ userId, method }`). Returns `{ ok: true, following }` (the new
 * state) or `{ ok: false, error, code? }` built with `toActionFailure(err, [])` plus the pre-click
 * `following`, so `FollowButton` falls back to the last confirmed state without a revalidation.
 * Idempotent: a 409 on follow (already following) is `{ ok: true, following: true }` and a 404 on
 * unfollow (not following) is `{ ok: true, following: false }`, logged at debug. A final 401
 * returns `code: 'UNAUTHORIZED'` (a resource route never redirects); only an aborted request
 * throws.
 */
export const followAction = async ({
  params,
  request,
}: ActionFunctionArgs): Promise<FollowResult> => {
  const userId = params.userId ?? '';
  const method = request.method;
  if (!userId) {
    logger.debug({ userId: null, method }, 'followAction invalid userId');
    return { ok: false, error: 'Missing or invalid route parameter: userId' };
  }
  if (method !== 'POST' && method !== 'DELETE') {
    logger.debug({ userId, method }, 'followAction unsupported method');
    return { ok: false, error: 'Unsupported method' };
  }
  const follow = method === 'POST';
  const ids = { userId, method };
  try {
    // The idempotent answer (409 on follow, 404 on unfollow) is a success, not a failure log.
    const alreadyThere = await withDataLog(logger, 'followAction', ids, async () => {
      try {
        if (follow) await followApi.follow(userId, { signal: request.signal });
        else await followApi.unfollow(userId, { signal: request.signal });
        return false;
      } catch (err) {
        if (err instanceof ApiError && err.status === (follow ? 409 : 404)) return true;
        throw err;
      }
    });
    if (alreadyThere) logger.debug(ids, 'followAction already in requested state');
    return { ok: true, following: follow };
  } catch (err) {
    return { ...toActionFailure(err, []), following: !follow };
  }
};
