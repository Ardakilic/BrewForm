import { useEffect, useId, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import type { CoffeeVarietySearchResult } from '../../api/types.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useDebounce } from '../../hooks/useDebounce.ts';
import {
  coffeeVarietySearchHref,
  type coffeeVarietySearchLoader,
  MIN_COFFEE_VARIETY_QUERY_LENGTH,
} from '../../routes/resources/coffee-varieties.ts';
import { createLogger } from '../../utils/logger.ts';
import { Field } from '../form/Field.tsx';

const log = createLogger('CoffeeVarietyPicker');

/** Debounce delay (ms) between the last keystroke and the variety search. */
export const COFFEE_VARIETY_SEARCH_DEBOUNCE_MS = 300;

/** The variety a recipe form has selected: its catalogue id and display name. */
export interface CoffeeVarietySelection {
  id: string;
  name: string;
}

/** Props of {@link CoffeeVarietyPicker}. */
export interface CoffeeVarietyPickerProps {
  /** The selected variety, or `null` when none is linked. */
  value: CoffeeVarietySelection | null;
  /** Called with the picked variety, or `null` when the selection is cleared. */
  onChange: (value: CoffeeVarietySelection | null) => void;
}

/**
 * Coffee-variety typeahead of the recipe create and edit forms. Typing at least
 * {@link MIN_COFFEE_VARIETY_QUERY_LENGTH} characters searches the catalogue through the
 * `resources/coffee-varieties/search` resource route with `useFetcher().load()` (debounced; a
 * newer query cancels the previous request), and lists the matches with their category.
 * Picking one calls `onChange({ id, name })`; the selected variety is shown below the input
 * with a clear button that calls `onChange(null)`. Controlled: the parent owns the selection
 * and sends its id as `coffeeVarietyId` (`null` clears it on edit). A failed search shows no
 * results (the resource route logs it).
 */
export function CoffeeVarietyPicker({ value, onChange }: CoffeeVarietyPickerProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const debouncedQuery = useDebounce(query, COFFEE_VARIETY_SEARCH_DEBOUNCE_MS).trim();
  const searchFetcher = useFetcher<typeof coffeeVarietySearchLoader>();
  const { load } = searchFetcher;
  const searchable = debouncedQuery.length >= MIN_COFFEE_VARIETY_QUERY_LENGTH;
  const data = searchFetcher.data;
  const settled = searchable && query.trim() !== '' && data?.ok === true;
  const results: CoffeeVarietySearchResult[] = settled && data?.ok ? data.results : [];
  const showNoResults =
    open &&
    settled &&
    results.length === 0 &&
    searchFetcher.state === 'idle' &&
    data?.query === debouncedQuery;

  // Triggers the fetcher load for each debounced query (a non-fetch effect: the request runs
  // in the resource-route loader, and a newer load cancels the previous one).
  useEffect(() => {
    if (!searchable) return;
    log.debug({ queryLength: debouncedQuery.length }, 'coffee variety search requested');
    setOpen(true);
    load(coffeeVarietySearchHref(debouncedQuery));
  }, [debouncedQuery, searchable, load]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /** Selects variety `v`, closes the dropdown and resets the search text. */
  function select(v: CoffeeVarietySearchResult): void {
    log.debug({ coffeeVarietyId: v.id }, 'coffee variety selected');
    setQuery('');
    setOpen(false);
    onChange({ id: v.id, name: v.name });
  }

  /** Clears the selected variety. */
  function clear(): void {
    log.debug({}, 'coffee variety cleared');
    onChange(null);
  }

  return (
    <div ref={containerRef} className="relative">
      <Field label={t('recipe.form.coffeeVariety')} htmlFor={inputId}>
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value) setOpen(false);
          }}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={t('recipe.form.coffeeVariety.placeholder')}
          className="input-field"
        />
      </Field>
      {open && (results.length > 0 || showNoResults) && (
        <div
          className={[
            'absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg py-1',
            'bg-[color:var(--bg-tertiary)]',
            'border border-[color:var(--border-primary)]',
            'shadow-lg',
          ].join(' ')}
        >
          {results.map((v) => (
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
          {showNoResults && (
            <p className="px-3 py-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {t('recipe.list.coffeeVarietyNoResults')}
            </p>
          )}
        </div>
      )}
      {value && (
        <div className="flex items-center gap-2 mt-2 text-sm">
          <span
            className="px-2 py-0.5 rounded"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
          >
            {value.name}
          </span>
          <button
            type="button"
            onClick={clear}
            className="text-xs"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label={t('recipe.form.coffeeVariety.clear')}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
