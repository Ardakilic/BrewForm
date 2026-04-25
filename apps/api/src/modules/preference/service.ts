import * as model from './model.ts';

export async function getPreferences(userId: string) {
  const prefs = await model.findByUserId(userId);
  if (!prefs) throw new Error('PREFERENCES_NOT_FOUND');
  return prefs;
}

export async function updatePreferences(userId: string, data: any) {
  return model.upsert(userId, data);
}