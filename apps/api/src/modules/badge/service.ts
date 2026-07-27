/**
 * Badge business logic for BrewForm.
 *
 * Exposes badge listing, per-user badge retrieval, single-user evaluation
 * (triggered by activity hooks), and a batch evaluator for all non-deleted
 * users. Batch evaluation processes users in cursor-paginated batches of 100.
 */
import * as model from './model.ts';
import * as userModel from '../user/model.ts';
import { createLogger } from '../../utils/logger/index.ts';

const logger = createLogger('badge-service');

/** List all available badge definitions. */
export function listBadges() {
  return model.listBadges();
}

/** Get all badges awarded to a user. */
export function getUserBadges(userId: string) {
  return model.getUserBadges(userId);
}

/** Evaluate and award any newly met badges for a single user. */
export async function evaluateBadges(userId: string) {
  await model.evaluateBadges(userId);
}

/**
 * Evaluate badges for all non-deleted users in cursor-paginated batches.
 *
 * Processes users in batches of 100 to avoid memory pressure.
 * Errors for individual users are logged but do not abort the batch.
 */
export async function evaluateAllBadges() {
  const BATCH_SIZE = 100;
  let lastId: string | undefined;

  while (true) {
    const userIds = await userModel.listActiveUserIds(lastId ?? null, BATCH_SIZE);

    if (userIds.length === 0) {
      break;
    }

    for (const userId of userIds) {
      try {
        await model.evaluateBadges(userId);
      } catch (err) {
        logger.error({ err, userId }, 'evaluateBadges failed');
      }
    }

    lastId = userIds[userIds.length - 1];
  }
}
