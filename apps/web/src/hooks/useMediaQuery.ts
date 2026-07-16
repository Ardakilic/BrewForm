import { useCallback, useSyncExternalStore } from 'react';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('useMediaQuery');

/**
 * Reactively track whether a CSS media query matches the current viewport.
 *
 * Implemented with `useSyncExternalStore`: the external store is the
 * browser's media-query state, subscribed via
 * `globalThis.matchMedia(query).addEventListener('change', ...)` and read
 * via the `MediaQueryList.matches` snapshot (a stable primitive, so React
 * only re-renders on actual flips). Re-subscribes when `query` changes.
 *
 * The server snapshot is always `false` — during SSR/hydration there is no
 * viewport, so consumers must treat `false` as the hydration-safe default.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      log.trace?.({ query }, 'useMediaQuery subscribed');
      const mql = globalThis.matchMedia(query);
      mql.addEventListener('change', onStoreChange);
      return () => {
        log.trace?.({ query }, 'useMediaQuery unsubscribed');
        mql.removeEventListener('change', onStoreChange);
      };
    },
    [query],
  );

  const getSnapshot = useCallback(() => globalThis.matchMedia(query).matches, [query]);

  // No viewport exists on the server — always report "no match" during SSR.
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
