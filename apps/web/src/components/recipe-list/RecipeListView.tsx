import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigation } from 'react-router';
import {
  BREW_METHODS_LIST,
  DRINK_TYPES_LIST,
  VISIBILITY_STATES_LIST,
} from '@brewform/shared/constants';
import { RecipeCardSkeletonGrid } from '../../components/ui/Skeleton.tsx';
import { EmptyState } from '../../components/ui/EmptyState.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import type {
  EquipmentOutput,
  RecipeListItemOutput,
  TasteNoteOutput,
} from '@brewform/shared/schemas';
import { type TasteNoteFlat, TasteNotesFilter } from '../../components/recipe/TasteNotesFilter.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';
import { useRecipeFilters } from './useRecipeFilters.ts';
import { EQUIPMENT_FILTER_TYPES, EQUIPMENT_TYPE_LABELS } from './constants.ts';
import { ActiveFilterBadge } from './ActiveFilterBadge.tsx';
import { Field } from '../form/Field.tsx';
import { PaginationControls } from '../ui/PaginationControls.tsx';
import { RecipeCard } from './RecipeCard.tsx';

const log = createLogger('RecipeListView');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PER_PAGE = 12;

/** Loader-shaped recipes response consumed by {@link RecipeListView}. Mirrors the runtime
 * `paginated()` envelope: `{ success, data, meta: { requestId, pagination } }`. Kept as a
 * permissive interface (optional `pagination.total`) so loaders that strip the envelope
 * (e.g. `RecipeListPage` returns the full `PaginatedResponse`) remain assignable. */
export interface RecipeListResponse {
  data: RecipeListItemOutput[];
  meta: { pagination?: { total?: number } };
}
/** Props accepted by {@link RecipeListView}. */
export interface RecipeListViewProps {
  /** List source — controls per-source branches (total fallback, etc.). */
  source: 'all' | 'starred';
  /** Loader response with recipes and optional pagination metadata. */
  recipesResponse: RecipeListResponse;
  /** Full equipment list used to build per-type dropdowns. */
  equipment: EquipmentOutput[];
  /** Flat taste-note list used to populate the multi-select filter. */
  tasteNotes: TasteNoteOutput[];
  /** When `true`, renders an admin-only visibility dropdown. Defaults to `false`. */
  showAdminVisibilityFilter?: boolean;
  /** Slot rendered between the taste-notes filter and the sort selector. */
  coffeeVarietyFilterSlot?: ReactNode;
  /** Resolved coffee-variety name owned by the calling page (badge value). */
  selectedCoffeeVarietyName?: string | null;
  /** Page-owned cleanup invoked when the coffee-variety badge is dismissed. */
  onClearCoffeeVariety?: () => void;
  /** i18n key for the empty state. Defaults to `'recipe.list.noResults'`. */
  emptyMessageKey?: string;
  /** Heading text and SEO title for the page. */
  pageTitle: string;
  /** SEO description for the page. */
  seoDescription: string;
}

/**
 * Unified recipe-list view rendered by `/recipes` and `/recipes/starred`.
 * Owns filter sidebar, badges, recipe grid, and pagination. No data
 * fetching — all data flows in via props from the page loader.
 */
export function RecipeListView({
  source,
  recipesResponse,
  equipment,
  tasteNotes,
  showAdminVisibilityFilter = false,
  coffeeVarietyFilterSlot,
  selectedCoffeeVarietyName = null,
  onClearCoffeeVariety,
  emptyMessageKey = 'recipe.list.noResults',
  pageTitle,
  seoDescription,
}: RecipeListViewProps) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const location = useLocation();
  const {
    page,
    brewMethod,
    drinkType,
    visibility,
    sortBy,
    search,
    equipmentId,
    mainBrewer,
    tasteNoteIds,
    coffeeVarietyId,
    updateFilter,
    clearAllFilters,
  } = useRecipeFilters();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  useEffect(() => {
    log.debug({ source }, 'RecipeListView mounted');
    return () => {
      log.debug({ source }, 'RecipeListView unmounted');
    };
  }, [source]);
  const recipes = recipesResponse.data;
  const total = source === 'all'
    ? (recipesResponse.meta.pagination?.total ?? recipes.length)
    : (recipesResponse.meta.pagination?.total ?? 0);
  const totalPages = Math.ceil(total / PER_PAGE);
  const loading = navigation.state === 'loading' &&
    navigation.location?.pathname === location.pathname;
  const equipmentByType = useMemo(
    () =>
      EQUIPMENT_FILTER_TYPES.reduce<Record<string, EquipmentOutput[]>>(
        (acc, type) => {
          acc[type] = equipment.filter((e) => e.type === type);
          return acc;
        },
        {} as Record<string, EquipmentOutput[]>,
      ),
    [equipment],
  );
  const activeEquipmentName = equipment.find((e) => e.id === equipmentId)?.name ?? null;
  const hasActiveFilters = !!(
    brewMethod ||
    drinkType ||
    (showAdminVisibilityFilter ? visibility : '') ||
    (equipmentId && UUID_RE.test(equipmentId)) ||
    mainBrewer ||
    tasteNoteIds.length > 0 ||
    (coffeeVarietyId && UUID_RE.test(coffeeVarietyId)) ||
    search
  );
  const allTasteNotesWithDepth: TasteNoteFlat[] = useMemo(
    () =>
      tasteNotes.map((note) => {
        let depth = 0;
        let current: TasteNoteOutput | undefined = note;
        const seen = new Set<string>();
        while (current?.parentId && !seen.has(current.id)) {
          seen.add(current.id);
          depth++;
          current = tasteNotes.find((n) => n.id === current?.parentId);
        }
        return { id: note.id, name: note.name, parentId: note.parentId, depth };
      }),
    [tasteNotes],
  );
  const showCoffeeVarietyBadge = coffeeVarietyFilterSlot != null &&
    !!coffeeVarietyId && UUID_RE.test(coffeeVarietyId);
  const handleClearCoffeeVariety = onClearCoffeeVariety ??
    (() => updateFilter('coffeeVarietyId', ''));

  return (
    <div className='mx-auto max-w-6xl px-6 py-8'>
      <SEOHead title={pageTitle} description={seoDescription} />
      <h1 className='text-2xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>
        {pageTitle}
      </h1>
      <div className='flex flex-col lg:flex-row gap-6'>
        <aside className='w-full lg:w-64 flex-shrink-0'>
          <button
            type='button'
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            aria-expanded={isSidebarOpen}
            aria-controls='filter-sidebar'
            className='lg:hidden flex items-center justify-center min-h-11 min-w-11 rounded-md mb-2 border border-[color:var(--border-primary)] bg-[color:var(--bg-tertiary)] text-[color:var(--text-primary)] text-sm select-none'
          >
            {t('recipe.list.filters')}
          </button>
          <div
            id='filter-sidebar'
            className={`card space-y-3 ${isSidebarOpen ? 'block' : 'hidden'} lg:block`}
          >
            <div className='flex items-center justify-between'>
              <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>
                {t('recipe.list.filters')}
              </h3>
              {hasActiveFilters && (
                <button
                  type='button'
                  onClick={clearAllFilters}
                  className='btn-secondary text-sm'
                >
                  {t('recipe.list.clearFilters')}
                </button>
              )}
            </div>
            {(equipmentId && UUID_RE.test(equipmentId)) && (
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
            {tasteNoteIds.map((id) => {
              const note = tasteNotes.find((n) => n.id === id);
              return (
                <ActiveFilterBadge
                  key={id}
                  label={t('recipe.list.tasteNotesFilter')}
                  value={note?.name || t('recipe.list.tasteNoteFilterActive')}
                  onRemove={() =>
                    updateFilter('tasteNoteIds', tasteNoteIds.filter((tid) => tid !== id))}
                />
              );
            })}
            {showCoffeeVarietyBadge && (
              <ActiveFilterBadge
                label={t('recipe.list.coffeeVarietyFilter')}
                value={selectedCoffeeVarietyName || t('recipe.list.coffeeVarietyActive')}
                onRemove={handleClearCoffeeVariety}
              />
            )}
            <Field label={t('recipe.list.search')}>
              <input
                type='text'
                placeholder={t('recipe.list.searchPlaceholder')}
                value={search}
                onChange={(e) => updateFilter('search', e.target.value)}
                className='input-field text-sm'
              />
            </Field>
            <Field label={t('recipe.brewMethod')}>
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
            </Field>
            <Field label={t('recipe.drinkType')}>
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
            </Field>
            {showAdminVisibilityFilter && (
              <Field label={t('recipe.list.visibilityAdmin')}>
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
              </Field>
            )}
            {EQUIPMENT_FILTER_TYPES.map((type) => {
              const items = equipmentByType[type];
              if (!items || items.length === 0) return null;
              const label = EQUIPMENT_TYPE_LABELS[type] ?? type;
              const selectedItem = items.find((e) => e.id === equipmentId);
              return (
                <Field key={type} label={label}>
                  <select
                    value={selectedItem ? equipmentId : ''}
                    onChange={(e) => updateFilter('equipmentId', e.target.value)}
                    className='input-field text-sm'
                    aria-label={t('a11y.filterBy').replace('{label}', label)}
                  >
                    <option value=''>{t('recipe.list.all')}</option>
                    {items.map((eq) => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
                  </select>
                </Field>
              );
            })}
            {allTasteNotesWithDepth.length > 0 && (
              <Field label={t('recipe.list.tasteNotesFilter')}>
                <TasteNotesFilter
                  allTasteNotes={allTasteNotesWithDepth}
                  selectedIds={tasteNoteIds}
                  onChange={(ids) => updateFilter('tasteNoteIds', ids)}
                  placeholder={t('recipe.list.tasteNotesPlaceholder')}
                />
              </Field>
            )}
            {coffeeVarietyFilterSlot}
            <Field label={t('recipe.list.sortBy')}>
              <select
                value={sortBy}
                onChange={(e) => updateFilter('sortBy', e.target.value)}
                className='input-field text-sm'
              >
                <option value='createdAt'>{t('recipe.list.newest')}</option>
                <option value='likeCount'>{t('recipe.list.mostLiked')}</option>
                <option value='rating'>{t('recipe.list.topRated')}</option>
              </select>
            </Field>
          </div>
        </aside>
        <main className='flex-1'>
          {loading
            ? <RecipeCardSkeletonGrid />
            : recipes.length === 0
            ? <EmptyState message={t(emptyMessageKey)} />
            : (
              <>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  {recipes.map((r) => <RecipeCard key={r.id} recipe={r} />)}
                </div>
                {total > PER_PAGE && (
                  <PaginationControls
                    page={page}
                    totalPages={totalPages}
                    onPageChange={(p) => updateFilter('page', String(p))}
                    pageLabel={t('recipe.list.page')}
                  />
                )}
              </>
            )}
        </main>
      </div>
    </div>
  );
}
