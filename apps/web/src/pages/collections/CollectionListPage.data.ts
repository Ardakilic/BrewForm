import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { collectionApi } from '../../api/index.ts';
import { requireAuth } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';
import { parsePageOnlyParams } from '../../utils/list-parsers.ts';

const log = createLogger('CollectionListPage');

/** Collections per page on `/collections`. */
export const COLLECTIONS_PER_PAGE = 20;

/**
 * `/collections` loader: the signed-in user's collections (all visibilities) for the
 * requested `?page`, as `{ collectionsResponse }`. Passes `request.signal`, so a superseded
 * navigation aborts the request. Wrapped in `requireAuth`, so a final 401 redirects to
 * `/login?next=…`.
 */
export const loader = requireAuth(({ request }: LoaderFunctionArgs) => {
  const { page } = parsePageOnlyParams(new URL(request.url).searchParams);
  return withDataLog(log, 'CollectionListPage loadCollections', { page }, async () => ({
    collectionsResponse: await collectionApi.list(
      { page: String(page), perPage: String(COLLECTIONS_PER_PAGE) },
      { signal: request.signal },
    ),
  }));
});
