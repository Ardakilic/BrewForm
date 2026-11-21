import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { adminApi } from '../../api/index.ts';
import { formString, toActionFailure } from '../../routes/action-result.ts';
import { requireAdmin } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('AdminRecipesPage');

/** Recipes listed on the moderation page (one page of the newest). */
export const ADMIN_RECIPES_PER_PAGE = 50;

/** `/admin/recipes` loader: the newest recipes for moderation (admin only). */
export const loader = requireAdmin(({ request }: LoaderFunctionArgs) =>
  withDataLog(log, 'AdminRecipesPage loadData', {}, async () => {
    const res = await adminApi.getRecipes(
      { perPage: String(ADMIN_RECIPES_PER_PAGE) },
      { signal: request.signal },
    );
    return { recipes: res.data };
  }),
);

/** Result of the `/admin/recipes` action. */
export type AdminRecipesActionResult =
  | { ok: true; intent: 'visibility' | 'delete' }
  | { ok: false; intent: string; error: string; code?: string };

/**
 * `/admin/recipes` action, keyed by `intent`: `visibility` sets a recipe's visibility
 * (`id`, `visibility`), `delete` deletes it (`id`). Returns `{ ok: true, intent }` or
 * `{ ok: false, intent, error }`; 401/403 still redirect through `requireAdmin`.
 */
export const action = requireAdmin(
  async ({ request }: ActionFunctionArgs): Promise<AdminRecipesActionResult> => {
    const form = await request.formData();
    const intent = formString(form, 'intent');
    const id = formString(form, 'id');
    const opts = { signal: request.signal };
    try {
      if (intent === 'visibility') {
        await withDataLog(log, 'AdminRecipesPage changeVisibility', { recipeId: id }, () =>
          adminApi.setRecipeVisibility(id, formString(form, 'visibility'), opts),
        );
        return { ok: true, intent };
      }
      if (intent === 'delete') {
        await withDataLog(log, 'AdminRecipesPage deleteRecipe', { recipeId: id }, () =>
          adminApi.deleteRecipe(id, opts),
        );
        return { ok: true, intent };
      }
      return { ok: false, intent, error: 'Unknown intent' };
    } catch (err) {
      return { ...toActionFailure(err, [401, 403]), intent };
    }
  },
);
