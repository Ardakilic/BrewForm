import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute, resolver } from 'hono-openapi';
import { UserPreferencesPatchSchema } from '@brewform/shared/schemas';
import {
  ErrorEnvelopeSchema,
  successEnvelope,
  UserPreferencesOutputSchema,
} from '@brewform/shared/schemas';
import { authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import type { PreferenceUpdate } from './model.ts';
import { error, success } from '../../utils/response/index.ts';
import { jsonRequestBody } from '../../utils/openapi/index.ts';
import type { AppEnv } from '../../types/hono.ts';

/** Hono sub-router for preference endpoints, mounted at `/api/v1/preferences`. */
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
    requestBody: jsonRequestBody(UserPreferencesPatchSchema),
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
  zValidator('json', UserPreferencesPatchSchema),
  async (c) => {
    const userId = c.get('userId') as string;
    const body = c.req.valid('json');

    // F05: flat `notify*` field identity-copy from the PATCH-only schema.
    // `UserPreferencesPatchSchema` makes every field optional with NO defaults,
    // so omitted fields parse to `undefined` and the `!== undefined` guards
    // below skip them — omitted preferences remain unchanged. The earlier
    // `UserPreferencesSchema` (with `.default(true)` on booleans) would fill
    // omitted fields to `true` and silently overwrite stored values.
    const flatData: PreferenceUpdate = {};
    if (body.unitSystem !== undefined) flatData.unitSystem = body.unitSystem;
    if (body.temperatureUnit !== undefined) flatData.temperatureUnit = body.temperatureUnit;
    if (body.theme !== undefined) flatData.theme = body.theme;
    if (body.locale !== undefined) flatData.locale = body.locale;
    if (body.timezone !== undefined) flatData.timezone = body.timezone;
    if (body.dateFormat !== undefined) flatData.dateFormat = body.dateFormat;
    if (body.notifyNewFollower !== undefined) flatData.notifyNewFollower = body.notifyNewFollower;
    if (body.notifyRecipeLiked !== undefined) flatData.notifyRecipeLiked = body.notifyRecipeLiked;
    if (body.notifyRecipeCommented !== undefined) {
      flatData.notifyRecipeCommented = body.notifyRecipeCommented;
    }
    if (body.notifyFollowedUserPosted !== undefined) {
      flatData.notifyFollowedUserPosted = body.notifyFollowedUserPosted;
    }
    if (body.notifyMentionedInComment !== undefined) {
      flatData.notifyMentionedInComment = body.notifyMentionedInComment;
    }

    const prefs = await service.updatePreferences(userId, flatData);
    return success(c, prefs);
  },
);

export default preference;
