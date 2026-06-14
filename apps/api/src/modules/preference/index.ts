import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute, resolver } from 'hono-openapi';
import { UserPreferencesSchema } from '@brewform/shared/schemas';
import {
  ErrorEnvelopeSchema,
  successEnvelope,
  UserPreferencesOutputSchema,
} from '@brewform/shared/schemas';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, success } from '../../utils/response/index.ts';
import { jsonRequestBody } from '../../utils/openapi/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const preference = new Hono<AppEnv>();

preference.get(
  '/',
  describeRoute({
    tags: ['Preferences'],
    summary: 'Get preferences',
    description: "Returns the authenticated user's preferences.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'User preferences',
        content: {
          'application/json': { schema: resolver(successEnvelope(UserPreferencesOutputSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      404: {
        description: 'Preferences not found',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  async (c) => {
    const userId = c.get('userId') as string;
    try {
      const prefs = await service.getPreferences(userId);
      return success(c, prefs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'PREFERENCES_NOT_FOUND') {
        return error(c, 'NOT_FOUND', 'Preferences not found', 404);
      }
      throw err;
    }
  },
);

preference.patch(
  '/',
  describeRoute({
    tags: ['Preferences'],
    summary: 'Update preferences',
    description: "Updates the authenticated user's preferences.",
    security: [{ bearerAuth: [] }],
    requestBody: jsonRequestBody(UserPreferencesSchema),
    responses: {
      200: {
        description: 'Updated user preferences',
        content: {
          'application/json': { schema: resolver(successEnvelope(UserPreferencesOutputSchema)) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
    },
  }),
  authMiddleware,
  zValidator('json', UserPreferencesSchema),
  async (c) => {
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
  },
);

export default preference;
