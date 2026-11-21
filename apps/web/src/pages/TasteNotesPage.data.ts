import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { tasteApi } from '../api/index.ts';
import { withDataLog } from '../routes/data-logging.ts';

const log = createLogger('TasteNotesPage');

/**
 * `/taste-notes` loader: the SCAA taste-note hierarchy (`tasteApi.hierarchy`) with
 * `request.signal`. The `?q=` filter is applied client-side, so the loader does not read it.
 * A failure is logged and renders the route error state, never the "no results" state.
 */
export function loader({ request }: LoaderFunctionArgs) {
  return withDataLog(log, 'TasteNotesPage loadData', {}, async () => ({
    hierarchy: await tasteApi.hierarchy({ signal: request.signal }),
  }));
}

/**
 * Re-runs the `/taste-notes` loader only when the path changes: typing in the search box
 * rewrites `?q=` (the filter is client-side), so search changes must not refetch the tree.
 */
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}: {
  currentUrl: URL;
  nextUrl: URL;
  defaultShouldRevalidate: boolean;
}): boolean {
  if (currentUrl.pathname === nextUrl.pathname && currentUrl.search !== nextUrl.search) {
    return false;
  }
  return defaultShouldRevalidate;
}
