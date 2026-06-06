import { useEffect, useMemo, useState } from 'react';
import {
  Link,
  redirect,
  useLoaderData,
  useLocation,
  useNavigate,
  useNavigation,
  useSearchParams,
} from 'react-router';
import { ApiError, recipeApi } from '../../api/index.ts';
import { getEquipmentCached, getTasteNotesCached } from '../../api/static-cache.ts';
import { extractListParams } from '../../utils/recipe-filters.ts';
import type { EquipmentListItem, RecipeListItem, TasteNoteFlatItem } from '../../api/types.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { BREW_METHODS_LIST, DRINK_TYPES_LIST } from '@brewform/shared/constants';
import { TasteNoteFlat, TasteNotesFilter } from '../../components/recipe/TasteNotesFilter.tsx';
import { AUTHOR_BUTTON_STYLE } from '../../components/recipe/RecipeCard.styles.ts';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('StarredRecipesPage');

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Equipment type → human-readable label */
export const EQUIPMENT_TYPE_LABELS: Record<string, string> = {
  portafilter: 'Portafilter',
  basket: 'Basket',
  puck_screen: 'Puck Screen',
  paper_filter: 'Paper Filter',
  mesh_filter: 'Mesh Filter',
  tamper: 'Tamper',
  gooseneck_kettle: 'Kettle',
  scale: 'Scale',
  thermometer: 'Thermometer',
  cezve: 'Cezve',
  other: 'Other',
};

/** Ordered list of equipment types to show as separate dropdowns */
export const EQUIPMENT_FILTER_TYPES = [
  'portafilter',
  'basket',
  'tamper',
  'puck_screen',
  'scale',
  'gooseneck_kettle',
  'paper_filter',
  'mesh_filter',
  'cezve',
  'thermometer',
  'other',
] as const;

export interface StarredRecipesLoaderData {
  recipesResponse: { data: RecipeListItem[]; meta: { pagination?: { total?: number } } };
  equipment: EquipmentListItem[];
  tasteNotes: TasteNoteFlatItem[];
}

export const loader = async (
  { request }: { request: Request },
): Promise<StarredRecipesLoaderData> => {
  const url = new URL(request.url);
  const params = extractListParams(url.searchParams);
  try {
    const [recipesResponse, equipment, tasteNotes] = await Promise.all([
      recipeApi.starred(params),
      getEquipmentCached(),
      getTasteNotesCached(),
    ]);
    return { recipesResponse, equipment, tasteNotes };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      throw redirect('/login');
    }
    throw err;
  }
};

export function StarredRecipesPage() {
  const { recipesResponse, equipment, tasteNotes } = useLoaderData<StarredRecipesLoaderData>();
  const navigation = useNavigation();
  const location = useLocation();
  const loading = navigation.state === 'loading' &&
    navigation.location?.pathname === location.pathname;
  const [searchParams, setSearchParams] = useSearchParams();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    log.debug({}, 'StarredRecipesPage mounted');
    return () => {
      log.debug({}, 'StarredRecipesPage unmounted');
    };
  }, []);

  const recipes = recipesResponse.data;
  const total = recipesResponse.meta?.pagination?.total ?? 0;

  const page = Number(searchParams.get('page')) || 1;
  const brewMethod = searchParams.get('brewMethod') || '';
  const drinkType = searchParams.get('drinkType') || '';
  const sortBy = searchParams.get('sortBy') || 'createdAt';
  const search = searchParams.get('search') || '';
  const equipmentId = searchParams.get('equipmentId') || '';
  const mainBrewer = searchParams.get('mainBrewer') || '';
  const tasteNoteIdsParam = searchParams.get('tasteNoteIds') || '';
  const tasteNoteIds = useMemo(
    () =>
      tasteNoteIdsParam
        ? tasteNoteIdsParam.split(',').map((id) => id.trim()).filter((id) => isValidUuid(id))
        : [],
    [tasteNoteIdsParam],
  );

  // Map TasteNoteFlatItem -> TasteNoteFlat (TasteNotesFilter expects `depth`).
  const allTasteNotes: TasteNoteFlat[] = tasteNotes.map((note) => {
    let depth = 0;
    let current: TasteNoteFlatItem | undefined = note;
    const seen = new Set<string>();
    while (current?.parentId && !seen.has(current.id)) {
      seen.add(current.id);
      depth++;
      current = tasteNotes.find((n) => n.id === current?.parentId);
    }
    return {
      id: note.id,
      name: note.name,
      parentId: note.parentId,
      depth,
    };
  });

  function updateFilter(key: string, value: string | string[]) {
    const params = new URLSearchParams(searchParams);
    if (Array.isArray(value)) {
      if (value.length > 0) {
        params.set(key, value.join(','));
      } else {
        params.delete(key);
      }
    } else if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    setSearchParams(params);
  }

  // Group equipment by type for the dropdowns
  const equipmentByType = EQUIPMENT_FILTER_TYPES.reduce<Record<string, EquipmentListItem[]>>(
    (acc, type) => {
      acc[type] = equipment.filter((e) => e.type === type);
      return acc;
    },
    {} as Record<string, EquipmentListItem[]>,
  );

  // Active filter labels
  const activeEquipmentName = equipment.find((e) => e.id === equipmentId)?.name ?? null;

  const hasActiveFilters = !!(
    brewMethod ||
    drinkType ||
    (equipmentId && isValidUuid(equipmentId)) ||
    mainBrewer ||
    tasteNoteIds.length > 0 ||
    search
  );

  const totalPages = Math.ceil(total / 12);

  return (
    <div className='mx-auto max-w-6xl px-6 py-8'>
      <SEOHead
        title={t('recipe.starred.title')}
        description='Your starred coffee brewing recipes on BrewForm.'
      />

      <h1 className='text-3xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>
        {t('recipe.starred.title')}
      </h1>

      <div className='flex flex-col lg:flex-row gap-6'>
        {/* ── Sidebar filters ── */}
        <aside className='w-full lg:w-64 flex-shrink-0'>
          <button
            type='button'
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            aria-expanded={isSidebarOpen}
            aria-controls='filter-sidebar'
            className={[
              'lg:hidden flex items-center justify-center min-h-11 min-w-11 rounded-md mb-2',
              'border border-[color:var(--border-primary)]',
              'bg-[color:var(--bg-tertiary)] text-[color:var(--text-primary)]',
              'text-sm select-none',
            ].join(' ')}
          >
            {t('recipe.list.filters')}
          </button>
          <div
            id='filter-sidebar'
            className={[
              'card space-y-3',
              isSidebarOpen ? 'block' : 'hidden',
              'lg:block',
            ].join(' ')}
          >
            <div className='flex items-center justify-between'>
              <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>
                {t('recipe.list.filters')}
              </h3>
              {hasActiveFilters && (
                <button
                  type='button'
                  onClick={() => setSearchParams({})}
                  className='btn-secondary text-sm'
                >
                  {t('recipe.list.clearFilters')}
                </button>
              )}
            </div>

            {/* Active filter badges */}
            {(equipmentId && isValidUuid(equipmentId)) && (
              <ActiveFilterBadge
                label={t('recipe.list.equipmentFilter')}
                value={activeEquipmentName || t('recipe.list.equipmentFilterActive')}
                onRemove={() => updateFilter('equipmentId', '')}
              />
            )}
            {mainBrewer && (
              <ActiveFilterBadge
                label={t('recipe.mainBrewer')}
                value={mainBrewer}
                onRemove={() => updateFilter('mainBrewer', '')}
              />
            )}
            {tasteNoteIds.length > 0 &&
              tasteNoteIds.map((id) => {
                const note = allTasteNotes.find((n) => n.id === id);
                return (
                  <ActiveFilterBadge
                    key={id}
                    label={t('recipe.list.tasteNoteFilter')}
                    value={note?.name || t('recipe.list.tasteNoteFilterActive')}
                    onRemove={() => {
                      const next = tasteNoteIds.filter((tid) => tid !== id);
                      updateFilter('tasteNoteIds', next);
                    }}
                  />
                );
              })}

            {/* Search */}
            <FilterField label={t('recipe.list.search')}>
              <input
                type='text'
                placeholder={t('recipe.list.searchPlaceholder')}
                value={search}
                onChange={(e) => updateFilter('search', e.target.value)}
                className='input-field text-sm'
              />
            </FilterField>

            {/* Brew Method */}
            <FilterField label={t('recipe.brewMethod')}>
              <select
                value={brewMethod}
                onChange={(e) => updateFilter('brewMethod', e.target.value)}
                className='input-field text-sm'
              >
                <option value=''>{t('recipe.list.all')}</option>
                {BREW_METHODS_LIST.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </FilterField>

            {/* Drink Type */}
            <FilterField label={t('recipe.drinkType')}>
              <select
                value={drinkType}
                onChange={(e) => updateFilter('drinkType', e.target.value)}
                className='input-field text-sm'
              >
                <option value=''>{t('recipe.list.all')}</option>
                {DRINK_TYPES_LIST.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </FilterField>

            {/* ── Equipment filters — one dropdown per type ── */}
            {EQUIPMENT_FILTER_TYPES.map((type) => {
              const items = equipmentByType[type];
              if (!items || items.length === 0) return null;
              const label = EQUIPMENT_TYPE_LABELS[type] ?? type;
              // Is any item of this type currently selected?
              const selectedItem = items.find((e) => e.id === equipmentId);
              return (
                <FilterField key={type} label={label}>
                  <select
                    value={selectedItem ? equipmentId : ''}
                    onChange={(e) => updateFilter('equipmentId', e.target.value)}
                    className='input-field text-sm'
                    aria-label={`Filter by ${label}`}
                  >
                    <option value=''>{t('recipe.list.all')}</option>
                    {items.map((eq) => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
                  </select>
                </FilterField>
              );
            })}

            {/* ── Taste Notes multi-select filter ── */}
            {allTasteNotes.length > 0 && (
              <FilterField label={t('recipe.list.tasteNotesFilter')}>
                <TasteNotesFilter
                  allTasteNotes={allTasteNotes}
                  selectedIds={tasteNoteIds}
                  onChange={(ids) => updateFilter('tasteNoteIds', ids)}
                  placeholder={t('recipe.list.tasteNotesPlaceholder')}
                />
              </FilterField>
            )}

            {/* Sort */}
            <FilterField label={t('recipe.list.sortBy')}>
              <select
                value={sortBy}
                onChange={(e) => updateFilter('sortBy', e.target.value)}
                className='input-field text-sm'
              >
                <option value='createdAt'>{t('recipe.list.newest')}</option>
                <option value='likeCount'>{t('recipe.list.mostLiked')}</option>
                <option value='rating'>{t('recipe.list.topRated')}</option>
              </select>
            </FilterField>
          </div>
        </aside>

        {/* ── Recipe grid ── */}
        <main className='flex-1'>
          {loading
            ? (
              <div className='text-center py-12' style={{ color: 'var(--text-secondary)' }}>
                {t('common.loading')}
              </div>
            )
            : !isAuthenticated
            ? (
              <div className='text-center py-12' style={{ color: 'var(--text-tertiary)' }}>
                {t('recipe.starred.loginRequired')}
              </div>
            )
            : recipes.length === 0
            ? (
              <div className='text-center py-12' style={{ color: 'var(--text-tertiary)' }}>
                {t('recipe.starred.noResults')}
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

// ── Sub-components ──────────────────────────────────────────────────────────

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className='block text-sm font-medium mb-1'
        style={{ color: 'var(--text-secondary)' }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function ActiveFilterBadge(
  { label, value, onRemove }: { label: string; value: string; onRemove: () => void },
) {
  return (
    <div>
      <span
        className='block text-xs font-medium mb-1'
        style={{ color: 'var(--text-secondary)' }}
      >
        {label}
      </span>
      <div className='flex items-center gap-2'>
        <span
          className='text-sm truncate'
          style={{ color: 'var(--text-primary)' }}
        >
          {value}
        </span>
        <button
          type='button'
          onClick={onRemove}
          className='text-xs flex-shrink-0'
          style={{ color: 'var(--text-tertiary)' }}
          aria-label={`Remove ${label} filter`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/**
 * Render a clickable recipe card with an inner author button.
 *
 * Uses `<button>` for the author link instead of `<Link>` to avoid nested
 * `<a>` elements (invalid HTML). The card itself is a `<Link>` for native
 * link behavior (Ctrl+click/new tab), while the author button uses
 * `useNavigate` with `e.stopPropagation()` to prevent card navigation.
 */
function RecipeCard({ recipe }: { recipe: RecipeListItem }) {
  const navigate = useNavigate();
  return (
    <Link to={`/recipes/${recipe.slug}`} className='card hover:shadow-lg transition-shadow'>
      <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>{recipe.title}</h3>
      <p className='mt-1 text-sm' style={{ color: 'var(--text-secondary)' }}>
        by {recipe.author
          ? (
            <button
              type='button'
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/u/${recipe.author!.username}`);
              }}
              className='hover:underline'
              style={AUTHOR_BUTTON_STYLE}
            >
              {recipe.author.displayName || recipe.author.username}
            </button>
          )
          : (
            'unknown'
          )}
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
