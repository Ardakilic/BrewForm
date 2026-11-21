import type { UserPreferences, UserPreferencesOutput } from '@brewform/shared/schemas';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { preferencesApi, userApi } from '../../api/index.ts';
import { type ActionFailure, toActionFailure } from '../../routes/action-result.ts';
import { requireAuth } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('SettingsPage');

/**
 * Convert the flat GET response to the form state. F05 flatten: the request
 * and response share the same flat `notify*` shape (no `emailNotifications`
 * re-nest step anymore).
 */
export function toUserPreferences(out: UserPreferencesOutput): UserPreferences {
  return {
    unitSystem: out.unitSystem as UserPreferences['unitSystem'],
    temperatureUnit: out.temperatureUnit as UserPreferences['temperatureUnit'],
    theme: out.theme as UserPreferences['theme'],
    locale: out.locale,
    timezone: out.timezone,
    dateFormat: out.dateFormat as UserPreferences['dateFormat'],
    notifyNewFollower: out.notifyNewFollower,
    notifyRecipeLiked: out.notifyRecipeLiked,
    notifyRecipeCommented: out.notifyRecipeCommented,
    notifyFollowedUserPosted: out.notifyFollowedUserPosted,
    notifyMentionedInComment: out.notifyMentionedInComment,
  };
}

/**
 * `/settings` loader: the current user's stored preferences as `{ preferences }`. Wrapped in
 * `requireAuth`, so a final 401 redirects to `/login?next=%2Fsettings`.
 */
export const loader = requireAuth(({ request }: LoaderFunctionArgs) =>
  withDataLog(log, 'SettingsPage loadPreferences', {}, async () => ({
    preferences: toUserPreferences(await preferencesApi.get({ signal: request.signal })),
  })),
);

/** JSON body submitted to the `/settings` action, keyed by `intent`. */
export type SettingsActionInput =
  | { intent: 'save-preferences'; preferences: UserPreferences }
  | { intent: 'delete-account' };

/** Result of the `/settings` action. */
export type SettingsActionResult =
  | { ok: true; intent: 'save-preferences' | 'delete-account' }
  | (ActionFailure & { intent: string });

/**
 * `/settings` action (JSON body, keyed by `intent`): `save-preferences` PATCHes the
 * preference fields (theme is applied locally and not sent), `delete-account` deletes the
 * account via `userApi.deleteAccount`. Returns `{ ok: true, intent }` or
 * `{ ok: false, error, intent }`; a final 401 redirects through `requireAuth`.
 */
export const action = requireAuth(
  async ({ request }: ActionFunctionArgs): Promise<SettingsActionResult> => {
    const input = (await request.json()) as SettingsActionInput;
    const opts = { signal: request.signal };
    try {
      if (input.intent === 'save-preferences') {
        const p = input.preferences;
        await withDataLog(log, 'SettingsPage savePreferences', {}, () =>
          // F05: flat `notify*` flags sent directly (no `emailNotifications` nest).
          preferencesApi.update(
            {
              unitSystem: p.unitSystem,
              temperatureUnit: p.temperatureUnit,
              locale: p.locale,
              timezone: p.timezone,
              dateFormat: p.dateFormat,
              notifyNewFollower: p.notifyNewFollower,
              notifyRecipeLiked: p.notifyRecipeLiked,
              notifyRecipeCommented: p.notifyRecipeCommented,
              notifyFollowedUserPosted: p.notifyFollowedUserPosted,
              notifyMentionedInComment: p.notifyMentionedInComment,
            },
            opts,
          ),
        );
        return { ok: true, intent: 'save-preferences' };
      }
      if (input.intent === 'delete-account') {
        await withDataLog(log, 'SettingsPage deleteAccount', {}, () => userApi.deleteAccount(opts));
        return { ok: true, intent: 'delete-account' };
      }
      return {
        ok: false,
        intent: String((input as { intent?: unknown }).intent),
        error: 'Unknown intent',
      };
    } catch (err) {
      return { ...toActionFailure(err), intent: input.intent };
    }
  },
);
