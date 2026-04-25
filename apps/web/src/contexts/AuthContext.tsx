import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { authApi, setAccessToken, clearTokens, getAccessToken, userApi } from '../api/index';

interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  onboardingCompleted: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; username: string; password: string; displayName?: string }) => Promise<void>;
  logout: () => void;
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
      clearTokens();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      refreshUser();
    } else {
      setIsLoading(false);
    }
  }, [refreshUser]);

  async function login(email: string, password: string) {
    const response = await authApi.login({ email, password });
    setAccessToken(response.accessToken);
    localStorage.setItem('brewform_refresh_token', response.refreshToken);
    setUser(response.user);
  }

  async function register(data: { email: string; username: string; password: string; displayName?: string }) {
    const response = await authApi.register(data);
    setAccessToken(response.accessToken);
    localStorage.setItem('brewform_refresh_token', response.refreshToken);
    setUser(response.user);
  }

  function logout() {
    clearTokens();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}