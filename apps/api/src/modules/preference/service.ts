/**
 * User preference business logic for BrewForm.
 *
 * Provides retrieval (with explicit not-found error) and update/upsert of
 * per-user preference records.
 */
import * as model from './model.ts';
import { createLogger } from '../../utils/logger/index.ts';

export const log = createLogger('preference-service');

/** Get preferences for the authenticated user. Throws PREFERENCES_NOT_FOUND if none exist. */
export async function getPreferences(userId: string) {
  log.debug({ userId }, 'getPreferences started');
  const prefs = await model.findByUserId(userId);
  if (!prefs) {
    const err = new Error('PREFERENCES_NOT_FOUND');
    log.error({ err, userId }, 'getPreferences failed: preferences not found');
    throw err;
  }
  log.debug({ userId }, 'getPreferences completed');
  return prefs;
}

/** Insert or update preferences for the authenticated user. */
export async function updatePreferences(userId: string, data: any) {
  log.debug({ userId }, 'updatePreferences started');
  const result = await model.upsert(userId, data);
  log.debug({ userId }, 'updatePreferences completed');
  return result;
}
