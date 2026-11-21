import type { CollectionUpdate } from '@brewform/shared/schemas';
import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { collectionApi } from '../../api/index.ts';
import { type ActionFailure, toActionFailure } from '../../routes/action-result.ts';
import { requireAuth } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';
import { loadCollection } from './CollectionDetailPage.data.ts';

const log = createLogger('CollectionEditPage');

/**
 * `/collections/:id/edit` loader: the collection to edit, as `{ collection }`. A missing
 * collection (API 404) renders the not-found page. Wrapped in `requireAuth`, so a final 401
 * redirects to `/login?next=…`.
 */
export const loader = requireAuth(async ({ params, request }: LoaderFunctionArgs) => ({
  collection: await loadCollection(
    log,
    'CollectionEditPage loadCollection',
    params.id,
    request.signal,
  ),
}));

/**
 * `/collections/:id/edit` action (JSON `CollectionUpdate` body built by the page, with
 * `description` only when it changed): updates the collection and redirects to
 * `/collections/:id`, or returns `{ ok: false, error, code }` for the page to show inline. A
 * final 401 redirects through `requireAuth`. Logs carry the collection id only.
 */
export const action = requireAuth(
  async ({ params, request }: ActionFunctionArgs): Promise<ActionFailure | Response> => {
    const collectionId = params.id ?? '';
    const body = (await request.json()) as CollectionUpdate;
    try {
      await withDataLog(log, 'CollectionEditPage updateCollection', { collectionId }, () =>
        collectionApi.update(collectionId, body, { signal: request.signal }),
      );
      return redirect(`/collections/${collectionId}`);
    } catch (err) {
      return toActionFailure(err);
    }
  },
);
