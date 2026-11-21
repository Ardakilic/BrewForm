import type { SetupCreate } from '@brewform/shared/schemas';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { setupApi } from '../../api/index.ts';
import { type ActionFailure, formString, toActionFailure } from '../../routes/action-result.ts';
import { requireAuth } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('SetupListPage');

/**
 * `/setups` loader: the signed-in user's brewing setups, with `request.signal`. Wrapped in
 * `requireAuth`, so a final 401 redirects to `/login?next=%2Fsetups`; any other failure
 * renders the route error state.
 */
export const loader = requireAuth(({ request }: LoaderFunctionArgs) =>
  withDataLog(log, 'SetupListPage loadSetups', {}, async () => ({
    setups: await setupApi.list({ signal: request.signal }),
  })),
);

/** The intents the `/setups` action accepts. */
export type SetupListIntent = 'create' | 'delete';

/** Result of the `/setups` action. */
export type SetupListActionResult =
  | { ok: true; intent: SetupListIntent }
  | (ActionFailure & { intent: string });

/** Reads the setup fields from the submitted form (a new setup is never the default). */
function setupInput(form: FormData): SetupCreate {
  return {
    name: formString(form, 'name').trim(),
    isDefault: false,
    brewerDetails: formString(form, 'brewerDetails') || undefined,
    grinder: formString(form, 'grinder') || undefined,
  };
}

/**
 * `/setups` action, keyed by `intent`: `create` (`name`, `brewerDetails`, `grinder`) and
 * `delete` (`id`). Returns `{ ok: true, intent }` or `{ ok: false, intent, error }`; the
 * loader revalidates afterwards. A final 401 redirects through `requireAuth`.
 */
export const action = requireAuth(
  async ({ request }: ActionFunctionArgs): Promise<SetupListActionResult> => {
    const form = await request.formData();
    const intent = formString(form, 'intent');
    const opts = { signal: request.signal };
    try {
      if (intent === 'create') {
        await withDataLog(log, 'SetupListPage createSetup', {}, () =>
          setupApi.create(setupInput(form), opts),
        );
        return { ok: true, intent };
      }
      if (intent === 'delete') {
        const id = formString(form, 'id');
        await withDataLog(log, 'SetupListPage deleteSetup', { setupId: id }, () =>
          setupApi.delete(id, opts),
        );
        return { ok: true, intent };
      }
      return { ok: false, intent, error: 'Unknown intent' };
    } catch (err) {
      return { ...toActionFailure(err), intent };
    }
  },
);
