import { useEffect } from 'react';
import { useFetcher, useLoaderData } from 'react-router';
import type { AdminRecipe } from '../../api/types.ts';
import { useConfirm } from '../../components/ui/Modal.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import { createLogger } from '../../utils/logger.ts';
import type { action, loader } from './AdminRecipesPage.data.ts';

const log = createLogger('AdminRecipesPage');

/**
 * Admin page: recipe list with per-recipe visibility change and delete. Recipes come from the
 * `/admin/recipes` route loader; both mutations submit `intent`s to the route action
 * (`AdminRecipesPage.data.ts`) through per-row fetchers and toast on `{ ok: false }`.
 */
export function AdminRecipesPage() {
  const { t } = useTranslation();
  const { recipes } = useLoaderData<typeof loader>();

  useEffect(() => {
    log.debug({}, 'AdminRecipesPage mounted');
    return () => {
      log.debug({}, 'AdminRecipesPage unmounted');
    };
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        {t('admin.recipes.management')}
      </h1>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
              <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                {t('common.title')}
              </th>
              <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                {t('admin.recipes.author')}
              </th>
              <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                {t('recipe.visibility')}
              </th>
              <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                {t('admin.recipes.stats')}
              </th>
              <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                {t('common.actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {recipes.map((recipe) => (
              <RecipeRow key={recipe.id} recipe={recipe} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * One moderation row with its own fetcher. The visibility select shows the submitted value
 * optimistically and a deleted row hides while its delete is in flight; a failure toasts and
 * the row falls back to the saved recipe (the loader revalidates after every submission).
 */
function RecipeRow({ recipe }: { recipe: AdminRecipe }) {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const fetcher = useFetcher<typeof action>();
  useActionFeedback(fetcher, {
    errorKey: (data) =>
      data.intent === 'delete' ? 'admin.recipes.deleteFailed' : 'admin.recipes.visibilityError',
  });

  const pendingIntent = fetcher.formData?.get('intent');
  if (pendingIntent === 'delete') return null;
  const pendingVisibility = fetcher.formData?.get('visibility');
  const visibility = typeof pendingVisibility === 'string' ? pendingVisibility : recipe.visibility;

  /** Asks for confirmation, then submits the `delete` intent. */
  async function deleteRecipe() {
    if (
      !(await confirm({
        titleKey: 'common.confirmDelete',
        bodyKey: 'admin.recipes.deleteConfirm',
        danger: true,
      }))
    )
      return;
    fetcher.submit({ intent: 'delete', id: recipe.id }, { method: 'post' });
  }

  return (
    <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
      <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>
        {recipe.title}
      </td>
      <td className="py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
        {recipe.author?.username}
      </td>
      <td className="py-2 px-3">
        <select
          value={visibility}
          onChange={(e) =>
            fetcher.submit(
              { intent: 'visibility', id: recipe.id, visibility: e.target.value },
              { method: 'post' },
            )
          }
          className="text-xs rounded px-2 py-1"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-primary)',
          }}
        >
          <option value="draft">{t('visibility.draft')}</option>
          <option value="private">{t('visibility.private')}</option>
          <option value="unlisted">{t('visibility.unlisted')}</option>
          <option value="public">{t('visibility.public')}</option>
        </select>
      </td>
      <td className="py-2 px-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        ❤️{recipe.likeCount} 💬{recipe.commentCount}
      </td>
      <td className="py-2 px-3">
        <button type="button" onClick={deleteRecipe} className="btn-danger-text text-xs">
          {t('common.delete')}
        </button>
      </td>
    </tr>
  );
}
