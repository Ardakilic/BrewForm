import type { BrewLogListItemOutput, PaginatedResponse } from '@brewform/shared/schemas';
import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { brewLogApi } from '../../api/index.ts';
import { requireAuth } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';
import { parsePageOnlyParams } from '../../utils/list-parsers.ts';

const log = createLogger('BrewLogListPage');

/** Loader payload for `BrewLogListPage`. */
export interface BrewLogListLoaderData {
  logsResponse: PaginatedResponse<BrewLogListItemOutput>;
}

/**
 * `/brew-logs` loader: the signed-in user's brew journal for the requested `?page` (newest
 * first, paginated), requested with `request.signal`. The page is read with the shared list
 * parser (`parsePageOnlyParams`): a positive integer is kept, anything else (negative,
 * infinite, zero, missing, non-numeric) is page 1. Wrapped in `requireAuth`, so a final 401
 * redirects to `/login?next=…`.
 */
export const loader = requireAuth(
  ({ request }: Pick<LoaderFunctionArgs, 'request'>): Promise<BrewLogListLoaderData> => {
    const { page } = parsePageOnlyParams(new URL(request.url).searchParams);
    return withDataLog(log, 'BrewLogListPage loadBrewLogs', { page }, async () => ({
      logsResponse: await brewLogApi.list({ page }, { signal: request.signal }),
    }));
  },
);
