/**
 * User business logic for BrewForm.
 *
 * Orchestrates profile retrieval with sensitive-field stripping, public profile
 * enrichment (stats, recipes, follow status), profile updates with input
 * sanitization, and account soft-deletion.
 */
import { sanitizeName, sanitizeText } from '../../utils/sanitize.ts';
import * as model from './model.ts';
import * as followModel from '../follow/model.ts';
import { createLogger } from '../../utils/logger/index.ts';

export const log = createLogger('user-service');

/**
 * Get the authenticated user's own profile with stats.
 *
 * Strips passwordHash from the returned user object.
 * @throws USER_NOT_FOUND if the user doesn't exist
 */
export async function getProfile(userId: string) {
  log.debug({ userId }, 'getProfile started');
  const user = await model.findById(userId);
  if (!user) {
    log.error({ userId }, 'getProfile failed: user not found');
    throw new Error('USER_NOT_FOUND');
  }
  const { passwordHash: _passwordHash, ...safe } = user;
  const stats = await model.getUserStats(userId);
  log.debug({ userId }, 'getProfile completed');
  return { ...safe, ...stats };
}

/**
 * Get a public profile by username with stats, recipes, and follow status.
 *
 * Strips passwordHash and email. Optionally includes isFollowing when a
 * requesterId is provided.
 * @throws USER_NOT_FOUND if the username doesn't exist
 */
export async function getPublicProfile(username: string, requesterId?: string) {
  log.debug({ username, requesterId }, 'getPublicProfile started');
  const user = await model.findByUsername(username);
  if (!user) {
    log.error({ username }, 'getPublicProfile failed: user not found');
    throw new Error('USER_NOT_FOUND');
  }
  const { passwordHash: _passwordHash, email: _email, ...safe } = user;
  const [stats, recipes] = await Promise.all([
    model.getUserStats(user.id),
    model.getUserPublicRecipes(user.id),
  ]);
  log.debug({ username, requesterId }, 'getPublicProfile completed');
  return {
    ...safe,
    ...stats,
    recipes,
    badges: [], // badges are not yet fetched for public profiles
    isFollowing: requesterId ? await followModel.isFollowing(requesterId, user.id) : false,
  };
}

/**
 * Update the authenticated user's profile.
 *
 * Sanitizes displayName and bio inputs before persisting.
 * Strips passwordHash from the returned user object.
 */
export async function updateProfile(
  userId: string,
  data: { displayName?: string; bio?: string; avatarUrl?: string },
) {
  log.debug({ userId }, 'updateProfile started');
  if (data.displayName !== undefined) data.displayName = sanitizeName(data.displayName);
  if (data.bio !== undefined) data.bio = sanitizeText(data.bio);
  const user = await model.updateProfile(userId, data);
  if (!user) {
    log.error({ userId }, 'updateProfile failed: user not found');
    throw new Error('USER_NOT_FOUND');
  }
  const { passwordHash: _passwordHash, ...safe } = user;
  log.debug({ userId }, 'updateProfile completed');
  return safe;
}

/** Soft-delete the authenticated user's account. */
export async function deleteAccount(userId: string) {
  log.debug({ userId }, 'deleteAccount started');
  await model.deleteUser(userId);
  log.debug({ userId }, 'deleteAccount completed');
}
