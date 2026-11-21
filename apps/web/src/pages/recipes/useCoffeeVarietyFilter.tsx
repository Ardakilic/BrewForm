import { useEffect, useRef, useState } from 'react';
import { useFetcher, useSearchParams } from 'react-router';
import type { CoffeeVarietySearchResult } from '../../api/types.ts';
import { Field } from '../../components/form/Field.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useDebounce } from '../../hooks/useDebounce.ts';
import { useLatestSearchParams } from '../../hooks/useListUrlState.ts';
import {
  coffeeVarietySearchHref,
  type coffeeVarietySearchLoader,
  MIN_COFFEE_VARIETY_QUERY_LENGTH,
} from '../../routes/resources/coffee-varieties.ts';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('useCoffeeVarietyFilter');

/** Result returned by {@link useCoffeeVarietyFilter}. */
export interface CoffeeVarietyFilterState {
  /** Filter sidebar slot JSX to forward to `RecipeListView`. */
  slot: React.ReactNode;
  /** Resolved variety name for the active-filter badge. */
  selectedName: string | null;
  /** Clear callback wired to the active-filter badge. */
  clear: () => void;
}

/**
 * Hook that owns the `/recipes` coffee-variety search UI: debounced typeahead, dropdown,
 * click-outside handling and URL-param synchronisation. The typeahead reads the
 * `resources/coffee-varieties/search` resource route with `useFetcher().load()`, so a newer
 * query cancels the previous request and a late response for an old query is discarded. The
 * selected variety's name is resolved by the `/recipes` loader (`selectedName`, from
 * `RecipeListPage.data.ts`) rather than fetched here. Selecting and clearing build on the latest
 * URL (`useLatestSearchParams`), so a filter chosen while a load runs is kept. Returns the sidebar
 * slot JSX plus the badge value and clear callback that `RecipeListPage` forwards to
 * `RecipeListView`.
 *
 * @param selectedName - The loader-resolved name of `?coffeeVarietyId`, or `null`.
 */
export function useCoffeeVarietyFilter(selectedName: string | null): CoffeeVarietyFilterState {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const latest = useLatestSearchParams();
  const [varietySearch, setVarietySearch] = useState('');
  const [varietyDropdownOpen, setVarietyDropdownOpen] = useState(false);
  const varietyRef = useRef<HTMLDivElement>(null);
  const debouncedVarietySearch = useDebounce(varietySearch, 300).trim();
  const coffeeVarietyId = searchParams.get('coffeeVarietyId') ?? '';
  const searchFetcher = useFetcher<typeof coffeeVarietySearchLoader>();
  const { load } = searchFetcher;
  const searchable = debouncedVarietySearch.length >= MIN_COFFEE_VARIETY_QUERY_LENGTH;
  const searchData = searchFetcher.data;
  const varietyResults: CoffeeVarietySearchResult[] =
    searchable && searchData?.ok && varietySearch.trim() !== '' ? searchData.results : [];

  // Triggers the fetcher load for each debounced query (a non-fetch effect: the request runs
  // in the resource-route loader, and a newer load cancels the previous one).
  useEffect(() => {
    if (!searchable) return;
    log.debug({ queryLength: debouncedVarietySearch.length }, 'coffee variety search requested');
    setVarietyDropdownOpen(true);
    load(coffeeVarietySearchHref(debouncedVarietySearch));
  }, [debouncedVarietySearch, searchable, load]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (varietyRef.current && !varietyRef.current.contains(e.target as Node)) {
        setVarietyDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /**
   * Removes `?coffeeVarietyId` (and `page`) from the latest URL and resets the search input.
   */
  function clear(): void {
    setVarietySearch('');
    setVarietyDropdownOpen(false);
    const params = latest().params;
    params.delete('coffeeVarietyId');
    params.delete('page');
    setSearchParams(params);
  }

  /**
   * Applies variety `v` as the `?coffeeVarietyId` filter on the latest URL (the loader resolves
   * its name).
   */
  function select(v: CoffeeVarietySearchResult): void {
    setVarietySearch('');
    setVarietyDropdownOpen(false);
    const params = latest().params;
    params.set('coffeeVarietyId', v.id);
    params.delete('page');
    setSearchParams(params);
  }

  const slot = (
    <Field label={t('recipe.list.coffeeVarietyFilter')}>
      <div ref={varietyRef} className="relative">
        <input
          type="text"
          value={varietySearch}
          onChange={(e) => {
            setVarietySearch(e.target.value);
            if (!e.target.value) setVarietyDropdownOpen(false);
          }}
          onFocus={() => {
            if (varietyResults.length > 0) setVarietyDropdownOpen(true);
          }}
          placeholder={t('recipe.list.coffeeVarietyPlaceholder')}
          className="input-field text-sm"
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
                type="button"
                onClick={() => select(v)}
                className={[
                  'flex items-center justify-between gap-2 w-full px-3 py-2',
                  'text-sm text-left cursor-default select-none',
                  'text-[color:var(--text-primary)]',
                  'hover:bg-[color:var(--bg-secondary)]',
                  'transition-colors duration-150',
                ].join(' ')}
              >
                <span className="truncate">{v.name}</span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}
                >
                  {v.category}
                </span>
              </button>
            ))}
          </div>
        )}
        {coffeeVarietyId && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label={t('a11y.clearVarietyFilter')}
          >
            ✕
          </button>
        )}
      </div>
    </Field>
  );

  return { slot, selectedName, clear };
}
