import { useEffect } from 'react';
import { CACHE_BUST_KEY, invalidateStaticCache } from '../api/static-cache.ts';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('useStaticCacheSync');

/**
 * Subscribes to the browser `storage` event and calls
 * `invalidateStaticCache()` when another tab writes the
 * `brewform-static-cache-bust` marker. The `storage` event does
 * not fire in the tab that wrote the key, so the same-tab flow
 * (mutation page calls `invalidateStaticCache()` directly) is
 * unaffected.
 *
 * Mount exactly once at the app root (see `App.tsx`).
 */
export function useStaticCacheSync(): void {
  useEffect(() => {
    log.debug({}, 'useStaticCacheSync mounted');
    function onStorage(e: StorageEvent) {
      if (e.key === CACHE_BUST_KEY) {
        log.debug(
          { key: 'brewform-static-cache-bust' },
          'useStaticCacheSync cross-tab cache bust detected',
        );
        invalidateStaticCache();
      }
    }
    globalThis.addEventListener('storage', onStorage);
    return () => {
      log.debug({}, 'useStaticCacheSync unmounted');
      globalThis.removeEventListener('storage', onStorage);
    };
  }, []);
}
