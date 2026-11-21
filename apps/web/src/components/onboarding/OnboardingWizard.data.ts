import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { ApiError, isAbortError } from '../../api/errors.ts';
import { beanApi, preferencesApi, setupApi } from '../../api/index.ts';
import { type ActionFailure, formString, toActionFailure } from '../../routes/action-result.ts';
import { requireAuth } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('OnboardingWizard');

/** A saved setup offered by the onboarding equipment step. */
export interface OnboardingSetup {
  id: string;
  name: string;
}

/**
 * `/onboarding` loader: the user's saved setups for the optional equipment picker. Guarded by
 * `requireAuth` (a final 401 redirects to `/login?next=%2Fonboarding`). Otherwise best-effort:
 * a failed list must never block the wizard, so it is logged and the step falls back to its
 * "create a setup" call to action (an empty list).
 */
export const loader = requireAuth(
  async ({ request }: LoaderFunctionArgs): Promise<{ setups: OnboardingSetup[] }> => {
    log.debug({}, 'OnboardingWizard loadSetups started');
    try {
      const setups = await setupApi.list({ signal: request.signal });
      log.debug({ count: setups.length }, 'OnboardingWizard loadSetups completed');
      return { setups: setups.map((s) => ({ id: s.id, name: s.name })) };
    } catch (err) {
      if (isAbortError(err) || (err instanceof ApiError && err.status === 401)) throw err;
      log.warn({ err }, 'OnboardingWizard loadSetups failed; showing the create-setup action');
      return { setups: [] };
    }
  },
);

/** Result of the `/onboarding` action. */
export type OnboardingActionResult =
  | { ok: true; intent: 'complete' }
  | { ok: true; intent: 'add-bean'; beanId: string }
  | (ActionFailure & { intent: string });

/**
 * `/onboarding` action, keyed by `intent`: `complete` marks onboarding done in the preferences
 * (`PATCH /preferences { onboardingCompleted: true }`, used by both Skip and Get Started);
 * `add-bean` quick-adds a bean from `origin`/`roaster` (named after whichever is given).
 * Returns `{ ok: true, … }` or `{ ok: false, error, intent }`; a final 401 redirects through
 * `requireAuth`.
 */
export const action = requireAuth(
  async ({ request }: ActionFunctionArgs): Promise<OnboardingActionResult> => {
    const form = await request.formData();
    const intent = formString(form, 'intent');
    const opts = { signal: request.signal };
    try {
      if (intent === 'complete') {
        await withDataLog(log, 'OnboardingWizard completeOnboarding', {}, () =>
          preferencesApi.update({ onboardingCompleted: true }, opts),
        );
        return { ok: true, intent: 'complete' };
      }
      if (intent === 'add-bean') {
        const origin = formString(form, 'origin').trim();
        const roaster = formString(form, 'roaster').trim();
        const bean = await withDataLog(log, 'OnboardingWizard addBean', {}, () =>
          beanApi.create(
            {
              name: origin || roaster,
              ...(origin ? { origin } : {}),
              ...(roaster ? { roaster } : {}),
            },
            opts,
          ),
        );
        return { ok: true, intent: 'add-bean', beanId: bean.id };
      }
      return { ok: false, intent, error: 'Unknown intent' };
    } catch (err) {
      return { ...toActionFailure(err), intent };
    }
  },
);
