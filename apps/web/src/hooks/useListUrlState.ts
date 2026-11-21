import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigation, useSearchParams } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { withParams } from '../utils/list-params.ts';

const log = createLogger('useListUrlState');

/**
 * Resets of the debounced text inputs whose commit is still waiting. `useDebouncedUrlText`
 * registers one while its timer runs; `clearAll` runs them first, so a clear always beats text
 * typed less than `delay` ms before it, whether or not the URL had a value for that input.
 */
const pendingTextCommits = new Set<() => void>();

/** What {@link useLatestSearchParams} returns: the params to build on, and whether the user is leaving. */
export interface LatestSearch {
  /** A fresh copy of the params a URL write should build on. */
  params: URLSearchParams;
  /** True while a navigation to another path is loading (the user is leaving the page). */
  leaving: boolean;
}

/**
 * Returns a getter for the search params a URL write should build on: the target of a navigation
 * still loading on the current path (React Router commits a location only after its loaders), else
 * the current URL. `leaving` is true while a navigation to another path is loading. The getter
 * reads a ref refreshed on every render, so timers and quick successive clicks never build on the
 * params captured when they were created (the render-time `searchParams` of `setSearchParams`).
 */
export function useLatestSearchParams(): () => LatestSearch {
  const location = useLocation();
  const navigation = useNavigation();
  const ref = useRef({ search: location.search, leaving: false });
  const pending = navigation.state === 'loading' ? navigation.location : undefined;
  ref.current =
    pending && pending.pathname === location.pathname
      ? { search: pending.search, leaving: false }
      : { search: location.search, leaving: pending !== undefined };
  return useCallback(
    () => ({ params: new URLSearchParams(ref.current.search), leaving: ref.current.leaving }),
    [],
  );
}

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
  /** Removes every search param (one history entry) and cancels pending debounced text. */
  clearAll: () => void;
}

/**
 * The single URL-state hook for list pages: the URL is the source of truth for every
 * navigation selection. `parse` is the page's shared parser (the same function its loader
 * uses), so controls and loader agree. Discrete controls push history; filter changes reset
 * the page; page changes keep filters; defaults are never written. Filter changes keep the
 * scroll position (`preventScrollReset`); page changes scroll like a normal navigation. Every
 * write builds on the latest URL ({@link useLatestSearchParams}: the target of a same-path
 * navigation still loading, else the current URL), so a second click during a slow load keeps
 * the first one. `clearAll` first cancels every pending debounced text commit (and empties those
 * inputs), then navigates to the empty query.
 */
export function useListUrlState<T>(
  parse: (sp: URLSearchParams) => T,
  options: ListUrlStateOptions = {},
): ListUrlState<T> {
  const [searchParams, setSearchParams] = useSearchParams();
  const latest = useLatestSearchParams();
  const { defaults, pageKey = 'page' } = options;
  const state = useMemo(() => parse(searchParams), [parse, searchParams]);

  const setFilters = useCallback(
    (updates: Record<string, UrlParamValue>) => {
      log.debug({ keys: Object.keys(updates) }, 'useListUrlState setFilters');
      const next = withParams(latest().params, updates, defaults);
      next.delete(pageKey);
      setSearchParams(next, { preventScrollReset: true });
    },
    [latest, setSearchParams, defaults, pageKey],
  );

  const setFilter = useCallback(
    (key: string, value: UrlParamValue) => setFilters({ [key]: value }),
    [setFilters],
  );

  const setPage = useCallback(
    (n: number) => {
      log.debug({ page: n }, 'useListUrlState setPage');
      setSearchParams(withParams(latest().params, { [pageKey]: n > 1 ? n : null }));
    },
    [latest, setSearchParams, pageKey],
  );

  const clearAll = useCallback(() => {
    log.debug({ pending: pendingTextCommits.size }, 'useListUrlState clearAll');
    for (const reset of pendingTextCommits) reset();
    pendingTextCommits.clear();
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
 * commit is dropped in that case. The commit reads the latest URL when it fires
 * ({@link useLatestSearchParams}), so a filter chosen or another input committed during the pause
 * is kept, and it is dropped when a navigation to another path is loading (the user is leaving).
 * While its timer runs the input registers a reset in a module-private set, so
 * `useListUrlState.clearAll` cancels the commit and empties the input even when the URL had no
 * value for it; the reset is unregistered when the timer fires, when the URL re-syncs the input
 * and on unmount.
 */
export function useDebouncedUrlText(
  key: string,
  options: DebouncedUrlTextOptions = {},
): DebouncedUrlText {
  const { delay = 300, legacyKeys, pageKey = 'page' } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const latest = useLatestSearchParams();
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

  /** Cancels the pending commit and empties the input (run by `clearAll`; stable per instance). */
  const resetForClear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    committedRef.current = '';
    setLocalValue('');
  }, []);

  // Re-sync from the URL when it changes for any reason other than our own commit.
  useEffect(() => {
    if (urlValue === committedRef.current) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingTextCommits.delete(resetForClear);
    committedRef.current = urlValue;
    setLocalValue(urlValue);
  }, [urlValue, resetForClear]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      pendingTextCommits.delete(resetForClear);
    },
    [resetForClear],
  );

  const setValue = useCallback(
    (next: string) => {
      setLocalValue(next);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        pendingTextCommits.delete(resetForClear);
        const trimmed = next.trim();
        if (trimmed === committedRef.current) return;
        const { params: base, leaving } = latest();
        if (leaving) {
          log.debug({ key }, 'useDebouncedUrlText commit dropped: leaving the page');
          return;
        }
        committedRef.current = trimmed;
        log.debug({ key }, 'useDebouncedUrlText commit');
        const params = withParams(base, { [key]: trimmed });
        for (const legacy of legacyKeys ?? []) params.delete(legacy);
        params.delete(pageKey);
        setSearchParams(params, { replace: true, preventScrollReset: true });
      }, delay);
      pendingTextCommits.add(resetForClear);
    },
    [delay, key, latest, legacyKeys, pageKey, resetForClear, setSearchParams],
  );

  return { value, setValue };
}
