import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { useAuth } from '../contexts/AuthContext.tsx';

const log = createLogger('useSignOut');

/**
 * Signs out from inside the router tree: `AuthContext.logout(leave)` clears the session cookies,
 * then `leave` replaces the current page with `/` (awaiting the navigation), and only then is the
 * user cleared. So no private page, loader data or fetcher data from the old session stays on
 * screen, and render guards never bounce a signing-out user to `/login`. Every sign-out control
 * uses this hook; components never call `useAuth().logout` directly.
 */
export function useSignOut(): () => Promise<void> {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return useCallback(
    () =>
      logout(() => {
        log.debug({}, 'useSignOut leaving private page');
        return navigate('/', { replace: true });
      }),
    [logout, navigate],
  );
}
