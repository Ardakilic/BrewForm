import type { AuthUser } from '@brewform/shared/types';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { createLogger } from '@/utils/logger.ts';
import { ApiError, isAbortError } from '../api/errors.ts';
import { authApi, userApi } from '../api/index.ts';

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
  logout: () => Promise<void>;
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
 * accounts and expired sessions resolve to a logged-out state.
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
   */
  const loadUser = useCallback(async (signal?: AbortSignal) => {
    log.debug({}, 'AuthContext token refresh started');
    try {
      setSessionError(null);
      const userData = await userApi.me({ signal });
      log.debug({}, 'AuthContext token refresh completed');
      setUser(userData);
    } catch (err) {
      if (isAbortError(err)) {
        log.debug({}, 'AuthContext token refresh aborted');
        return;
      }
      if (isBannedError(err)) {
        log.warn({ err }, 'AuthContext user account is banned');
        setUser(null);
        setSessionError(null);
      } else if (err instanceof ApiError && err.status === 401) {
        log.warn({ err }, 'AuthContext session expired or not authenticated');
        setUser(null);
        setSessionError(null);
      } else if (err instanceof ApiError && err.status >= 500) {
        log.error({ err }, 'Session restore failed — server error');
        setUser(null);
        setSessionError('server');
      } else if (!(err instanceof ApiError)) {
        log.error({ err }, 'Session restore failed — network error');
        setUser(null);
        setSessionError('network');
      } else {
        // Other 4xx (403, 404) — treat as auth-state issue, not server health
        log.warn({ err }, 'AuthContext token refresh failed');
        setUser(null);
        setSessionError(null);
      }
    }
    setIsLoading(false);
  }, []);

  /** Re-reads the current user (after login-affecting changes such as verifying an email). */
  const refreshUser = useCallback(() => loadUser(), [loadUser]);

  // Session bootstrap (the one allowlisted effect fetch): aborted on unmount, so StrictMode's
  // throwaway mount does not race the real one.
  useEffect(() => {
    const controller = new AbortController();
    void loadUser(controller.signal);
    return () => controller.abort();
  }, [loadUser]);

  async function login(email: string, password: string, rememberMe = false) {
    try {
      const response = await authApi.login({ email, password, rememberMe });
      log.info({ userId: response.user.id }, 'AuthContext user logged in');
      setUser(response.user);
    } catch (err) {
      if (isBannedError(err)) {
        log.warn({ err }, 'AuthContext user account is banned');
      } else {
        log.error({ err }, 'AuthContext login failed');
      }
      throw err;
    }
  }

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
    } catch (err) {
      log.error({ err }, 'AuthContext registration failed');
      throw err;
    }
  }

  async function logout() {
    log.info({}, 'AuthContext user logged out');
    try {
      await authApi.logout();
    } catch {
      // Ignore errors — cookies may already be cleared
    }
    setUser(null);
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
