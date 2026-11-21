import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { collectionApi } from '../../api/index.ts';
import { withDataLog } from '../../routes/data-logging.ts';
import { parsePageOnlyParams } from '../../utils/list-parsers.ts';

const log = createLogger('CollectionsBrowsePage');

/** Public collections per page on `/collections/browse`. */
export const BROWSE_COLLECTIONS_PER_PAGE = 20;

/**
 * `/collections/browse` loader: the requested `?page` of public collections, as
 * `{ collectionsResponse }`. Passes `request.signal`, so a superseded navigation aborts the
 * request.
 */
export function loader({ request }: LoaderFunctionArgs) {
  const { page } = parsePageOnlyParams(new URL(request.url).searchParams);
  return withDataLog(log, 'CollectionsBrowsePage loadCollections', { page }, async () => ({
    collectionsResponse: await collectionApi.listPublic(
      { page: String(page), perPage: String(BROWSE_COLLECTIONS_PER_PAGE) },
      { signal: request.signal },
    ),
  }));
}
