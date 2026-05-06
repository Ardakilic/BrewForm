import * as model from './model.ts';
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
  const { prisma } = await import('@brewform/db');
  const BATCH_SIZE = 100;
  let cursor: { id: string } | undefined;

  while (true) {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      skip: cursor ? 1 : undefined,
      cursor,
    });

    if (users.length === 0) {
      break;
    }

    for (const user of users) {
      try {
        await model.evaluateBadges(user.id);
      } catch (err) {
        logger.error({ err, userId: user.id }, 'evaluateBadges failed');
      }
    }

    cursor = { id: users[users.length - 1].id };
  }
}
