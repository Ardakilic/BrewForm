import { useEffect, useState } from 'react';
import { api } from '../../api/client.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('AdminRecipesPage');

interface Recipe {
  id: string;
  title: string;
  slug: string;
  visibility: string;
  author: { username: string };
  likeCount: number;
  commentCount: number;
  createdAt: string;
}

/** Admin page: recipe list with per-recipe visibility change and delete. */
export function AdminRecipesPage() {
  const { t } = useTranslation();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    log.debug({}, 'AdminRecipesPage mounted');
    return () => {
      log.debug({}, 'AdminRecipesPage unmounted');
    };
  }, []);

  useEffect(() => {
    // The API uses paginated() which puts the array directly in data.data.
    // The client unwraps data.data, so the resolved value is the array itself.
    api.get<Recipe[]>('/admin/recipes?perPage=50').then((data: Recipe[]) => {
      setRecipes(Array.isArray(data) ? data : []);
    }).catch((err) => {
      log.error({ err }, 'AdminRecipesPage loadData failed');
    }).finally(() => setLoading(false));
  }, []);

  async function changeVisibility(id: string, visibility: string) {
    try {
      await api.patch(`/admin/recipes/${id}/visibility`, { visibility } as Record<string, unknown>);
      setRecipes((prev) => prev.map((r) => r.id === id ? { ...r, visibility } : r));
    } catch {
    }
  }

  async function deleteRecipe(id: string) {
    if (!globalThis.confirm(t('admin.recipes.deleteConfirm'))) return;
    try {
      await api.delete(`/admin/recipes/${id}`);
      setRecipes((prev) => prev.filter((r) => r.id !== id));
    } catch {
    }
  }

  return (
    <div>
      <h1 className='text-2xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>
        {t('admin.recipes.management')}
      </h1>

      {loading
        ? <div style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</div>
        : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('common.title')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('admin.recipes.author')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('recipe.visibility')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('admin.recipes.stats')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {recipes.map((recipe) => (
                  <tr key={recipe.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                    <td className='py-2 px-3' style={{ color: 'var(--text-primary)' }}>
                      {recipe.title}
                    </td>
                    <td className='py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                      {recipe.author?.username}
                    </td>
                    <td className='py-2 px-3'>
                      <select
                        value={recipe.visibility}
                        onChange={(e) =>
                          changeVisibility(recipe.id, e.target.value)}
                        className='text-xs rounded px-2 py-1'
                        style={{
                          backgroundColor: 'var(--bg-tertiary)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-primary)',
                        }}
                      >
                        <option value='draft'>{t('visibility.draft')}</option>
                        <option value='private'>{t('visibility.private')}</option>
                        <option value='unlisted'>{t('visibility.unlisted')}</option>
                        <option value='public'>{t('visibility.public')}</option>
                      </select>
                    </td>
                    <td className='py-2 px-3 text-xs' style={{ color: 'var(--text-tertiary)' }}>
                      ❤️{recipe.likeCount} 💬{recipe.commentCount}
                    </td>
                    <td className='py-2 px-3'>
                      <button
                        type='button'
                        onClick={() =>
                          deleteRecipe(recipe.id)}
                        className='text-xs'
                        style={{ color: 'var(--error)' }}
                      >
                        {t('common.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
