/**
 * BrewForm Auth Context
 * Manages user authentication state
 */

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { api } from '../utils/api';

// ============================================
// Types
// ============================================

interface User {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

interface RegisterData {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============================================
// Token Management
// ============================================

const TOKEN_KEY = 'brewform-access-token';
const REFRESH_TOKEN_KEY = 'brewform-refresh-token';

function getStoredTokens(): { accessToken: string | null; refreshToken: string | null } {
  return {
    accessToken: localStorage.getItem(TOKEN_KEY),
    refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY),
  };
}

function storeTokens(tokens: TokenPair) {
  localStorage.setItem(TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// ============================================
// Auth Provider
// ============================================

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { accessToken } = getStoredTokens();
    
    if (!accessToken) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.get('/auth/me');
      if (response.success) {
        setUser(response.data);
      } else {
        clearTokens();
      }
    } catch {
      clearTokens();
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });
    
    if (!response.success) {
      throw new Error(response.error?.message || 'Login failed');
    }

    storeTokens(response.data.tokens);
    setUser(response.data.user);
  };

  const register = async (data: RegisterData) => {
    const response = await api.post('/auth/register', data);
    
    if (!response.success) {
      throw new Error(response.error?.message || 'Registration failed');
    }

    storeTokens(response.data.tokens);
    setUser(response.data.user);
  };

  const logout = async () => {
    const { refreshToken } = getStoredTokens();
    
    try {
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } finally {
      clearTokens();
      setUser(null);
    }
  };

  const refreshUser = async () => {
    await checkAuth();
  };

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

// ============================================
// Hook
// ============================================

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Export token utilities for API client
export { getStoredTokens, storeTokens, clearTokens };
