import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { UserPreferencesSchema } from '@brewform/shared/schemas';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { success, error } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const preference = new Hono<AppEnv>();

preference.get('/', authMiddleware, async (c) => {
  const userId = c.get('userId') as string;
  try {
    const prefs = await service.getPreferences(userId);
    return success(c, prefs);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'PREFERENCES_NOT_FOUND') return error(c, 'NOT_FOUND', 'Preferences not found', 404);
    throw err;
  }
});

preference.patch('/', authMiddleware, zValidator('json', UserPreferencesSchema), async (c) => {
  const userId = c.get('userId') as string;
  const body = c.req.valid('json');

  const flatData: any = {};
  if (body.unitSystem !== undefined) flatData.unitSystem = body.unitSystem;
  if (body.temperatureUnit !== undefined) flatData.temperatureUnit = body.temperatureUnit;
  if (body.theme !== undefined) flatData.theme = body.theme;
  if (body.locale !== undefined) flatData.locale = body.locale;
  if (body.timezone !== undefined) flatData.timezone = body.timezone;
  if (body.dateFormat !== undefined) flatData.dateFormat = body.dateFormat;
  if (body.emailNotifications !== undefined) {
    flatData.newFollower = body.emailNotifications.newFollower;
    flatData.recipeLiked = body.emailNotifications.recipeLiked;
    flatData.recipeCommented = body.emailNotifications.recipeCommented;
    flatData.followedUserPosted = body.emailNotifications.followedUserPosted;
  }

  const prefs = await service.updatePreferences(userId, flatData);
  return success(c, prefs);
});

export default preference;