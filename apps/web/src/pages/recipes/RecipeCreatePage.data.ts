import type { BeanOutput, RecipeCreate } from '@brewform/shared/schemas';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { ApiError, isAbortError } from '../../api/errors.ts';
import { beanApi, type RequestOptions, recipeApi, setupApi } from '../../api/index.ts';
import { getEquipmentCached } from '../../api/static-cache.ts';
import { requireAuth } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';
import { type RecipeFormFailure, toRecipeFormFailure } from './recipe-common.data.ts';

const log = createLogger('RecipeCreatePage');

/**
 * Loads the bean named by `?beanId` to pre-fill the coffee fields. The pre-fill is optional:
 * a missing or unreadable bean logs `RecipeCreatePage loadBean failed` and yields `null` so
 * the form still opens. Aborts and 401s (session expired → login redirect) are rethrown.
 */
async function loadBean(beanId: string, opts: RequestOptions): Promise<BeanOutput | null> {
  try {
    return await beanApi.get(beanId, opts);
  } catch (err) {
    if (isAbortError(err) || (err instanceof ApiError && err.status === 401)) throw err;
    log.error({ err, beanId }, 'RecipeCreatePage loadBean failed');
    return null;
  }
}

/**
 * `/recipes/new` loader: the equipment lookup (through the static cache), the user's setups,
 * and the bean named by `?beanId` (or `null`). Equipment or setup failures render the route
 * error state; a final 401 redirects to `/login?next=…` through `requireAuth`.
 */
export const loader = requireAuth(({ request }: LoaderFunctionArgs) => {
  const beanId = new URL(request.url).searchParams.get('beanId');
  const opts = { signal: request.signal };
  return withDataLog(log, 'RecipeCreatePage loadData', { beanId }, async () => {
    const [equipment, setups, bean] = await Promise.all([
      getEquipmentCached(opts),
      setupApi.list(opts),
      beanId ? loadBean(beanId, opts) : Promise.resolve(null),
    ]);
    return { equipment, setups, bean };
  });
});

/** Result of the `/recipes/new` action: the created recipe's slug, or the failure. */
export type RecipeCreateActionResult = { ok: true; slug: string } | RecipeFormFailure;

/**
 * `/recipes/new` action: creates the recipe from the submitted JSON `RecipeCreate` body and
 * returns `{ ok: true, slug }` (the page then navigates to it) or `{ ok: false, error,
 * details? }` for validation, API or network failures. A final 401 redirects through
 * `requireAuth`. Logs carry no payload.
 */
export const action = requireAuth(
  async ({ request }: ActionFunctionArgs): Promise<RecipeCreateActionResult> => {
    const input = (await request.json()) as RecipeCreate;
    try {
      const recipe = await withDataLog(log, 'RecipeCreatePage createRecipe', {}, () =>
        recipeApi.create(input, { signal: request.signal }),
      );
      return { ok: true, slug: recipe.slug };
    } catch (err) {
      return toRecipeFormFailure(err);
    }
  },
);
