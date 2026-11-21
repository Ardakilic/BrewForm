import type { RecipeMerge } from '@brewform/shared/schemas';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { recipeApi } from '../../api/index.ts';
import { requireAuth } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';
import {
  getRecipeOr404,
  type RecipeFormFailure,
  toRecipeFormFailure,
} from './recipe-common.data.ts';

const log = createLogger('RecipeComparePage');

/**
 * `/recipes/compare/:slug1/:slug2` loader: both recipes, fetched in parallel with
 * `request.signal`. A missing recipe — an API 404 or a recipe without a current version —
 * renders the not-found page; any other failure logs `RecipeComparePage loadData failed` and
 * renders the route error state (never `compare.notFound`). Public: no auth guard.
 */
export const loader = ({ params, request }: LoaderFunctionArgs) => {
  const slug1 = params.slug1 ?? '';
  const slug2 = params.slug2 ?? '';
  const opts = { signal: request.signal };
  return withDataLog(log, 'RecipeComparePage loadData', { slug1, slug2 }, async () => {
    const [recipe1, recipe2] = await Promise.all([
      getRecipeOr404(slug1, opts),
      getRecipeOr404(slug2, opts),
    ]);
    if (!recipe1.currentVersion || !recipe2.currentVersion) {
      throw new Response('Not Found', { status: 404 });
    }
    return {
      recipe1: { ...recipe1, currentVersion: recipe1.currentVersion },
      recipe2: { ...recipe2, currentVersion: recipe2.currentVersion },
    };
  });
};

/** Result of the compare page's merge action: the merged recipe's id, or the failure. */
export type RecipeMergeActionResult = { ok: true; id: string } | RecipeFormFailure;

/**
 * `/recipes/compare/:slug1/:slug2` action: merges the two versions with the submitted JSON
 * `RecipeMerge` body (version ids, title, per-field selections) and returns
 * `{ ok: true, id }` (the page then opens the merged recipe's editor) or `{ ok: false, error }`.
 * Merging needs a session: a final 401 redirects to `/login?next=…` through `requireAuth`.
 */
export const action = requireAuth(
  async ({ request }: ActionFunctionArgs): Promise<RecipeMergeActionResult> => {
    const body = (await request.json()) as RecipeMerge;
    const ids = {
      recipeVersionId1: body.recipeVersionId1,
      recipeVersionId2: body.recipeVersionId2,
    };
    try {
      const merged = await withDataLog(log, 'RecipeComparePage mergeRecipes', ids, () =>
        recipeApi.merge(body, { signal: request.signal }),
      );
      return { ok: true, id: merged.id };
    } catch (err) {
      return toRecipeFormFailure(err);
    }
  },
);
