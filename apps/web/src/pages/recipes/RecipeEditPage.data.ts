import type { RecipeUpdate } from '@brewform/shared/schemas';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { beanApi, recipeApi } from '../../api/index.ts';
import { getEquipmentCached } from '../../api/static-cache.ts';
import { requireAuth } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';
import {
  getRecipeOr404,
  type RecipeFormFailure,
  toRecipeFormFailure,
} from './recipe-common.data.ts';

const log = createLogger('RecipeEditPage');

/**
 * `/recipes/:id/edit` loader: the recipe (by id), the user's beans and the equipment lookup
 * (through the static cache), loaded in parallel with `request.signal`. Each read logs its
 * own failure before rethrowing — `RecipeEditPage loadRecipe failed`, `RecipeEditPage
 * loadBeans failed`, `RecipeEditPage loadEquipment failed` (`web-page-logging`) — so the
 * route error state renders inside the app shell instead of a blank form. A missing recipe
 * (API 404) renders the not-found page without an error log; a final 401 redirects to
 * `/login?next=…` through `requireAuth`.
 */
export const loader = requireAuth(async ({ params, request }: LoaderFunctionArgs) => {
  const recipeId = params.id ?? '';
  const opts = { signal: request.signal };
  const [recipe, beans, equipment] = await Promise.all([
    withDataLog(log, 'RecipeEditPage loadRecipe', { recipeId }, () =>
      getRecipeOr404(recipeId, opts),
    ),
    withDataLog(log, 'RecipeEditPage loadBeans', {}, () => beanApi.list(opts)),
    withDataLog(log, 'RecipeEditPage loadEquipment', {}, () => getEquipmentCached(opts)),
  ]);
  return { recipe, beans, equipment };
});

/** Result of the `/recipes/:id/edit` action: the saved recipe's slug, or the failure. */
export type RecipeEditActionResult = { ok: true; slug: string } | RecipeFormFailure;

/**
 * `/recipes/:id/edit` action: PATCHes the recipe with the submitted JSON `RecipeUpdate` body
 * (amend or, with `bumpVersion`, a new version) and returns `{ ok: true, slug }` (the page
 * then navigates to the recipe) or `{ ok: false, error, details? }`. A final 401 redirects
 * through `requireAuth`. Logs carry the recipe id only.
 */
export const action = requireAuth(
  async ({ params, request }: ActionFunctionArgs): Promise<RecipeEditActionResult> => {
    const recipeId = params.id ?? '';
    const input = (await request.json()) as RecipeUpdate;
    try {
      const recipe = await withDataLog(log, 'RecipeEditPage updateRecipe', { recipeId }, () =>
        recipeApi.update(recipeId, input, { signal: request.signal }),
      );
      return { ok: true, slug: recipe.slug };
    } catch (err) {
      return toRecipeFormFailure(err);
    }
  },
);
