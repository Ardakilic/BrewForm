import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  api,
  coffeeVarietyApi,
  type CoffeeVarietySearchResult,
  equipmentApi,
  recipeApi,
  tasteApi,
} from '../../api/index.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { RecipeCardSkeletonGrid } from '../../components/ui/Skeleton.tsx';
import {
  BREW_METHODS_LIST,
  DRINK_TYPES_LIST,
  VISIBILITY_STATES_LIST,
} from '@brewform/shared/constants';
import { useDebounce } from '../../hooks/useDebounce.ts';
import { TasteNoteFlat, TasteNotesFilter } from '../../components/recipe/TasteNotesFilter.tsx';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('RecipeListPage');

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Equipment type → human-readable label */
export const EQUIPMENT_TYPE_LABELS: Record<string, string> = {
  espresso_machine: 'Espresso Machine',
  grinder: 'Grinder',
  pour_over_brewer: 'Pour-Over Brewer',
  immersion_brewer: 'Immersion Brewer',
  kettle: 'Kettle',
  milk_tool: 'Milk Tool',
  scale_accessory: 'Scale & Accessory',
  roaster: 'Roaster',
  portafilter: 'Portafilter',
  basket: 'Basket',
  puck_screen: 'Puck Screen',
  paper_filter: 'Paper Filter',
  tamper: 'Tamper',
  mesh_filter: 'Mesh Filter',
  cezve: 'Cezve',
  thermometer: 'Thermometer',
  other: 'Other',
};

export const EQUIPMENT_FILTER_TYPES = [
  'espresso_machine',
  'grinder',
  'pour_over_brewer',
  'immersion_brewer',
  'kettle',
  'milk_tool',
  'scale_accessory',
  'roaster',
  'portafilter',
  'basket',
  'puck_screen',
  'paper_filter',
  'tamper',
  'mesh_filter',
  'cezve',
  'thermometer',
  'other',
] as const;

interface EquipmentItem {
  id: string;
  name: string;
  type: string;
}

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

// ---------------------------------------------------------------------------
// Module-level cache for static data (survives re-renders, cleared on page reload)
// ---------------------------------------------------------------------------
let cachedEquipment: EquipmentItem[] | null = null;
let cachedTasteNotes: TasteNoteFlat[] | null = null;

/** Reset the static data cache (used in tests) */
export function _resetStaticCache() {
  cachedEquipment = null;
  cachedTasteNotes = null;
}

export function RecipeListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [allEquipment, setAllEquipment] = useState<EquipmentItem[]>(cachedEquipment ?? []);
  const [allTasteNotes, setAllTasteNotes] = useState<TasteNoteFlat[]>(cachedTasteNotes ?? []);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    log.debug({}, 'RecipeListPage mounted');
    return () => {
      log.debug({}, 'RecipeListPage unmounted');
    };
  }, []);

  const page = Number(searchParams.get('page')) || 1;
  const brewMethod = searchParams.get('brewMethod') || '';
  const drinkType = searchParams.get('drinkType') || '';
  const visibility = searchParams.get('visibility') || '';
  const sortBy = searchParams.get('sortBy') || 'createdAt';
  const search = searchParams.get('search') || '';
  const debouncedSearch = useDebounce(search, 300);
  const equipmentId = searchParams.get('equipmentId') || '';
  const mainBrewer = searchParams.get('mainBrewer') || '';
  const tasteNoteIdsParam = searchParams.get('tasteNoteIds') || '';
  const coffeeVarietyId = searchParams.get('coffeeVarietyId') || '';
  const [varietySearch, setVarietySearch] = useState('');
  const [varietyResults, setVarietyResults] = useState<CoffeeVarietySearchResult[]>([]);
  const [varietyDropdownOpen, setVarietyDropdownOpen] = useState(false);
  const [selectedVarietyName, setSelectedVarietyName] = useState<string | null>(null);
  const varietyRef = useRef<HTMLDivElement>(null);
  const debouncedVarietySearch = useDebounce(varietySearch, 300);
  const tasteNoteIds = useMemo(
    () =>
      tasteNoteIdsParam
        ? tasteNoteIdsParam.split(',').map((id) => id.trim()).filter((id) => isValidUuid(id))
        : [],
    [tasteNoteIdsParam],
  );

  // Fetch static data once (equipment + taste notes), use module-level cache
  useEffect(() => {
    if (!cachedEquipment) {
      equipmentApi.list().then((data) => {
        cachedEquipment = data as EquipmentItem[];
        setAllEquipment(cachedEquipment);
      }).catch(() => {});
    }

    if (!cachedTasteNotes) {
      tasteApi.flat().then((data) => {
        cachedTasteNotes = data as TasteNoteFlat[];
        setAllTasteNotes(cachedTasteNotes);
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (debouncedVarietySearch.length >= 2) {
      let cancelled = false;
      coffeeVarietyApi.search(debouncedVarietySearch).then((data) => {
        if (cancelled) return;
        setVarietyResults(data);
        setVarietyDropdownOpen(true);
      }).catch(() => {});
      return () => {
        cancelled = true;
      };
    } else {
      setVarietyResults([]);
      setVarietyDropdownOpen(false);
    }
  }, [debouncedVarietySearch]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (varietyRef.current && !varietyRef.current.contains(e.target as Node)) {
        setVarietyDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (coffeeVarietyId && isValidUuid(coffeeVarietyId) && !selectedVarietyName) {
      api.get<CoffeeVarietySearchResult>(`/coffee-varieties/${coffeeVarietyId}`)
        .then((v) => setSelectedVarietyName(v.name))
        .catch(() => {});
    }
  }, [coffeeVarietyId]);

  // Fetch recipes when filters change
  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), perPage: '12', sortBy };
    if (brewMethod) params.brewMethod = brewMethod;
    if (drinkType) params.drinkType = drinkType;
    if (visibility && user?.isAdmin === true) params.visibility = visibility;
    if (debouncedSearch) params.search = debouncedSearch;
    if (equipmentId && isValidUuid(equipmentId)) params.equipmentId = equipmentId;
    if (mainBrewer) params.mainBrewer = mainBrewer;
    if (tasteNoteIds.length > 0) params.tasteNoteIds = tasteNoteIds.join(',');
    if (coffeeVarietyId && isValidUuid(coffeeVarietyId)) params.coffeeVarietyId = coffeeVarietyId;

    recipeApi.list(params).then((response) => {
      const items = Array.isArray(response.data) ? response.data : [];
      setRecipes(items as RecipeListItem[]);
      const serverTotal = response.meta?.pagination?.total ?? items.length;
      setTotal(serverTotal);
    }).catch(() => {
    }).finally(() => setLoading(false));
  }, [
    page,
    brewMethod,
    drinkType,
    visibility,
    sortBy,
    debouncedSearch,
    user,
    equipmentId,
    mainBrewer,
    tasteNoteIds,
    coffeeVarietyId,
  ]);

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
  const equipmentByType = EQUIPMENT_FILTER_TYPES.reduce<Record<string, EquipmentItem[]>>(
    (acc, type) => {
      acc[type] = allEquipment.filter((e) => e.type === type);
      return acc;
    },
    {} as Record<string, EquipmentItem[]>,
  );

  // Active filter labels
  const activeEquipmentName = allEquipment.find((e) => e.id === equipmentId)?.name ?? null;

  const hasActiveFilters = !!(
    brewMethod ||
    drinkType ||
    (user?.isAdmin === true ? visibility : '') ||
    (equipmentId && isValidUuid(equipmentId)) ||
    mainBrewer ||
    tasteNoteIds.length > 0 ||
    (coffeeVarietyId && isValidUuid(coffeeVarietyId)) ||
    search
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
                    label={t('recipe.list.tasteNotesFilter')}
                    value={note?.name || t('recipe.list.tasteNoteFilterActive')}
                    onRemove={() => {
                      const next = tasteNoteIds.filter((tid) => tid !== id);
                      updateFilter('tasteNoteIds', next);
                    }}
                  />
                );
              })}
            {(coffeeVarietyId && isValidUuid(coffeeVarietyId)) && (
              <ActiveFilterBadge
                label={t('recipe.list.coffeeVarietyFilter')}
                value={selectedVarietyName || t('recipe.list.coffeeVarietyActive')}
                onRemove={() => {
                  setSelectedVarietyName(null);
                  setVarietySearch('');
                  setVarietyResults([]);
                  updateFilter('coffeeVarietyId', '');
                }}
              />
            )}

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

            {/* Admin: Visibility */}
            {user?.isAdmin === true && (
              <FilterField label={t('recipe.list.visibilityAdmin')}>
                <select
                  value={visibility}
                  onChange={(e) => updateFilter('visibility', e.target.value)}
                  className='input-field text-sm'
                >
                  <option value=''>{t('recipe.list.all')}</option>
                  {VISIBILITY_STATES_LIST.map((v) => (
                    <option key={v.value} value={v.value}>{v.label}</option>
                  ))}
                </select>
              </FilterField>
            )}

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

            {/* ── Coffee Variety search filter ── */}
            <FilterField label={t('recipe.list.coffeeVarietyFilter')}>
              <div ref={varietyRef} className='relative'>
                <input
                  type='text'
                  value={varietySearch}
                  onChange={(e) => {
                    setVarietySearch(e.target.value);
                    if (!e.target.value) {
                      setVarietyResults([]);
                      setVarietyDropdownOpen(false);
                    }
                  }}
                  onFocus={() => {
                    if (varietyResults.length > 0) setVarietyDropdownOpen(true);
                  }}
                  placeholder={t('recipe.list.coffeeVarietyPlaceholder')}
                  className='input-field text-sm'
                />
                {varietyDropdownOpen && varietyResults.length > 0 && (
                  <div
                    className={[
                      'absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg py-1',
                      'bg-[color:var(--bg-tertiary)]',
                      'border border-[color:var(--border-primary)]',
                      'shadow-lg',
                    ].join(' ')}
                  >
                    {varietyResults.map((v) => (
                      <button
                        key={v.id}
                        type='button'
                        onClick={() => {
                          setSelectedVarietyName(v.name);
                          setVarietySearch('');
                          setVarietyResults([]);
                          setVarietyDropdownOpen(false);
                          updateFilter('coffeeVarietyId', v.id);
                        }}
                        className={[
                          'flex items-center justify-between gap-2 w-full px-3 py-2',
                          'text-sm text-left cursor-default select-none',
                          'text-[color:var(--text-primary)]',
                          'hover:bg-[color:var(--bg-secondary)]',
                          'transition-colors duration-150',
                        ].join(' ')}
                      >
                        <span className='truncate'>{v.name}</span>
                        <span
                          className='text-xs px-1.5 py-0.5 rounded flex-shrink-0'
                          style={{
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-tertiary)',
                          }}
                        >
                          {v.category}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {coffeeVarietyId && (
                  <button
                    type='button'
                    onClick={() => {
                      setSelectedVarietyName(null);
                      setVarietySearch('');
                      setVarietyResults([]);
                      updateFilter('coffeeVarietyId', '');
                    }}
                    className='absolute right-2 top-1/2 -translate-y-1/2 text-xs'
                    style={{ color: 'var(--text-tertiary)' }}
                    aria-label='Clear variety filter'
                  >
                    ✕
                  </button>
                )}
              </div>
            </FilterField>

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
            ? <RecipeCardSkeletonGrid />
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

function RecipeCard({ recipe }: { recipe: RecipeListItem }) {
  return (
    <Link to={`/recipes/${recipe.slug}`} className='card hover:shadow-lg transition-shadow'>
      <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>{recipe.title}</h3>
      <p className='mt-1 text-sm' style={{ color: 'var(--text-secondary)' }}>
        by {recipe.author
          ? (
            <Link
              to={`/u/${recipe.author.username}`}
              onClick={(e) => e.stopPropagation()}
              className='hover:underline'
              style={{ color: 'var(--accent-primary)' }}
            >
              {recipe.author.displayName || recipe.author.username}
            </Link>
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
