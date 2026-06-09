import type { ActionFunctionArgs } from 'react-router';
import { followApi } from '../api/index.ts';
import { createLogger } from '@/utils/logger.ts';

const logger = createLogger('follow');

export const followAction = async ({ params, request }: ActionFunctionArgs) => {
  const userId = params.userId;
  if (typeof userId !== 'string' || userId.length === 0) {
    return { ok: false, error: 'Missing or invalid userId' };
  }

  logger.debug({ userId, method: request.method }, 'followAction started');

  try {
    if (request.method === 'POST') {
      await followApi.follow(userId);
    } else if (request.method === 'DELETE') {
      await followApi.unfollow(userId);
    } else {
      logger.debug({ userId, method: request.method }, 'followAction.unsupported_method');
      return { ok: false, error: 'Unsupported method' };
    }
    logger.debug({ userId }, 'followAction completed');
    return { ok: true };
  } catch (err: unknown) {
    logger.error({ err, userId }, 'followAction failed');
    return { ok: false, error: err instanceof Error ? err.message : 'Follow action failed' };
  }
};
