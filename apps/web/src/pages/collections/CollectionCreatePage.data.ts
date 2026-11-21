import type { CollectionCreate } from '@brewform/shared/schemas';
import { type ActionFunctionArgs, redirect } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { collectionApi } from '../../api/index.ts';
import { type ActionFailure, toActionFailure } from '../../routes/action-result.ts';
import { requireAuth } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('CollectionCreatePage');

/**
 * `/collections/new` action (JSON `CollectionCreate` body built by the page, with
 * `description` only when set): creates the collection and redirects to `/collections/:id`,
 * or returns `{ ok: false, error, code }` for the page to show inline. A final 401 redirects
 * through `requireAuth`. Logs carry the new collection id only, never the name.
 */
export const action = requireAuth(
  async ({ request }: ActionFunctionArgs): Promise<ActionFailure | Response> => {
    const body = (await request.json()) as CollectionCreate;
    try {
      const created = await withDataLog(log, 'CollectionCreatePage createCollection', {}, () =>
        collectionApi.create(body, { signal: request.signal }),
      );
      log.debug({ collectionId: created.id }, 'CollectionCreatePage collection created');
      return redirect(`/collections/${created.id}`);
    } catch (err) {
      return toActionFailure(err);
    }
  },
);
