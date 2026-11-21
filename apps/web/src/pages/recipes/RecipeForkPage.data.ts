import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { recipeApi } from '../../api/index.ts';
import { formString } from '../../routes/action-result.ts';
import { requireAuth } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';
import {
  getRecipeOr404,
  type RecipeFormFailure,
  toRecipeFormFailure,
} from './recipe-common.data.ts';

const log = createLogger('RecipeForkPage');

/**
 * `/recipes/:id/fork` loader: the source recipe (by id) whose title pre-fills the fork form.
 * A missing recipe (API 404) renders the not-found page; any other failure logs
 * `RecipeForkPage loadSourceRecipe failed` and renders the route error state. A final 401
 * redirects to `/login?next=…` through `requireAuth`.
 */
export const loader = requireAuth(({ params, request }: LoaderFunctionArgs) => {
  const recipeId = params.id ?? '';
  return withDataLog(log, 'RecipeForkPage loadSourceRecipe', { recipeId }, async () => ({
    recipe: await getRecipeOr404(recipeId, { signal: request.signal }),
  }));
});

/** Result of the `/recipes/:id/fork` action: the new fork's id, or the failure. */
export type RecipeForkActionResult = { ok: true; id: string } | RecipeFormFailure;

/**
 * `/recipes/:id/fork` action: forks the recipe with the submitted `title` (a blank title lets
 * the API choose its default) and returns `{ ok: true, id }` (the page then opens the fork's
 * editor) or `{ ok: false, error }`. A final 401 redirects through `requireAuth`. Logs carry
 * ids only, never the title.
 */
export const action = requireAuth(
  async ({ params, request }: ActionFunctionArgs): Promise<RecipeForkActionResult> => {
    const recipeId = params.id ?? '';
    const title = formString(await request.formData(), 'title').trim();
    try {
      const fork = await withDataLog(log, 'RecipeForkPage forkRecipe', { recipeId }, () =>
        recipeApi.fork(recipeId, title || undefined, { signal: request.signal }),
      );
      return { ok: true, id: fork.id };
    } catch (err) {
      return toRecipeFormFailure(err);
    }
  },
);
