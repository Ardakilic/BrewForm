import { equipmentApi, tasteApi } from './index.ts';
import type { EquipmentOutput, TasteNoteOutput } from '@brewform/shared/schemas';

/** Cache-bust key for the module-level static data cache. */
export const CACHE_BUST_KEY = 'brewform-static-cache-bust';

/** Module-level cache slot for the authenticated user's equipment list. Nulled by {@link invalidateStaticCache}. */
let _equipment: EquipmentOutput[] | null = null;

/** Module-level cache slot for the flat taste-note tree. Nulled by {@link invalidateStaticCache}. */
let _tasteNotes: TasteNoteOutput[] | null = null;

/**
 * Lazy-fetches the equipment list via `equipmentApi.list()` on first call
 * and returns the same memoised array on every subsequent call until
 * `invalidateStaticCache()` is invoked.
 */
export async function getEquipmentCached(): Promise<EquipmentOutput[]> {
  if (!_equipment) _equipment = await equipmentApi.list();
  return _equipment;
}

/**
 * Lazy-fetches the flat taste-note tree via `tasteApi.flat()` on first call
 * and returns the same memoised array on every subsequent call until
 * `invalidateStaticCache()` is invoked.
 */
export async function getTasteNotesCached(): Promise<TasteNoteOutput[]> {
  if (!_tasteNotes) _tasteNotes = await tasteApi.flat();
  return _tasteNotes;
}

/**
 * Null both cache slots so the next get*Cached() call re-fetches,
 * and broadcast a cache-bust marker to other browser tabs via
 * localStorage. Same-tab consumers are unaffected by the
 * `storage` event (it fires only in other tabs). The setItem is
 * wrapped in try/catch to tolerate private-mode browsers.
 */
export function invalidateStaticCache(): void {
  _equipment = null;
  _tasteNotes = null;
  try {
    localStorage.setItem(CACHE_BUST_KEY, String(Date.now()));
  } catch {
    // Private mode or storage quota — cross-tab broadcast is best-effort.
  }
}
