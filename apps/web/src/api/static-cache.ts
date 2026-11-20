import type { EquipmentOutput, TasteNoteOutput } from '@brewform/shared/schemas';
import { type RequestOptions, waitUnlessAborted } from './client.ts';
import { equipmentApi, tasteApi } from './index.ts';

/** Cache-bust key for the module-level static data cache. */
export const CACHE_BUST_KEY = 'brewform-static-cache-bust';

/**
 * Module-level cache slot for the equipment lookup: the in-flight or settled request promise
 * (single-flight). Nulled by {@link clearStaticCache} and when the request rejects.
 */
let _equipment: Promise<EquipmentOutput[]> | null = null;

/**
 * Module-level cache slot for the flat taste-note list: the in-flight or settled request
 * promise (single-flight). Nulled by {@link clearStaticCache} and when the request rejects.
 */
let _tasteNotes: Promise<TasteNoteOutput[]> | null = null;

/**
 * Starts `load` once and memoises its promise in a slot; a rejected promise is dropped from
 * the slot (only if it is still the current one) so the next call retries.
 */
function singleFlight<T>(
  current: Promise<T> | null,
  load: () => Promise<T>,
  store: (p: Promise<T> | null) => void,
  read: () => Promise<T> | null,
): Promise<T> {
  if (current) return current;
  const pending = load();
  store(pending);
  pending.catch(() => {
    if (read() === pending) store(null);
  });
  return pending;
}

/**
 * Returns the equipment lookup list, sharing one `equipmentApi.list()` request among all
 * concurrent and later callers until the cache is cleared ({@link clearStaticCache} or
 * {@link invalidateStaticCache}). A failed request is not cached. `opts.signal` only stops
 * this caller's wait; it never cancels the shared request.
 */
export function getEquipmentCached(opts?: RequestOptions): Promise<EquipmentOutput[]> {
  const pending = singleFlight(
    _equipment,
    () => equipmentApi.list(),
    (p) => {
      _equipment = p;
    },
    () => _equipment,
  );
  return waitUnlessAborted(pending, opts?.signal);
}

/**
 * Returns the flat taste-note list, sharing one `tasteApi.flat()` request among all
 * concurrent and later callers until the cache is cleared ({@link clearStaticCache} or
 * {@link invalidateStaticCache}). A failed request is not cached. `opts.signal` only stops
 * this caller's wait; it never cancels the shared request.
 */
export function getTasteNotesCached(opts?: RequestOptions): Promise<TasteNoteOutput[]> {
  const pending = singleFlight(
    _tasteNotes,
    () => tasteApi.flat(),
    (p) => {
      _tasteNotes = p;
    },
    () => _tasteNotes,
  );
  return waitUnlessAborted(pending, opts?.signal);
}

/**
 * Clears this tab's cache slots only: nulls both slots, dropping any in-flight lookup promise,
 * so the next `get*Cached()` call starts a new request. Never touches `localStorage`, so it
 * never broadcasts: the cross-tab listener (`useStaticCacheSync`) calls this when another tab
 * busts the cache, which keeps two open tabs from ping-ponging `storage` events.
 */
export function clearStaticCache(): void {
  _equipment = null;
  _tasteNotes = null;
}

/**
 * Invalidates the cache after a mutation: {@link clearStaticCache} (so the next get*Cached()
 * call re-fetches, including when a request was in flight) plus a cache-bust marker written to
 * `localStorage` under {@link CACHE_BUST_KEY}, which other tabs receive as a `storage` event.
 * Same-tab consumers are unaffected by that event (it fires only in other tabs). The setItem
 * is wrapped in try/catch to tolerate private-mode browsers.
 */
export function invalidateStaticCache(): void {
  clearStaticCache();
  try {
    localStorage.setItem(CACHE_BUST_KEY, String(Date.now()));
  } catch {
    // Private mode or storage quota — cross-tab broadcast is best-effort.
  }
}
