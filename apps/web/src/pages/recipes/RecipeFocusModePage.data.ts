import type { TasteNoteOutput } from '@brewform/shared/schemas';
import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { isAbortError } from '../../api/errors.ts';
import type { RequestOptions } from '../../api/index.ts';
import { getTasteNotesCached } from '../../api/static-cache.ts';
import { withDataLog } from '../../routes/data-logging.ts';
import { getRecipeOr404 } from './recipe-common.data.ts';

const log = createLogger('RecipeFocusModePage');

/**
 * The flat taste-note lookup (through the single-flight static cache) used to colour the
 * tasting notes. It only decorates the page, so a failure logs
 * `RecipeFocusModePage loadTasteNotes failed` and yields `[]`; an abort is rethrown.
 */
async function loadTasteNotes(opts: RequestOptions): Promise<TasteNoteOutput[]> {
  try {
    return await getTasteNotesCached(opts);
  } catch (err) {
    if (isAbortError(err)) throw err;
    log.error({ err }, 'RecipeFocusModePage loadTasteNotes failed');
    return [];
  }
}

/**
 * `/recipes/:slug/focus` loader: the recipe and the taste-note lookup, in parallel with
 * `request.signal`. Moving from `/recipes/a/focus` to `/recipes/b/focus` aborts A's request
 * and renders B only once B's loader resolves, so A is never shown under B's URL. A missing
 * recipe renders the not-found page; any other recipe failure logs
 * `RecipeFocusModePage loadRecipe failed` and renders the route error state. Public.
 */
export const loader = ({ params, request }: LoaderFunctionArgs) => {
  const slug = params.slug ?? '';
  const opts = { signal: request.signal };
  return withDataLog(log, 'RecipeFocusModePage loadRecipe', { slug }, async () => {
    const [recipe, allTasteNotes] = await Promise.all([
      getRecipeOr404(slug, opts),
      loadTasteNotes(opts),
    ]);
    return { recipe, allTasteNotes };
  });
};
