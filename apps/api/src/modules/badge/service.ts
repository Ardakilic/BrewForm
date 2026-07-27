/**
 * Badge business logic for BrewForm.
 *
 * Exposes badge listing, per-user badge retrieval, single-user evaluation
 * (triggered by activity hooks), and a batch evaluator for all non-deleted
 * users. Batch evaluation processes users in cursor-paginated batches of 100.
 */
import * as model from './model.ts';
import { db } from '@brewform/db';
import { users } from '@brewform/db/schema';
import { and, asc, gt, isNull } from 'drizzle-orm';
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
    const userBatch = await db.select({ id: users.id })
      .from(users)
      .where(lastId ? and(isNull(users.deletedAt), gt(users.id, lastId)) : isNull(users.deletedAt))
      .orderBy(asc(users.id))
      .limit(BATCH_SIZE);

    if (userBatch.length === 0) {
      break;
    }

    for (const user of userBatch) {
      try {
        await model.evaluateBadges(user.id);
      } catch (err) {
        logger.error({ err, userId: user.id }, 'evaluateBadges failed');
      }
    }

    lastId = userBatch[userBatch.length - 1].id;
  }
}
