import type { AuthUser } from '@brewform/shared/types';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { authApi, userApi } from '../api/index.ts';

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

  const refreshUser = useCallback(async () => {
    try {
      const userData = await userApi.me();
      setUser(userData);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  async function login(email: string, password: string, rememberMe = false) {
    const response = await authApi.login({ email, password, rememberMe });
    setUser(response.user);
  }

  async function register(
    data: { email: string; username: string; password: string; displayName?: string },
  ) {
    const response = await authApi.register(data);
    setUser(response.user);
  }

  async function logout() {
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
