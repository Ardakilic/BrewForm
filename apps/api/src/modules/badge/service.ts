import * as model from './model.ts';
import { db } from '@brewform/db';
import { users } from '@brewform/db/schema';
import { and, asc, gt, isNull } from 'drizzle-orm';
import { createLogger } from '../../utils/logger/index.ts';

const logger = createLogger('badge-service');

export async function listBadges() {
  return model.listBadges();
}

export async function getUserBadges(userId: string) {
  return model.getUserBadges(userId);
}

export async function evaluateBadges(userId: string) {
  await model.evaluateBadges(userId);
}

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
