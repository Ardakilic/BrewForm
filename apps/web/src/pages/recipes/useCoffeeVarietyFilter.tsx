import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api, coffeeVarietyApi, type CoffeeVarietySearchResult } from '../../api/index.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useDebounce } from '../../hooks/useDebounce.ts';
import { FilterField } from '../../components/recipe-list/index.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 * Hook that owns the `/recipes` coffee-variety search UI: debounced
 * search, dropdown positioning, click-outside handling, lazy
 * variety-name resolution, and URL-param synchronisation. Returns the
 * sidebar slot JSX plus the badge value and clear callback that
 * `RecipeListPage` forwards to `RecipeListView`.
 */
export function useCoffeeVarietyFilter(): CoffeeVarietyFilterState {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [varietySearch, setVarietySearch] = useState('');
  const [varietyResults, setVarietyResults] = useState<CoffeeVarietySearchResult[]>([]);
  const [varietyDropdownOpen, setVarietyDropdownOpen] = useState(false);
  const [selectedVarietyName, setSelectedVarietyName] = useState<string | null>(null);
  const varietyRef = useRef<HTMLDivElement>(null);
  const debouncedVarietySearch = useDebounce(varietySearch, 300);
  const coffeeVarietyId = searchParams.get('coffeeVarietyId') ?? '';

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
    if (coffeeVarietyId && UUID_RE.test(coffeeVarietyId) && !selectedVarietyName) {
      api.get<CoffeeVarietySearchResult>(`/coffee-varieties/${coffeeVarietyId}`)
        .then((v) => setSelectedVarietyName(v.name))
        .catch(() => {});
    }
  }, [coffeeVarietyId, selectedVarietyName]);

  function clear(): void {
    setSelectedVarietyName(null);
    setVarietySearch('');
    setVarietyResults([]);
    const params = new URLSearchParams(searchParams);
    params.delete('coffeeVarietyId');
    params.delete('page');
    setSearchParams(params);
  }

  function select(v: CoffeeVarietySearchResult): void {
    setSelectedVarietyName(v.name);
    setVarietySearch('');
    setVarietyResults([]);
    setVarietyDropdownOpen(false);
    const params = new URLSearchParams(searchParams);
    params.set('coffeeVarietyId', v.id);
    params.delete('page');
    setSearchParams(params);
  }

  const slot = (
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
                onClick={() => select(v)}
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
            type='button'
            onClick={clear}
            className='absolute right-2 top-1/2 -translate-y-1/2 text-xs'
            style={{ color: 'var(--text-tertiary)' }}
            aria-label='Clear variety filter'
          >
            ✕
          </button>
        )}
      </div>
    </FilterField>
  );

  return { slot, selectedName: selectedVarietyName, clear };
}
