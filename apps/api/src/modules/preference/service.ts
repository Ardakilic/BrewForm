/**
 * User preference business logic for BrewForm.
 *
 * Provides retrieval (with explicit not-found error) and update/upsert of
 * per-user preference records.
 */
import * as model from './model.ts';

/** Get preferences for the authenticated user. Throws PREFERENCES_NOT_FOUND if none exist. */
export async function getPreferences(userId: string) {
  const prefs = await model.findByUserId(userId);
  if (!prefs) throw new Error('PREFERENCES_NOT_FOUND');
  return prefs;
}

/** Insert or update preferences for the authenticated user. */
export async function updatePreferences(userId: string, data: any) {
  return model.upsert(userId, data);
}
