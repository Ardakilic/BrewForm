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

/**
 * Get the authenticated user's own profile with stats.
 *
 * Strips passwordHash from the returned user object.
 * @throws USER_NOT_FOUND if the user doesn't exist
 */
export async function getProfile(userId: string) {
  const user = await model.findById(userId);
  if (!user) throw new Error('USER_NOT_FOUND');
  // deno-lint-ignore no-explicit-any
  const { passwordHash: _passwordHash, ...safe } = user as any;
  const stats = await model.getUserStats(userId);
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
  if (data.displayName !== undefined) data.displayName = sanitizeName(data.displayName);
  if (data.bio !== undefined) data.bio = sanitizeText(data.bio);
  const user = await model.updateProfile(userId, data);
  if (!user) throw new Error('USER_NOT_FOUND');
  // deno-lint-ignore no-explicit-any
  const { passwordHash: _passwordHash, ...safe } = user as any;
  return safe;
}

/** Soft-delete the authenticated user's account. */
export async function deleteAccount(userId: string) {
  await model.deleteUser(userId);
}
