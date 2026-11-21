import { useEffect } from 'react';
import { createLogger } from '@/utils/logger.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { readAuthChange } from '../utils/auth-broadcast.ts';

const log = createLogger('useAuthTabSync');

/**
 * The data-router methods {@link useAuthTabSync} needs (a `createBrowserRouter` or
 * `createMemoryRouter` instance satisfies it); both work outside the router tree.
 */
export interface AuthSyncRouter {
  navigate(to: string, opts?: { replace?: boolean }): Promise<void>;
  revalidate(): Promise<void>;
}

/**
 * Mirrors a sign-in or sign-out made in another tab (the `brewform-auth-change` marker written by
 * `broadcastAuthChange`, read from the `storage` event, which never fires in the writing tab).
 * Sign-out: navigate to `/` with `replace`, then re-read the session (the cookies are gone, so the
 * user becomes `null`); navigating first keeps render guards from bouncing to `/login` and drops
 * the private page. Sign-in: re-read the session, then revalidate the current route so its loaders
 * run with the new cookies. Re-reading the session instead of trusting the event also handles a
 * stale event. It never writes the marker, so tabs cannot ping-pong. Mount exactly once, under the
 * app providers (`App.tsx`).
 */
export function useAuthTabSync(router: AuthSyncRouter): void {
  const { refreshUser } = useAuth();

  useEffect(() => {
    log.debug({}, 'useAuthTabSync mounted');
    /** Follows the other tab's sign-in or sign-out. */
    function onStorage(e: StorageEvent) {
      const change = readAuthChange(e);
      if (!change) return;
      log.info({ change }, 'useAuthTabSync session changed in another tab');
      if (change === 'logout') {
        void router.navigate('/', { replace: true }).then(refreshUser);
      } else {
        void refreshUser().then(() => router.revalidate());
      }
    }
    globalThis.addEventListener('storage', onStorage);
    return () => {
      log.debug({}, 'useAuthTabSync unmounted');
      globalThis.removeEventListener('storage', onStorage);
    };
  }, [router, refreshUser]);
}
