import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { ApiError } from '../../api/errors.ts';
import { recipeApi } from '../../api/index.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('VersionDiffPage');

/**
 * `/recipes/:slug/versions/diff?v1&v2` loader: the field-by-field diff of the two version ids
 * in the query, fetched with `request.signal`. A link without both `v1` and `v2`, or an
 * unknown recipe/version (API 404), renders the not-found page; any other failure logs
 * `VersionDiffPage loadDiff failed` and renders the route error state (never
 * `common.noResults`). Public.
 */
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const slug = params.slug ?? '';
  const search = new URL(request.url).searchParams;
  const v1 = search.get('v1') ?? '';
  const v2 = search.get('v2') ?? '';
  if (!v1 || !v2) throw new Response('Not Found', { status: 404 });
  return withDataLog(log, 'VersionDiffPage loadDiff', { slug, v1, v2 }, async () => {
    try {
      const diff = await recipeApi.diffVersions(slug, v1, v2, { signal: request.signal });
      return { slug, diff };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        throw new Response('Not Found', { status: 404 });
      }
      throw err;
    }
  });
};
