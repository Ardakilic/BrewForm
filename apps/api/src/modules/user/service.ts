import { sanitizeText, sanitizeName } from '../../utils/sanitize.ts';
import * as model from './model.ts';
import * as followModel from '../follow/model.ts';

export async function getProfile(userId: string) {
  const user = await model.findById(userId);
  if (!user) throw new Error('USER_NOT_FOUND');
  // deno-lint-ignore no-explicit-any
  const { passwordHash: _passwordHash, ...safe } = user as any;
  const stats = await model.getUserStats(userId);
  return { ...safe, ...stats };
}

export async function getPublicProfile(username: string, requesterId?: string) {
  const user = await model.findByUsername(username);
  if (!user) throw new Error('USER_NOT_FOUND');
  // deno-lint-ignore no-explicit-any
  const { passwordHash: _passwordHash, email: _email, ...safe } = user as any;
  const [stats, recipes] = await Promise.all([
    model.getUserStats(user.id),
    model.getUserPublicRecipes(user.id),
  ]);
  return {
    ...safe,
    ...stats,
    recipes,
    badges: [], // badges are not yet fetched for public profiles
    isFollowing: requesterId ? await followModel.isFollowing(requesterId, user.id) : false,
  };
}

export async function updateProfile(
  userId: string,
  data: { displayName?: string; bio?: string; avatarUrl?: string },
) {
  if (data.displayName !== undefined) data.displayName = sanitizeName(data.displayName);
  if (data.bio !== undefined) data.bio = sanitizeText(data.bio);
  const user = await model.updateProfile(userId, data);
  // deno-lint-ignore no-explicit-any
  const { passwordHash: _passwordHash, ...safe } = user as any;
  return safe;
}

export async function deleteAccount(userId: string) {
  await model.deleteUser(userId);
}
