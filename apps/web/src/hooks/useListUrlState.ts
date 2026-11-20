import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { withParams } from '../utils/list-params.ts';

const log = createLogger('useListUrlState');

/** A value accepted by {@link ListUrlState.setFilter}; empty values remove the param. */
export type UrlParamValue = string | string[] | number | boolean | null | undefined;

/** Options for {@link useListUrlState}. */
export interface ListUrlStateOptions {
  /** Default value per param; a param set to its default is omitted from the URL. */
  defaults?: Record<string, string>;
  /** The page param name (default `page`), for lists that page under another key. */
  pageKey?: string;
}

/** What {@link useListUrlState} returns. */
export interface ListUrlState<T> {
  /** The page's parsed state: the shared parser applied to the current URL. */
  state: T;
  /** The raw search params (for controls the parser does not cover). */
  searchParams: URLSearchParams;
  /**
   * Sets one or more filter/sort/tab params (pushing a history entry), removes the page param
   * (back to page 1) and omits empty and default values.
   */
  setFilter: (key: string, value: UrlParamValue) => void;
  /** Like {@link setFilter} for several params at once (one history entry). */
  setFilters: (updates: Record<string, UrlParamValue>) => void;
  /** Goes to page `n`, keeping every other param; page 1 removes the page param. */
  setPage: (n: number) => void;
  /** Removes every search param (one history entry). */
  clearAll: () => void;
}

/**
 * The single URL-state hook for list pages: the URL is the source of truth for every
 * navigation selection. `parse` is the page's shared parser (the same function its loader
 * uses), so controls and loader agree. Discrete controls push history; filter changes reset
 * the page; page changes keep filters; defaults are never written. Filter changes keep the
 * scroll position (`preventScrollReset`); page changes scroll like a normal navigation.
 */
export function useListUrlState<T>(
  parse: (sp: URLSearchParams) => T,
  options: ListUrlStateOptions = {},
): ListUrlState<T> {
  const [searchParams, setSearchParams] = useSearchParams();
  const { defaults, pageKey = 'page' } = options;
  const state = useMemo(() => parse(searchParams), [parse, searchParams]);

  const setFilters = useCallback(
    (updates: Record<string, UrlParamValue>) => {
      log.debug({ keys: Object.keys(updates) }, 'useListUrlState setFilters');
      setSearchParams(
        (prev) => {
          const next = withParams(prev, updates, defaults);
          next.delete(pageKey);
          return next;
        },
        { preventScrollReset: true },
      );
    },
    [setSearchParams, defaults, pageKey],
  );

  const setFilter = useCallback(
    (key: string, value: UrlParamValue) => setFilters({ [key]: value }),
    [setFilters],
  );

  const setPage = useCallback(
    (n: number) => {
      log.debug({ page: n }, 'useListUrlState setPage');
      setSearchParams((prev) => withParams(prev, { [pageKey]: n > 1 ? n : null }));
    },
    [setSearchParams, pageKey],
  );

  const clearAll = useCallback(() => {
    log.debug({}, 'useListUrlState clearAll');
    setSearchParams(new URLSearchParams(), { preventScrollReset: true });
  }, [setSearchParams]);

  return { state, searchParams, setFilter, setFilters, setPage, clearAll };
}

/** Options for {@link useDebouncedUrlText}. */
export interface DebouncedUrlTextOptions {
  /** Pause before committing, in ms (default 300). */
  delay?: number;
  /** Legacy keys read when `key` is absent and removed on commit (e.g. `search` for `q`). */
  legacyKeys?: string[];
  /** The page param removed on commit (default `page`). */
  pageKey?: string;
}

/** What {@link useDebouncedUrlText} returns: the input's value and its change handler. */
export interface DebouncedUrlText {
  value: string;
  setValue: (value: string) => void;
}

/**
 * Binds a free-text input to the URL param `key`. Typing updates the input immediately and
 * commits the trimmed text to the URL only after `delay` ms without typing, replacing the
 * current history entry (`replace: true`, `preventScrollReset: true`) and resetting the page,
 * so typing never floods history or the loader. The input re-syncs when the URL changes
 * externally (Back/Forward, clear-all, a removed filter badge, a shared link), and a pending
 * commit is dropped in that case.
 */
export function useDebouncedUrlText(
  key: string,
  options: DebouncedUrlTextOptions = {},
): DebouncedUrlText {
  const { delay = 300, legacyKeys, pageKey = 'page' } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const urlValue = useMemo(() => {
    for (const k of [key, ...(legacyKeys ?? [])]) {
      const v = searchParams.get(k);
      if (v) return v;
    }
    return '';
  }, [searchParams, key, legacyKeys]);

  const [value, setLocalValue] = useState(urlValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The last value this hook committed (or adopted from the URL). */
  const committedRef = useRef(urlValue);

  // Re-sync from the URL when it changes for any reason other than our own commit.
  useEffect(() => {
    if (urlValue === committedRef.current) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    committedRef.current = urlValue;
    setLocalValue(urlValue);
  }, [urlValue]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const setValue = useCallback(
    (next: string) => {
      setLocalValue(next);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const trimmed = next.trim();
        if (trimmed === committedRef.current) return;
        committedRef.current = trimmed;
        log.debug({ key }, 'useDebouncedUrlText commit');
        setSearchParams(
          (prev) => {
            const params = withParams(prev, { [key]: trimmed });
            for (const legacy of legacyKeys ?? []) params.delete(legacy);
            params.delete(pageKey);
            return params;
          },
          { replace: true, preventScrollReset: true },
        );
      }, delay);
    },
    [delay, key, legacyKeys, pageKey, setSearchParams],
  );

  return { value, setValue };
}
