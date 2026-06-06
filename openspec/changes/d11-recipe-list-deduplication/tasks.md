## 1. Scaffold the new module directory

- [ ] 1.1 Create the directory `apps/web/src/components/recipe-list/`

- [ ] 1.2 Create the barrel `apps/web/src/components/recipe-list/index.ts`
  that re-exports (using `.ts` extensions and named exports, no
  default exports):

  ```ts
  export { RecipeListView, type RecipeListViewProps } from './RecipeListView.tsx';
  export { FilterField } from './FilterField.tsx';
  export { ActiveFilterBadge } from './ActiveFilterBadge.tsx';
  export { RecipeCard } from './RecipeCard.tsx';
  export { PaginationControls } from './PaginationControls.tsx';
  export { useRecipeFilters } from './useRecipeFilters.ts';
  export { EQUIPMENT_FILTER_TYPES, EQUIPMENT_TYPE_LABELS } from './constants.ts';
  export type { EquipmentFilterType } from './constants.ts';
  ```

## 2. Add constants and the URL-param hook

- [ ] 2.1 Create
  `apps/web/src/components/recipe-list/constants.ts` with the
  following content (verbatim — do NOT re-derive the array; copy
  the 17 entries in the exact order shown):

  ```ts
  // Re-export canonical labels from @brewform/shared/constants.
  // Do not duplicate the object literal — RecipeListPage's local
  // copy has 2 stale label strings; the shared package is the
  // single source of truth.
  export { EQUIPMENT_TYPE_LABELS } from '@brewform/shared/constants';

  /**
   * Ordered list of equipment types to surface as separate filter
   * dropdowns. The 17 entries below match `EquipmentType` from
   * `@brewform/shared/types`; the ordering is a UI concern (the
   * shared package intentionally does not define an order).
   */
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

  export type EquipmentFilterType = (typeof EQUIPMENT_FILTER_TYPES)[number];
  ```

  Note: do NOT import `EquipmentType` from
  `@brewform/shared/types`; the local `EquipmentFilterType` is
  derived from the `as const` array. The shared `EquipmentType` is
  not re-exported from `@brewform/shared/constants`.

- [ ] 2.2 Create
  `apps/web/src/components/recipe-list/useRecipeFilters.ts` that
  exports a single `useRecipeFilters()` hook. Implementation
  contract:

  - **Imports** (with `.ts` extensions):
    - `useSearchParams` from `'react-router'`
  - **UUID regex** (copy verbatim, do not re-import from
    `recipe-filters.ts` to keep the hook self-contained):
    `const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;`
  - **Returns** the following object:
    - `searchParams: URLSearchParams`
    - `setSearchParams: (next: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams)) => void`
    - `page: number` (`Number(searchParams.get('page')) || 1`)
    - `brewMethod: string` (`searchParams.get('brewMethod') ?? ''`)
    - `drinkType: string` (`searchParams.get('drinkType') ?? ''`)
    - `visibility: string` (`searchParams.get('visibility') ?? ''`)
    - `sortBy: string` (`searchParams.get('sortBy') ?? 'createdAt'`)
    - `search: string` (`searchParams.get('search') ?? ''`)
    - `equipmentId: string` (`searchParams.get('equipmentId') ?? ''`)
    - `mainBrewer: string` (`searchParams.get('mainBrewer') ?? ''`)
    - `tasteNoteIds: string[]` (split `tasteNoteIds` by `,`,
      trim each entry, filter through `UUID_RE`)
    - `coffeeVarietyId: string`
      (`searchParams.get('coffeeVarietyId') ?? ''`)
    - `updateFilter(key: string, value: string | string[]): void`
      — when value is an array, set key=`value.join(',')` if
      `value.length > 0`, else delete; when value is a non-empty
      string, set key=value; when value is `''`, delete. Always
      delete the `page` param.
    - `clearAllFilters(): void` — call `setSearchParams({})`.

## 3. Extract the leaf components

- [ ] 3.1 Create
  `apps/web/src/components/recipe-list/FilterField.tsx` — verbatim
  copy of the existing `FilterField` function from
  `apps/web/src/pages/recipes/RecipeListPage.tsx:559-571`. No
  prop changes. Function declaration form (not arrow).

- [ ] 3.2 Create
  `apps/web/src/components/recipe-list/ActiveFilterBadge.tsx` —
  verbatim copy of the existing `ActiveFilterBadge` function
  from `apps/web/src/pages/recipes/RecipeListPage.tsx:573-603`.
  No prop changes. Function declaration form (not arrow).

- [ ] 3.3 Create
  `apps/web/src/components/recipe-list/RecipeCard.tsx` — verbatim
  copy of the existing `RecipeCard` function from
  `apps/web/src/pages/recipes/RecipeListPage.tsx:605-650`.
  Imports needed:
  - `Link` from `'react-router'`
  - `useNavigate` from `'react-router'`
  - `import type { RecipeListItem } from '../../api/types.ts';`
  - `import { AUTHOR_BUTTON_STYLE } from '../../components/recipe/RecipeCard.styles.ts';`
  (path is `../../` because the new file is two levels deeper
  than the styles file's directory). Function declaration form
  (not arrow).

- [ ] 3.4 Create
  `apps/web/src/components/recipe-list/PaginationControls.tsx`.
  Extract the pagination JSX from
  `apps/web/src/pages/recipes/RecipeListPage.tsx:520-549`. Props
  (use `interface` for object type):

  ```ts
  interface PaginationControlsProps {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    previousLabel: string;
    nextLabel: string;
    pageLabel: string; // contains {page} and {total} placeholders
  }
  ```

  Use `.replace('{page}', String(page)).replace('{total}', String(totalPages))`
  to substitute placeholders. Wrap in
  `<div className='flex justify-center gap-2 mt-8'>` with the
  same `<button className='btn-secondary'>` styling and
  `<span className='py-2 px-4 text-sm' style={{ color: 'var(--text-secondary)' }}>`
  for the page label.

## 4. Build the unified RecipeListView

- [ ] 4.1 Create
  `apps/web/src/components/recipe-list/RecipeListView.tsx` with
  the imports. All imports use `.ts` extensions and named imports
  unless type-only:

  ```ts
  import { useEffect, useMemo, useState } from 'react';
  import { useLocation, useNavigation } from 'react-router';
  import { BREW_METHODS_LIST, DRINK_TYPES_LIST, VISIBILITY_STATES_LIST } from '@brewform/shared/constants';
  import { RecipeCardSkeletonGrid } from '../../components/ui/Skeleton.tsx';
  import { SEOHead } from '../../components/seo/SEOHead.tsx';
  import { TasteNotesFilter, type TasteNoteFlat } from '../../components/recipe/TasteNotesFilter.tsx';
  import { useTranslation } from '../../contexts/I18nContext.tsx';
  import { createLogger } from '@/utils/logger.ts';
  import type { EquipmentListItem, RecipeListItem, TasteNoteFlatItem } from '../../api/types.ts';
  import { useRecipeFilters } from './useRecipeFilters.ts';
  import { EQUIPMENT_FILTER_TYPES, EQUIPMENT_TYPE_LABELS } from './constants.ts';
  import { ActiveFilterBadge } from './ActiveFilterBadge.tsx';
  import { FilterField } from './FilterField.tsx';
  import { PaginationControls } from './PaginationControls.tsx';
  import { RecipeCard } from './RecipeCard.tsx';

  const log = createLogger('RecipeListView');
  ```

- [ ] 4.2 Declare the component props interface and component
  signature. Use `export function RecipeListView(...)` (named,
  not default). Props (use the exact names — the spec scenarios
  refer to them):

  ```ts
  export interface RecipeListViewProps {
    source: 'all' | 'starred';
    recipesResponse: {
      data: RecipeListItem[];
      meta: { pagination?: { total?: number } };
    };
    equipment: EquipmentListItem[];
    tasteNotes: TasteNoteFlatItem[];
    showAdminVisibilityFilter?: boolean;
    coffeeVarietyFilterSlot?: React.ReactNode;
    emptyMessageKey?: string;
    pageTitle: string;
    seoDescription: string;
  }
  ```

  Note: `React.ReactNode` requires `import type { ReactNode } from 'react'`
  OR `import type * as React from 'react'`. The current page files
  use the bare `React.ReactNode` form, which works because
  `@types/react` is in `devDependencies`. To stay consistent with
  the current code style, add `import type * as React from 'react';`
  (or a `ReactNode` named import) at the top.

- [ ] 4.3 Implement the data-derivation block at the top of
  `RecipeListView`. Includes:
  - `const { t } = useTranslation();`
  - `const navigation = useNavigation();`
  - `const location = useLocation();`
  - Destructure every field from `useRecipeFilters()`.
  - `const [isSidebarOpen, setIsSidebarOpen] = useState(false);`
  - `const recipes = recipesResponse.data;`
  - `const total = source === 'all'
      ? (recipesResponse.meta.pagination?.total ?? recipes.length)
      : (recipesResponse.meta.pagination?.total ?? 0);`
  - `const totalPages = Math.ceil(total / 12);` (the `12` matches
    the perPage in `extractListParams`; preserve the hardcoded
    value)
  - `const loading = navigation.state === 'loading' &&
      navigation.location?.pathname === location.pathname;`
  - `const equipmentByType = EQUIPMENT_FILTER_TYPES.reduce<Record<string, EquipmentListItem[]>>(
      (acc, type) => {
        acc[type] = equipment.filter((e) => e.type === type);
        return acc;
      },
      {} as Record<string, EquipmentListItem[]>,
    );`
  - `const activeEquipmentName =
      equipment.find((e) => e.id === equipmentId)?.name ?? null;`
  - `const hasActiveFilters = !!(
      brewMethod ||
      drinkType ||
      (showAdminVisibilityFilter ? visibility : '') ||
      (equipmentId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(equipmentId)) ||
      mainBrewer ||
      tasteNoteIds.length > 0 ||
      (coffeeVarietyId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(coffeeVarietyId)) ||
      search
    );`
    (inlined UUID regex to keep the view self-contained)
  - `const allTasteNotesWithDepth: TasteNoteFlat[] = useMemo(
      () => tasteNotes.map((note) => {
        let depth = 0;
        let current: TasteNoteFlatItem | undefined = note;
        const seen = new Set<string>();
        while (current?.parentId && !seen.has(current.id)) {
          seen.add(current.id);
          depth++;
          current = tasteNotes.find((n) => n.id === current?.parentId);
        }
        return { id: note.id, name: note.name, parentId: note.parentId, depth };
      }),
      [tasteNotes],
    );`
  - `useEffect` mount/unmount logs:
    ```ts
    useEffect(() => {
      log.debug({ source }, 'RecipeListView mounted');
      return () => {
        log.debug({ source }, 'RecipeListView unmounted');
      };
    }, [source]);
    ```

- [ ] 4.4 Render the JSX root. Use the exact same Tailwind class
  names and inline `style={...}` props as the original pages —
  this preserves the visual output exactly. Order of children
  inside the outer `<div className='mx-auto max-w-6xl px-6 py-8'>`:

  1. `<SEOHead title={pageTitle} description={seoDescription} />`
  2. `<h1 className='text-3xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>{pageTitle}</h1>`
  3. `<div className='flex flex-col lg:flex-row gap-6'>` containing
     the sidebar `<aside>` and the `<main>`.

  The sidebar structure (inside
  `<aside className='w-full lg:w-64 flex-shrink-0'>`):
  - Mobile toggle button (`<button>` with `lg:hidden` class,
    toggles `isSidebarOpen`; `aria-expanded` and
    `aria-controls='filter-sidebar'`)
  - `<div id='filter-sidebar' className={card with hidden/block toggled by isSidebarOpen, lg:block}>`:
    1. **Filters heading + Clear button** —
       `<div className='flex items-center justify-between'>` with
       `<h3>{t('recipe.list.filters')}</h3>` and the conditional
       Clear Filters `<button className='btn-secondary text-sm'>`
    2. **Active badges** (in this order, each rendered
       conditionally per the spec):
       - Equipment badge:
         `<ActiveFilterBadge label={t('recipe.list.equipmentFilter')} value={activeEquipmentName || t('recipe.list.equipmentFilterActive')} onRemove={() => updateFilter('equipmentId', '')} />`
       - Main Brewer badge: label `t('recipe.mainBrewer')`, value
         `mainBrewer`, onRemove clears `mainBrewer`
       - One taste-note badge per ID in `tasteNoteIds`. Label is
         `t('recipe.list.tasteNotesFilter')` (PLURAL — this is
         the i18n bug fix). Value is the resolved name or
         `t('recipe.list.tasteNoteFilterActive')` (SINGULAR
         fallback — note the asymmetry; preserve as-is per
         the spec). `onRemove` rebuilds the array with the
         clicked ID removed and calls
         `updateFilter('tasteNoteIds', next)`.
       - Coffee-variety badge: only when
         `coffeeVarietyFilterSlot` is provided AND
         `coffeeVarietyId` is a valid UUID. Label
         `t('recipe.list.coffeeVarietyFilter')`, value
         `selectedVarietyName || t('recipe.list.coffeeVarietyActive')`,
         onRemove clears `coffeeVarietyId` (and clears the
         variety-name state owned by the page wrapper — the
         page wrapper passes an `onRemove` callback via a
         closure in the slot).
    3. **Search field**:
       `<FilterField label={t('recipe.list.search')}>` →
       `<input placeholder={t('recipe.list.searchPlaceholder')} value={search} onChange={(e) => updateFilter('search', e.target.value)} className='input-field text-sm' />`
    4. **Brew Method**:
       `<FilterField label={t('recipe.brewMethod')}>` →
       `<select value={brewMethod} onChange={...} className='input-field text-sm'>`
       with `<option value=''>{t('recipe.list.all')}</option>`
       followed by `BREW_METHODS_LIST.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)`.
    5. **Drink Type**: same pattern as Brew Method, with
       `t('recipe.drinkType')` and `DRINK_TYPES_LIST`.
    6. **Visibility (admin only)**: render only if
       `showAdminVisibilityFilter === true`. `<FilterField label={t('recipe.list.visibilityAdmin')}>` →
       `<select value={visibility} onChange={...}>` with
       `VISIBILITY_STATES_LIST.map((v) => ...)`.
    7. **Equipment dropdowns**:
       `EQUIPMENT_FILTER_TYPES.map((type) => { ... })`. For each
       type, compute `items = equipmentByType[type]`. If
       `!items || items.length === 0`, return `null`. Otherwise
       render
       `<FilterField key={type} label={EQUIPMENT_TYPE_LABELS[type] ?? type}>`
       containing a `<select aria-label={`Filter by ${label}`}>`
       with `<option value=''>All</option>` followed by
       `items.map((eq) => <option key={eq.id} value={eq.id}>{eq.name}</option>)`.
    8. **Taste Notes filter**: render only if
       `allTasteNotesWithDepth.length > 0`. `<FilterField label={t('recipe.list.tasteNotesFilter')}>`
       → `<TasteNotesFilter allTasteNotes={allTasteNotesWithDepth} selectedIds={tasteNoteIds} onChange={(ids) => updateFilter('tasteNoteIds', ids)} placeholder={t('recipe.list.tasteNotesPlaceholder')} />`.
    9. **Coffee-variety slot** (only if
       `coffeeVarietyFilterSlot` is provided): render
       `{coffeeVarietyFilterSlot}` immediately above the Sort
       field.
    10. **Sort**:
        `<FilterField label={t('recipe.list.sortBy')}>` →
        `<select value={sortBy} onChange={...} className='input-field text-sm'>`
        with three options: `t('recipe.list.newest')` (value
        `createdAt`), `t('recipe.list.mostLiked')` (value
        `likeCount`), `t('recipe.list.topRated')` (value
        `rating`).

  The main area (`<main className='flex-1'>`) renders one of three
  branches in this order:
  1. **Loading state**: `loading ? (
       source === 'all'
         ? <RecipeCardSkeletonGrid />
         : <div className='text-center py-12' style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</div>
     )`
  2. **Empty state**: `recipes.length === 0 ? (
       <div className='text-center py-12' style={{ color: 'var(--text-tertiary)' }}>
         {t(emptyMessageKey ?? 'recipe.list.noResults')}
       </div>
     )`
  3. **Results + pagination**: render
     `<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>` with
     `recipes.map((r) => <RecipeCard key={r.id} recipe={r} />)`,
     then (if `total > 12`)
     `<PaginationControls page={page} totalPages={totalPages} onPageChange={(p) => updateFilter('page', String(p))} previousLabel={t('common.previous')} nextLabel={t('common.next')} pageLabel={t('recipe.list.page')} />`.

- [ ] 4.5 Sanity-check the view file: confirm
  `wc -l apps/web/src/components/recipe-list/RecipeListView.tsx`
  is ≤ 350 lines. The other leaf files should each be ≤ 60 lines
  except `RecipeCard.tsx` which is ~50.

## 5. Refactor RecipeListPage to a thin wrapper

- [ ] 5.1 Rewrite
  `apps/web/src/pages/recipes/RecipeListPage.tsx`. Keep the
  `loader` function verbatim (it fetches recipes + cached
  equipment + cached taste notes). The new imports:

  ```ts
  import { useEffect, useRef, useState } from 'react';
  import { useLoaderData } from 'react-router';
  import { api, coffeeVarietyApi, type CoffeeVarietySearchResult, recipeApi } from '../../api/index.ts';
  import { getEquipmentCached, getTasteNotesCached } from '../../api/static-cache.ts';
  import { extractListParams } from '../../utils/recipe-filters.ts';
  import { useAuth } from '../../contexts/AuthContext.tsx';
  import { useTranslation } from '../../contexts/I18nContext.tsx';
  import { useDebounce } from '../../hooks/useDebounce.ts';
  import { createLogger } from '@/utils/logger.ts';
  import { FilterField, RecipeListView, type RecipeListViewProps } from '../../components/recipe-list/index.ts';
  import type { EquipmentListItem, RecipeListItem, TasteNoteFlatItem } from '../../api/types.ts';
  ```

  - Keep the `RecipeListLoaderData` interface here (the existing
    `router.tsx` imports the type from this file; do not break
    the import). Do not move it into `components/recipe-list/`
    in this PR.
  - In `RecipeListPage`:
    - `const data = useLoaderData() as RecipeListLoaderData;`
    - `const { user } = useAuth();`
    - `const { t } = useTranslation();`
    - Hold the existing variety state (verbatim from current
      `RecipeListPage.tsx:117-122`):
      ```ts
      const [varietySearch, setVarietySearch] = useState('');
      const [varietyResults, setVarietyResults] = useState<CoffeeVarietySearchResult[]>([]);
      const [varietyDropdownOpen, setVarietyDropdownOpen] = useState(false);
      const [selectedVarietyName, setSelectedVarietyName] = useState<string | null>(null);
      const varietyRef = useRef<HTMLDivElement>(null);
      const debouncedVarietySearch = useDebounce(varietySearch, 300);
      ```
    - Hold the existing three `useEffect`s verbatim (current
      `RecipeListPage.tsx:131-164`): debounced search, click-
      outside, variety-name fetch.
    - Hold the existing mount/unmount log:
      ```ts
      useEffect(() => {
        log.debug({}, 'RecipeListPage mounted');
        return () => {
          log.debug({}, 'RecipeListPage unmounted');
        };
      }, []);
      ```
    - Build the `coffeeVarietyFilterSlot` element. The slot is a
      fully-formed `<FilterField>` whose body is the existing
      variety JSX from `RecipeListPage.tsx:410-487`. The
      `setSelectedVarietyName(null); setVarietySearch(''); setVarietyResults([]);`
      calls inside the clear-button and the active-badge
      onRemove must still be present (they are page-owned
      state, not view-owned).
    - Render:
      ```tsx
      return (
        <RecipeListView
          source='all'
          recipesResponse={data.recipesResponse}
          equipment={data.equipment}
          tasteNotes={data.tasteNotes}
          showAdminVisibilityFilter={user?.isAdmin === true}
          coffeeVarietyFilterSlot={coffeeVarietyFilterSlot}
          pageTitle={t('recipe.list.title')}
          seoDescription='Browse and discover coffee brewing recipes on BrewForm.'
        />
      );
      ```

- [ ] 5.2 Delete the now-orphaned code from this file:
  - The local `EQUIPMENT_TYPE_LABELS` and `EQUIPMENT_FILTER_TYPES`
    exports
  - The local `FilterField`, `ActiveFilterBadge`, `RecipeCard`
    functions
  - The import `import { Link, useNavigate, useNavigation, useSearchParams } from 'react-router';`
    (replaced by the new imports; `useSearchParams` and
    `useNavigation` are no longer used here)
  - The `import { RecipeCardSkeletonGrid } from '../../components/ui/Skeleton.tsx';`
    (no longer used here)
  - The `import { AUTHOR_BUTTON_STYLE } from '../../components/recipe/RecipeCard.styles.ts';`
    (no longer used here)
  - The `import { TasteNotesFilter } from '../../components/recipe/TasteNotesFilter.tsx';`
    and `import type { TasteNoteFlat } from '../../components/recipe/TasteNotesFilter.tsx';`
    (no longer used here)
  - The `import { useDebounce } from '../../hooks/useDebounce.ts';`
    stays in this file (the page wrapper owns the variety debounce)

- [ ] 5.3 Run `make check-web` — must pass with no new errors. If
  it fails, the most likely cause is a stale import in the page
  file (read the error message and remove the offending import).

- [ ] 5.4 Run
  `make test-specific filter=apps/web/src/pages/recipes/RecipeListPage.test.tsx`
  — this WILL FAIL at this step because the test still imports
  the deleted `EQUIPMENT_FILTER_TYPES` / `EQUIPMENT_TYPE_LABELS`
  exports. That is expected; the next task fixes it. The
  `make check-web` from 5.3 is the gating check here.

## 6. Update the RecipeListPage test imports

- [ ] 6.1 In
  `apps/web/src/pages/recipes/RecipeListPage.test.tsx`, replace
  the existing import block at line 75-79:

  ```ts
  // OLD
  import {
    EQUIPMENT_FILTER_TYPES,
    EQUIPMENT_TYPE_LABELS,
    loader,
    RecipeListPage,
  } from './RecipeListPage.tsx';
  ```

  with:

  ```ts
  import { loader, RecipeListPage } from './RecipeListPage.tsx';
  import {
    EQUIPMENT_FILTER_TYPES,
    EQUIPMENT_TYPE_LABELS,
  } from '../../components/recipe-list/constants.ts';
  ```

  Do not change any other line in the test file. The mock for
  `@brewform/shared/constants` at lines 60-64 of the test
  continues to provide `BREW_METHODS_LIST`, `DRINK_TYPES_LIST`,
  and `VISIBILITY_STATES_LIST`; these come through the new view
  without test changes.

- [ ] 6.2 Run
  `make test-specific filter=apps/web/src/pages/recipes/RecipeListPage.test.tsx`
  — all 23 tests must pass. If a test fails, the most common
  causes are: (a) the view is missing a Tailwind class from the
  original, (b) the i18n key path differs (e.g., the view uses
  `tasteNotesFilter` plural where the test still expects the
  singular), (c) the slot is not being rendered for
  RecipeListPage.

## 7. Refactor StarredRecipesPage to a thin wrapper

- [ ] 7.1 Rewrite
  `apps/web/src/pages/recipes/StarredRecipesPage.tsx`. Keep the
  `loader` function verbatim, including the 401 →
  `redirect('/login')` branch. The new imports:

  ```ts
  import { useEffect } from 'react';
  import { redirect, useLoaderData } from 'react-router';
  import { ApiError, recipeApi } from '../../api/index.ts';
  import { getEquipmentCached, getTasteNotesCached } from '../../api/static-cache.ts';
  import { extractListParams } from '../../utils/recipe-filters.ts';
  import { useAuth } from '../../contexts/AuthContext.tsx';
  import { useTranslation } from '../../contexts/I18nContext.tsx';
  import { createLogger } from '@/utils/logger.ts';
  import { RecipeListView } from '../../components/recipe-list/index.ts';
  import type { EquipmentListItem, RecipeListItem, TasteNoteFlatItem } from '../../api/types.ts';
  ```

  - Keep the `StarredRecipesLoaderData` interface here (the
    `router.tsx` does not import the type, but consistency with
    `RecipeListPage` is preferred).
  - In `StarredRecipesPage`:
    - `const data = useLoaderData<StarredRecipesLoaderData>();`
    - `const { isAuthenticated } = useAuth();`
    - `const { t } = useTranslation();`
    - Hold the existing mount/unmount log verbatim:
      ```ts
      useEffect(() => {
        log.debug({}, 'StarredRecipesPage mounted');
        return () => {
          log.debug({}, 'StarredRecipesPage unmounted');
        };
      }, []);
      ```
    - If `!isAuthenticated`, render EXACTLY the same wrapper as
      the current page's empty state for the auth case
      (`StarredRecipesPage.tsx:180-185` plus the loginRequired
      `<div>` at line 358-362, hoisted to the page wrapper):
      ```tsx
      if (!isAuthenticated) {
        return (
          <div className='mx-auto max-w-6xl px-6 py-8'>
            <div className='text-center py-12' style={{ color: 'var(--text-tertiary)' }}>
              {t('recipe.starred.loginRequired')}
            </div>
          </div>
        );
      }
      ```
    - Otherwise render:
      ```tsx
      return (
        <RecipeListView
          source='starred'
          recipesResponse={data.recipesResponse}
          equipment={data.equipment}
          tasteNotes={data.tasteNotes}
          emptyMessageKey='recipe.starred.noResults'
          pageTitle={t('recipe.starred.title')}
          seoDescription='Your starred coffee brewing recipes on BrewForm.'
        />
      );
      ```

- [ ] 7.2 Delete the now-orphaned code from this file:
  - The local `EQUIPMENT_TYPE_LABELS` and `EQUIPMENT_FILTER_TYPES`
    exports
  - The local `FilterField`, `ActiveFilterBadge`, `RecipeCard`
    functions
  - The `import { Link, useLocation, useNavigate, useNavigation, useSearchParams } from 'react-router';`
    (replaced; `useLocation` and `useNavigation` move to the
    view, `useSearchParams` is no longer used here, `useNavigate`
    moves to the view's RecipeCard, `Link` moves to the view)
  - The `import { RecipeCardSkeletonGrid } from '../../components/ui/Skeleton.tsx';`
    (no longer used here — the view imports it directly)
  - The `import { AUTHOR_BUTTON_STYLE } from '../../components/recipe/RecipeCard.styles.ts';`
    (no longer used here)
  - The `import { TasteNotesFilter, TasteNoteFlat } from '../../components/recipe/TasteNotesFilter.tsx';`
    (no longer used here)
  - The `import { useMemo, useState } from 'react';` becomes
    `import { useEffect } from 'react';`

- [ ] 7.3 Run `make check-web` — must pass with no new errors.

- [ ] 7.4 Run
  `make test-specific filter=apps/web/src/pages/recipes/StarredRecipesPage.test.tsx`
  — all 9 tests must pass.

## 8. Final verification

- [ ] 8.1 Run `make check-web` — zero type/lint errors
- [ ] 8.2 Run `make lint` — zero warnings
- [ ] 8.3 Run
  `make test-specific filter=apps/web/src/pages/recipes/RecipeListPage.test.tsx`
  — all 23 tests pass
- [ ] 8.4 Run
  `make test-specific filter=apps/web/src/pages/recipes/StarredRecipesPage.test.tsx`
  — all 9 tests pass
- [ ] 8.5 Run `make test` (full web suite) — all tests pass
- [ ] 8.6 Verify `wc -l` on the two page files:
  - `apps/web/src/pages/recipes/RecipeListPage.tsx` ≤ 120
  - `apps/web/src/pages/recipes/StarredRecipesPage.tsx` ≤ 80
- [ ] 8.7 Verify the new module's `wc -l`:
  - `apps/web/src/components/recipe-list/RecipeListView.tsx` ≤ 350
  - All other files in `components/recipe-list/` ≤ 80 each
- [ ] 8.8 Manual browser check: equipment dropdowns are identical
  between `/recipes` and `/recipes/starred`
- [ ] 8.9 Manual browser check: the two renamed labels
  (`'Pour-Over & Filter Brewer'`, `'Immersion & Pressure Brewer'`)
  appear on both pages
- [ ] 8.10 Manual browser check: taste-note active badge uses the
  plural label on both pages
- [ ] 8.11 Manual browser check: admin visibility filter is hidden
  on `/recipes/starred` for any user
- [ ] 8.12 Manual browser check: coffee-variety filter is hidden on
  `/recipes/starred`
- [ ] 8.13 Manual browser check: unauthenticated user on
  `/recipes/starred` sees the login-required message and not the
  view
- [ ] 8.14 Update `pr_desription.md` at the repo root with the
  actual line counts (replace the ≤ 120 / ≤ 80 / ≤ 350 placeholders
  with the measured values) and any deviations from this plan.

## 9. Commit and open PR

- [ ] 9.1 Run `git status` to confirm only the expected files are
  modified (no accidental edits from prior sessions)
- [ ] 9.2 Stage explicitly with `git add apps/web/src/components/recipe-list/ apps/web/src/pages/recipes/ pr_desription.md plans/D11-recipe-list-deduplication.md`
  (skip `git add .` to avoid scope creep)
- [ ] 9.3 Commit with a message that matches the repo's
  `feat/dNN-…` branch style, e.g.:

  ```
  feat: d11 — recipe list deduplication

  Extract ~90% duplicated code from RecipeListPage and
  StarredRecipesPage into a shared apps/web/src/components/recipe-list/
  module. Resolves the equipment-label drift, the singular-vs-plural
  taste-note i18n bug, and the hardcoded path check.

  See openspec/changes/d11-recipe-list-deduplication/ for the full
  proposal, design, spec, and tasks.
  ```

- [ ] 9.4 Push the branch and open the PR using the contents of
  `pr_desription.md` as the body
