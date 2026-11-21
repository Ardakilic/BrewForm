import type { AuthUser } from '@brewform/shared/types';
import {
  createContext,
  type ReactNode,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { createLogger } from '@/utils/logger.ts';
import { ApiError, isAbortError } from '../api/errors.ts';
import { authApi, userApi } from '../api/index.ts';
import { broadcastAuthChange } from '../utils/auth-broadcast.ts';

const log = createLogger('AuthContext');

/** Value exposed by {@link AuthProvider} through {@link useAuth}. */
export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Why the last session-restore attempt failed: 'network' (client could not reach server), 'server' (5xx), or null (no error / 401 / banned — silent logout is correct). */
  sessionError: 'network' | 'server' | null;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (data: {
    email: string;
    username: string;
    password: string;
    displayName?: string;
  }) => Promise<void>;
  /**
   * Signs out: the server logout (errors ignored), then `leave` (the caller navigates away from
   * the private page in it; `useSignOut` passes a `replace` navigation to `/`), then the user is
   * cleared, even when `leave` throws. Components call `useSignOut()`, never this directly.
   */
  logout: (leave?: () => Promise<void> | void) => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Clear `sessionError` to null without retrying — for the banner's dismiss action. */
  clearSessionError: () => void;
}

/**
 * The auth context object. Rendered by {@link AuthProvider}; `AppProviders` can also render it
 * with a fixed value (its `auth` prop) so test harnesses get a deterministic session.
 */
export const AuthContext = createContext<AuthContextType | null>(null);

/** Pure classifier: banned-account failures resolve to a logged-out state. */
function isBannedError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.code === 'USER_BANNED' || err.message.toLowerCase().includes('banned'))
  );
}

/**
 * Owns the authenticated-user state: restores the session on mount via
 * `userApi.me()` and exposes login/register/logout/refreshUser. Banned
 * accounts and expired sessions resolve to a logged-out state. A successful login,
 * registration or logout is announced to the other open tabs (`broadcastAuthChange`), which
 * follow it through `useAuthTabSync`; `refreshUser` and the bootstrap never broadcast.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionError, setSessionError] = useState<'network' | 'server' | null>(null);

  /** Clear `sessionError` to null without retrying — for the banner's dismiss action. */
  const clearSessionError = useCallback(() => setSessionError(null), []);

  /**
   * Loads the current user (`userApi.me`) and maps failures to the session state. With a
   * `signal` (the bootstrap effect), an aborted request returns without touching any state.
   * With `asTransition` (every {@link refreshUser} call) the resulting state is applied inside
   * `startTransition`, so it commits with or after a router navigation that is still being
   * committed: `useAuthTabSync` navigates to `/` and then re-reads the session, and an urgent
   * "signed out" update would otherwise render the old guarded page first and bounce to `/login`.
   */
  const loadUser = useCallback(async (signal?: AbortSignal, asTransition = false) => {
    log.debug({}, 'AuthContext token refresh started');
    let next: { user: AuthUser | null; sessionError: 'network' | 'server' | null };
    try {
      setSessionError(null);
      const userData = await userApi.me({ signal });
      log.debug({}, 'AuthContext token refresh completed');
      next = { user: userData, sessionError: null };
    } catch (err) {
      if (isAbortError(err)) {
        log.debug({}, 'AuthContext token refresh aborted');
        return;
      }
      if (isBannedError(err)) {
        log.warn({ err }, 'AuthContext user account is banned');
        next = { user: null, sessionError: null };
      } else if (err instanceof ApiError && err.status === 401) {
        log.warn({ err }, 'AuthContext session expired or not authenticated');
        next = { user: null, sessionError: null };
      } else if (err instanceof ApiError && err.status >= 500) {
        log.error({ err }, 'Session restore failed — server error');
        next = { user: null, sessionError: 'server' };
      } else if (!(err instanceof ApiError)) {
        log.error({ err }, 'Session restore failed — network error');
        next = { user: null, sessionError: 'network' };
      } else {
        // Other 4xx (403, 404) — treat as auth-state issue, not server health
        log.warn({ err }, 'AuthContext token refresh failed');
        next = { user: null, sessionError: null };
      }
    }
    const apply = () => {
      setUser(next.user);
      setSessionError(next.sessionError);
      setIsLoading(false);
    };
    if (asTransition) startTransition(apply);
    else apply();
  }, []);

  /**
   * Re-reads the current user (after login-affecting changes such as verifying an email, or a
   * sign-in or sign-out in another tab); the new state is applied as a transition.
   */
  const refreshUser = useCallback(() => loadUser(undefined, true), [loadUser]);

  // Session bootstrap (the one allowlisted effect fetch): aborted on unmount, so StrictMode's
  // throwaway mount does not race the real one.
  useEffect(() => {
    const controller = new AbortController();
    void loadUser(controller.signal);
    return () => controller.abort();
  }, [loadUser]);

  /**
   * Signs in and stores the user, then announces the sign-in to the other open tabs
   * (`broadcastAuthChange('login')`). A failure is logged and rethrown, without a broadcast.
   */
  async function login(email: string, password: string, rememberMe = false) {
    try {
      const response = await authApi.login({ email, password, rememberMe });
      log.info({ userId: response.user.id }, 'AuthContext user logged in');
      setUser(response.user);
      broadcastAuthChange('login');
    } catch (err) {
      if (isBannedError(err)) {
        log.warn({ err }, 'AuthContext user account is banned');
      } else {
        log.error({ err }, 'AuthContext login failed');
      }
      throw err;
    }
  }

  /**
   * Registers and stores the new (signed-in) user, then announces the sign-in to the other open
   * tabs (`broadcastAuthChange('login')`). A failure is logged and rethrown, without a broadcast.
   */
  async function register(data: {
    email: string;
    username: string;
    password: string;
    displayName?: string;
  }) {
    try {
      const response = await authApi.register(data);
      log.info({ userId: response.user.id }, 'AuthContext user registered');
      setUser(response.user);
      broadcastAuthChange('login');
    } catch (err) {
      log.error({ err }, 'AuthContext registration failed');
      throw err;
    }
  }

  /**
   * Clears the session cookies on the server (errors ignored: the cookies may already be gone),
   * announces the sign-out to the other open tabs (`broadcastAuthChange('logout')`, whether or
   * not the server logout succeeded), awaits `leave` so the caller leaves the private page while the user is still set (no loader
   * runs with the old session and no render guard bounces to `/login`), then clears the user in
   * `finally`. The user is cleared inside `startTransition`: the router commits its location
   * updates as transitions, so an urgent `setUser(null)` could render the old page signed out
   * (and `RequireAuth` would redirect to `/login`) before the navigation of `leave` commits; as
   * a transition it commits with or after that navigation.
   */
  async function logout(leave?: () => Promise<void> | void) {
    log.info({}, 'AuthContext user logged out');
    try {
      await authApi.logout();
    } catch {
      // Ignore errors — cookies may already be cleared
    }
    broadcastAuthChange('logout');
    try {
      await leave?.();
    } finally {
      startTransition(() => setUser(null));
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        sessionError,
        login,
        register,
        logout,
        refreshUser,
        clearSessionError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/** Accesses the auth context; throws when used outside {@link AuthProvider}. */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
