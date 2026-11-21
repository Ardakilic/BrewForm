import type { BeanCreate } from '@brewform/shared/schemas';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { beanApi } from '../../api/index.ts';
import { type ActionFailure, formString, toActionFailure } from '../../routes/action-result.ts';
import { requireAuth } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('BeanListPage');

/**
 * `/beans` loader: the signed-in user's beans, with `request.signal`. Wrapped in
 * `requireAuth`, so a final 401 redirects to `/login?next=%2Fbeans`; any other failure renders
 * the route error state.
 */
export const loader = requireAuth(({ request }: LoaderFunctionArgs) =>
  withDataLog(log, 'BeanListPage loadBeans', {}, async () => ({
    beans: await beanApi.list({ signal: request.signal }),
  })),
);

/** The intents the `/beans` action accepts. */
export type BeanListIntent = 'create' | 'delete';

/** Result of the `/beans` action. */
export type BeanListActionResult =
  | { ok: true; intent: BeanListIntent }
  | (ActionFailure & { intent: string });

/** Reads the bean fields from the submitted form (empty optional fields are omitted). */
function beanInput(form: FormData): BeanCreate {
  return {
    name: formString(form, 'name'),
    brand: formString(form, 'brand') || undefined,
    origin: formString(form, 'origin') || undefined,
    processing: formString(form, 'processing') || undefined,
    roastLevel: formString(form, 'roastLevel') || undefined,
  };
}

/**
 * `/beans` action, keyed by `intent`: `create` (`name`, `brand`, `origin`, `processing`,
 * `roastLevel`) and `delete` (`id`). Returns `{ ok: true, intent }` or
 * `{ ok: false, intent, error }`; the loader revalidates afterwards, so the list shows the
 * saved beans. A final 401 redirects through `requireAuth`.
 */
export const action = requireAuth(
  async ({ request }: ActionFunctionArgs): Promise<BeanListActionResult> => {
    const form = await request.formData();
    const intent = formString(form, 'intent');
    const opts = { signal: request.signal };
    try {
      if (intent === 'create') {
        await withDataLog(log, 'BeanListPage createBean', {}, () =>
          beanApi.create(beanInput(form), opts),
        );
        return { ok: true, intent };
      }
      if (intent === 'delete') {
        const id = formString(form, 'id');
        await withDataLog(log, 'BeanListPage deleteBean', { beanId: id }, () =>
          beanApi.delete(id, opts),
        );
        return { ok: true, intent };
      }
      return { ok: false, intent, error: 'Unknown intent' };
    } catch (err) {
      return { ...toActionFailure(err), intent };
    }
  },
);
