import * as model from './model.ts';

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
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });
  for (const user of users) {
    await model.evaluateBadges(user.id);
  }
}
