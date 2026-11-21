import { useEffect } from 'react';
import { createLogger } from '@/utils/logger.ts';
import { CACHE_BUST_KEY, clearStaticCache } from '../api/static-cache.ts';

const log = createLogger('useStaticCacheSync');

/**
 * Subscribes to the browser `storage` event and calls `clearStaticCache()` when another tab
 * writes the `brewform-static-cache-bust` marker. It clears this tab's cache only and never
 * writes the marker again (`invalidateStaticCache()` would re-broadcast and make two open tabs
 * ping-pong `storage` events). The `storage` event does not fire in the tab that wrote the
 * key, so the same-tab flow (a mutation action calls `invalidateStaticCache()` directly) is
 * unaffected.
 *
 * Mount exactly once at the app root (see `App.tsx`).
 */
export function useStaticCacheSync(): void {
  useEffect(() => {
    log.debug({}, 'useStaticCacheSync mounted');
    /** Clears the local cache when another tab broadcasts a cache bust. */
    function onStorage(e: StorageEvent) {
      if (e.key === CACHE_BUST_KEY) {
        log.debug(
          { key: 'brewform-static-cache-bust' },
          'useStaticCacheSync cross-tab cache bust detected',
        );
        clearStaticCache();
      }
    }
    globalThis.addEventListener('storage', onStorage);
    return () => {
      log.debug({}, 'useStaticCacheSync unmounted');
      globalThis.removeEventListener('storage', onStorage);
    };
  }, []);
}
