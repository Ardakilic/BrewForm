import type { AuthUser } from '@brewform/shared/types';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { ApiError, authApi, userApi } from '../api/index.ts';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('AuthContext');

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (
    data: { email: string; username: string; password: string; displayName?: string },
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  function isBannedError(err: unknown): boolean {
    return err instanceof ApiError &&
      (err.code === 'USER_BANNED' || err.message.toLowerCase().includes('banned'));
  }

  const refreshUser = useCallback(async () => {
    log.debug({}, 'AuthContext token refresh started');
    try {
      const userData = await userApi.me();
      log.debug({}, 'AuthContext token refresh completed');
      setUser(userData);
    } catch (err) {
      if (isBannedError(err)) {
        log.warn({ err }, 'AuthContext user account is banned');
      } else {
        log.warn({ err }, 'AuthContext token refresh failed — session may be expired');
      }
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser().catch(() => {});
  }, [refreshUser]);

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

  async function register(
    data: { email: string; username: string; password: string; displayName?: string },
  ) {
    try {
      const response = await authApi.register(data);
      log.info({ userId: response.user.id }, 'AuthContext user logged in');
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
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
