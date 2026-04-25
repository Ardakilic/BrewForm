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