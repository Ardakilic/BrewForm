import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { recipeApi, equipmentApi } from '../../api/index.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { BREW_METHODS, DRINK_TYPES, VISIBILITY_STATES } from '@brewform/shared/constants';

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// deno-lint-ignore no-explicit-any
const BREW_METHODS_ANY = BREW_METHODS as unknown as any[];
// deno-lint-ignore no-explicit-any
const DRINK_TYPES_ANY = DRINK_TYPES as unknown as any[];
// deno-lint-ignore no-explicit-any
const VISIBILITY_ANY = VISIBILITY_STATES as unknown as any[];

interface RecipeListItem {
  id: string;
  slug: string;
  title: string;
  visibility: string;
  likeCount: number;
  commentCount: number;
  forkCount: number;
  author?: { username: string; displayName: string | null };
  currentVersion?: { brewMethod: string; drinkType: string; rating: number | null };
  createdAt: string;
}

export function RecipeListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeEquipmentName, setActiveEquipmentName] = useState<string | null>(null);
  const { user } = useAuth();
  const { t } = useTranslation();

  const page = Number(searchParams.get('page')) || 1;
  const brewMethod = searchParams.get('brewMethod') || '';
  const drinkType = searchParams.get('drinkType') || '';
  const visibility = searchParams.get('visibility') || '';
  const sortBy = searchParams.get('sortBy') || 'createdAt';
  const search = searchParams.get('search') || '';
  const equipmentId = searchParams.get('equipmentId') || '';

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), perPage: '12', sortBy };
    if (brewMethod) params.brewMethod = brewMethod;
    if (drinkType) params.drinkType = drinkType;
    if (visibility && user?.isAdmin === true) params.visibility = visibility;
    if (search) params.search = search;
    if (equipmentId && isValidUuid(equipmentId)) params.equipmentId = equipmentId;

    recipeApi.list(params).then((data) => {
      const items = Array.isArray(data) ? (data as RecipeListItem[]) : [];
      setRecipes(items);
      setTotal(items.length);
    }).catch(() => {
    }).finally(() => setLoading(false));
  }, [page, brewMethod, drinkType, visibility, sortBy, search, user, equipmentId]);

  useEffect(() => {
    if (!equipmentId || !isValidUuid(equipmentId)) {
      setActiveEquipmentName(null);
      return;
    }
    equipmentApi.list().then((items) => {
      const found = (items as Array<{ id: string; name: string }>).find((e) => e.id === equipmentId);
      setActiveEquipmentName(found?.name ?? null);
    }).catch(() => {
      setActiveEquipmentName(null);
    });
  }, [equipmentId]);

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    setSearchParams(params);
  }

  const activeFilters = [brewMethod, drinkType, user?.isAdmin === true ? visibility : '', equipmentId && isValidUuid(equipmentId) ? equipmentId : ''].filter(
    Boolean,
  );
  const totalPages = Math.ceil(total / 12);

  return (
    <div className='mx-auto max-w-6xl px-6 py-8'>
      <SEOHead
        title={t('recipe.list.title')}
        description='Browse and discover coffee brewing recipes on BrewForm.'
      />

      <h1 className='text-3xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>
        {t('recipe.list.title')}
      </h1>

      <div className='flex flex-col lg:flex-row gap-6'>
        <aside className='w-full lg:w-64 flex-shrink-0'>
          <div className='card'>
            <h3 className='font-semibold mb-2' style={{ color: 'var(--text-primary)' }}>
              {t('recipe.list.filters')}
            </h3>

            <div className='mb-3'>
              <label
                className='block text-sm font-medium mb-1'
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('recipe.list.search')}
              </label>
              <input
                type='text'
                placeholder={t('recipe.list.searchPlaceholder')}
                value={search}
                onChange={(e) => updateFilter('search', e.target.value)}
                className='input-field text-sm'
              />
            </div>

            <div className='mb-3'>
              <label
                className='block text-sm font-medium mb-1'
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('recipe.brewMethod')}
              </label>
              <select
                value={brewMethod}
                onChange={(e) => updateFilter('brewMethod', e.target.value)}
                className='input-field text-sm'
              >
                <option value=''>{t('recipe.list.all')}</option>
                {BREW_METHODS_ANY.map((m: any) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div className='mb-3'>
              <label
                className='block text-sm font-medium mb-1'
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('recipe.drinkType')}
              </label>
              <select
                value={drinkType}
                onChange={(e) => updateFilter('drinkType', e.target.value)}
                className='input-field text-sm'
              >
                <option value=''>{t('recipe.list.all')}</option>
                {DRINK_TYPES_ANY.map((d: any) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            {user?.isAdmin === true && (
              <div className='mb-3'>
                <label
                  className='block text-sm font-medium mb-1'
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t('recipe.list.visibilityAdmin')}
                </label>
                <select
                  value={visibility}
                  onChange={(e) => updateFilter('visibility', e.target.value)}
                  className='input-field text-sm'
                >
                  <option value=''>{t('recipe.list.all')}</option>
                  {VISIBILITY_ANY.map((v: any) => (
                    <option key={v.value} value={v.value}>{v.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div className='mb-3'>
              <label
                className='block text-sm font-medium mb-1'
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('recipe.list.sortBy')}
              </label>
              <select
                value={sortBy}
                onChange={(e) => updateFilter('sortBy', e.target.value)}
                className='input-field text-sm'
              >
                <option value='createdAt'>{t('recipe.list.newest')}</option>
                <option value='likeCount'>{t('recipe.list.mostLiked')}</option>
                <option value='rating'>{t('recipe.list.topRated')}</option>
              </select>
            </div>

            {equipmentId && isValidUuid(equipmentId) && (
              <div className='mb-3'>
                <label className='block text-sm font-medium mb-1' style={{ color: 'var(--text-secondary)' }}>
                  {t('recipe.list.equipmentFilter')}
                </label>
                <div className='flex items-center gap-2'>
                  <span className='text-sm' style={{ color: 'var(--text-primary)' }}>
                    {activeEquipmentName || t('recipe.list.equipmentFilterActive')}
                  </span>
                  <button
                    type='button'
                    onClick={() => updateFilter('equipmentId', '')}
                    className='text-xs'
                    style={{ color: 'var(--text-tertiary)' }}
                    aria-label='Remove equipment filter'
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {activeFilters.length > 0 && (
              <button
                type='button'
                onClick={() => setSearchParams({})}
                className='btn-secondary text-sm w-full'
              >
                {t('recipe.list.clearFilters')}
              </button>
            )}
          </div>
        </aside>

        <main className='flex-1'>
          {loading
            ? (
              <div className='text-center py-12' style={{ color: 'var(--text-secondary)' }}>
                {t('common.loading')}
              </div>
            )
            : recipes.length === 0
            ? (
              <div className='text-center py-12' style={{ color: 'var(--text-tertiary)' }}>
                {t('recipe.list.noResults')}
              </div>
            )
            : (
              <>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  {recipes.map((r) => <RecipeCard key={r.id} recipe={r} />)}
                </div>

                {total > 12 && (
                  <div className='flex justify-center gap-2 mt-8'>
                    {page > 1 && (
                      <button
                        type='button'
                        onClick={() => updateFilter('page', String(page - 1))}
                        className='btn-secondary'
                      >
                        {t('common.previous')}
                      </button>
                    )}
                    <span
                      className='py-2 px-4 text-sm'
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {t('recipe.list.page')
                        .replace('{page}', String(page))
                        .replace('{total}', String(totalPages))}
                    </span>
                    {page < totalPages && (
                      <button
                        type='button'
                        onClick={() => updateFilter('page', String(page + 1))}
                        className='btn-secondary'
                      >
                        {t('common.next')}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
        </main>
      </div>
    </div>
  );
}

function RecipeCard({ recipe }: { recipe: RecipeListItem }) {
  return (
    <Link to={`/recipes/${recipe.slug}`} className='card hover:shadow-lg transition-shadow'>
      <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>{recipe.title}</h3>
      <p className='mt-1 text-sm' style={{ color: 'var(--text-secondary)' }}>
        by {recipe.author?.displayName || recipe.author?.username}
      </p>
      {recipe.currentVersion && (
        <div
          className='mt-1 flex flex-wrap gap-1 text-xs'
          style={{ color: 'var(--text-tertiary)' }}
        >
          <span>{recipe.currentVersion.brewMethod.replace(/_/g, ' ')}</span>
          <span>•</span>
          <span>{recipe.currentVersion.drinkType.replace(/_/g, ' ')}</span>
          {recipe.currentVersion.rating && <span>• ★ {recipe.currentVersion.rating}</span>}
        </div>
      )}
      <div
        className='mt-2 flex items-center gap-2 text-xs'
        style={{ color: 'var(--text-tertiary)' }}
      >
        <span>❤️ {recipe.likeCount}</span>
        <span>💬 {recipe.commentCount}</span>
        <span>🍴 {recipe.forkCount}</span>
      </div>
    </Link>
  );
}
