# BrewForm Phase 8 — Frontend Foundation

## Status: READY

## Overview

Set up the React+Vite+Tailwind frontend foundation: routing, theme system (light/dark/coffee), API client, auth context, global layout with nav/footer, and responsive base styles.

---

## File Inventory

### 1. `apps/web/src/styles/globals.css` — UPDATE

Replace the minimal Tailwind import with a complete theme system:

```css
@import 'tailwindcss';

@theme {
  --color-coffee-50: #faf6f1;
  --color-coffee-100: #f0e6d6;
  --color-coffee-200: #e0ccb0;
  --color-coffee-300: #c9a96e;
  --color-coffee-400: #b8914f;
  --color-coffee-500: #6f4e37;
  --color-coffee-600: #5a3e2b;
  --color-coffee-700: #4a3222;
  --color-coffee-800: #3e2723;
  --color-coffee-900: #2c1a12;

  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}

@layer base {
  :root {
    --bg-primary: #ffffff;
    --bg-secondary: #f5f5f4;
    --bg-tertiary: #e7e5e4;
    --text-primary: #1c1917;
    --text-secondary: #57534e;
    --text-tertiary: #a8a29e;
    --border-primary: #e7e5e4;
    --border-secondary: #d6d3d1;
    --accent-primary: #6f4e37;
    --accent-secondary: #8b6f47;
    --accent-hover: #5a3e2b;
    --success: #16a34a;
    --warning: #d97706;
    --error: #dc2626;
    --info: #2563eb;
  }

  .dark {
    --bg-primary: #1c1917;
    --bg-secondary: #292524;
    --bg-tertiary: #44403c;
    --text-primary: #fafaf9;
    --text-secondary: #a8a29e;
    --text-tertiary: #78716c;
    --border-primary: #44403c;
    --border-secondary: #57534e;
    --accent-primary: #c9a96e;
    --accent-secondary: #b8914f;
    --accent-hover: #e0ccb0;
    --success: #22c55e;
    --warning: #f59e0b;
    --error: #ef4444;
    --info: #3b82f6;
  }

  .coffee {
    --bg-primary: #3e2723;
    --bg-secondary: #4a3222;
    --bg-tertiary: #5a3e2b;
    --text-primary: #faf6f1;
    --text-secondary: #e0ccb0;
    --text-tertiary: #c9a96e;
    --border-primary: #5a3e2b;
    --border-secondary: #6f4e37;
    --accent-primary: #c9a96e;
    --accent-secondary: #e0ccb0;
    --accent-hover: #faf6f1;
    --success: #86efac;
    --warning: #fbbf24;
    --error: #fca5a5;
    --info: #93c5fd;
  }

  body {
    background-color: var(--bg-primary);
    color: var(--text-primary);
    font-family: var(--font-sans);
    transition: background-color 0.3s ease, color 0.3s ease;
  }

  .card {
    background-color: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: 0.75rem;
    padding: 1.5rem;
  }

  .btn-primary {
    background-color: var(--accent-primary);
    color: var(--bg-primary);
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-weight: 600;
    transition: background-color 0.15s ease;
  }
  .btn-primary:hover {
    background-color: var(--accent-hover);
  }

  .btn-secondary {
    background-color: var(--bg-tertiary);
    color: var(--text-primary);
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-weight: 500;
    border: 1px solid var(--border-primary);
    transition: background-color 0.15s ease;
  }
  .btn-secondary:hover {
    background-color: var(--border-secondary);
  }

  .input-field {
    background-color: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
    color: var(--text-primary);
    width: 100%;
    transition: border-color 0.15s ease;
  }
  .input-field:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(111, 78, 55, 0.1);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
    background-color: var(--accent-primary);
    color: var(--bg-primary);
  }
}
```

### 2. `apps/web/src/api/client.ts`

API client that handles auth tokens, refresh, and response envelope unwrapping:

```typescript
const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) {
    localStorage.setItem('brewform_access_token', token);
  } else {
    localStorage.removeItem('brewform_access_token');
  }
}

export function getAccessToken(): string | null {
  if (!accessToken) {
    accessToken = localStorage.getItem('brewform_access_token');
  }
  return accessToken;
}

export function clearTokens() {
  accessToken = null;
  localStorage.removeItem('brewform_access_token');
  localStorage.removeItem('brewform_refresh_token');
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('brewform_refresh_token');
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const data = await response.json();
    if (data.success) {
      setAccessToken(data.data.accessToken);
      localStorage.setItem('brewform_refresh_token', data.data.refreshToken);
      return data.data.accessToken;
    }
  } catch {
    clearTokens();
  }
  return null;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });
    } else {
      clearTokens();
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(data.error?.code || 'UNKNOWN_ERROR', data.error?.message || 'Request failed', data.error?.details, response.status);
  }

  return data.data as T;
}

export class ApiError extends Error {
  code: string;
  details?: Array<{ field: string; message: string }>;
  status: number;

  constructor(code: string, message: string, details?: Array<{ field: string; message: string }>, status: number = 500) {
    super(message);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, body: unknown) => request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(endpoint: string, body: unknown) => request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(endpoint: string, body: unknown) => request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
  upload: <T>(endpoint: string, formData: FormData) =>
    request<T>(endpoint, {
      method: 'POST',
      body: formData,
      headers: {} as Record<string, string>,
    }),
};
```

### 3. `apps/web/src/api/index.ts`

```typescript
export { api, setAccessToken, getAccessToken, clearTokens, ApiError } from './client.ts';

export const authApi = {
  register: (data: { email: string; username: string; password: string; displayName?: string }) =>
    api.post<{ user: any; accessToken: string; refreshToken: string }>('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post<{ user: any; accessToken: string; refreshToken: string }>('/auth/login', data),
  refresh: (data: { refreshToken: string }) =>
    api.post<{ user: any; accessToken: string; refreshToken: string }>('/auth/refresh', data),
  forgotPassword: (data: { email: string }) =>
    api.post<{ message: string }>('/auth/forgot-password', data),
  resetPassword: (data: { token: string; newPassword: string }) =>
    api.post<{ message: string }>('/auth/reset-password', data),
};

export const userApi = {
  me: () => api.get<any>('/users/me'),
  updateProfile: (data: any) => api.patch<any>('/users/me', data),
  deleteAccount: () => api.delete<{ message: string }>('/users/me'),
  getProfile: (username: string) => api.get<any>(`/users/${username}`),
};

export const recipeApi = {
  list: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<{ recipes: any[]; total: number }>(`/recipes${query}`);
  },
  get: (slugOrId: string) => api.get<any>(`/recipes/${slugOrId}`),
  create: (data: any) => api.post<any>('/recipes', data),
  update: (id: string, data: any) => api.patch<any>(`/recipes/${id}`, data),
  delete: (id: string) => api.delete<{ message: string }>(`/recipes/${id}`),
  fork: (id: string, title?: string) => api.post<any>(`/recipes/${id}/fork`, { title }),
  compare: (id1: string, id2: string) => api.get<any>(`/recipes/compare/${id1}/${id2}`),
};
```

### 4. `apps/web/src/contexts/AuthContext.tsx`

```tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authApi, setAccessToken, clearTokens, getAccessToken } from '../api/index.ts';

interface User {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  onboardingCompleted: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; username: string; password: string; displayName?: string }) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      refreshUser();
    } else {
      setIsLoading(false);
    }
  }, []);

  async function refreshUser() {
    try {
      const response = await authApi.login.__default;
      const userData = await import('../api/index.ts').then(m => m.api.get<User>('/users/me'));
      setUser(userData);
    } catch {
      clearTokens();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

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
```

### 5. `apps/web/src/contexts/ThemeContext.tsx`

```tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'coffee';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('brewform_theme') as Theme | null;
    if (stored && ['light', 'dark', 'coffee'].includes(stored)) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.className = theme;
    localStorage.setItem('brewform_theme', theme);
  }, [theme]);

  function setTheme(newTheme: Theme) {
    setThemeState(newTheme);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
```

### 6. `apps/web/src/components/layout/Navbar.tsx`

```tsx
import { Link } from 'react-router';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTheme } from '../../contexts/ThemeContext.tsx';

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <header style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)' }}>
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link to="/" className="text-xl font-bold" style={{ color: 'var(--accent-primary)' }}>
          ☕ BrewForm
        </Link>

        <div className="flex items-center gap-4">
          <Link to="/recipes" className="text-sm" style={{ color: 'var(--text-secondary)' }}>Recipes</Link>

          {isAuthenticated && (
            <>
              <Link to="/recipes/new" className="text-sm" style={{ color: 'var(--accent-primary)' }}>New Recipe</Link>
              <Link to="/setups" className="text-sm" style={{ color: 'var(--text-secondary)' }}>My Setups</Link>
              <Link to={`/u/${user?.username}`} className="text-sm" style={{ color: 'var(--text-secondary)' }}>Profile</Link>
            </>
          )}

          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as any)}
            className="text-sm rounded"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="coffee">Coffee</option>
          </select>

          {isAuthenticated ? (
            <button onClick={logout} className="btn-secondary text-sm">Log Out</button>
          ) : (
            <>
              <Link to="/login" className="text-sm" style={{ color: 'var(--text-secondary)' }}>Log In</Link>
              <Link to="/register" className="btn-primary text-sm">Sign Up</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
```

### 7. `apps/web/src/components/layout/Footer.tsx`

```tsx
import { Link } from 'react-router';

export function Footer() {
  return (
    <footer style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border-primary)' }}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--accent-primary)' }}>☕ BrewForm</h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Coffee brewing recipes and tasting notes.
            </p>
          </div>
          <div>
            <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Explore</h4>
            <div className="mt-2 flex flex-col gap-1">
              <Link to="/recipes" className="text-sm" style={{ color: 'var(--text-secondary)' }}>Recipes</Link>
              <Link to="/recipes?sort=popular" className="text-sm" style={{ color: 'var(--text-secondary)' }}>Popular</Link>
              <Link to="/taste-notes" className="text-sm" style={{ color: 'var(--text-secondary)' }}>Taste Notes</Link>
            </div>
          </div>
          <div>
            <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Legal</h4>
            <div className="mt-2 flex flex-col gap-1">
              <Link to="/privacy" className="text-sm" style={{ color: 'var(--text-secondary)' }}>Privacy Policy</Link>
              <Link to="/terms" className="text-sm" style={{ color: 'var(--text-secondary)' }}>Terms of Service</Link>
            </div>
          </div>
        </div>
        <div className="mt-6 border-t pt-4 text-center text-xs" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-tertiary)' }}>
          &copy; {new Date().getFullYear()} BrewForm. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
```

### 8. `apps/web/src/components/layout/Layout.tsx`

```tsx
import { Outlet } from 'react-router';
import { Navbar } from './Navbar.tsx';
import { Footer } from './Footer.tsx';
import { CookieConsent } from '../CookieConsent.tsx';

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <CookieConsent />
    </div>
  );
}
```

### 9. `apps/web/src/components/CookieConsent.tsx`

```tsx
import { useState, useEffect } from 'react';

export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('brewform_cookie_consent');
    if (!consent) setShow(true);
  }, []);

  function accept() {
    localStorage.setItem('brewform_cookie_consent', 'accepted');
    setShow(false);
  }

  function reject() {
    localStorage.setItem('brewform_cookie_consent', 'rejected');
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4" style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border-primary)', zIndex: 50 }}>
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          We use cookies to improve your experience. You can accept or reject non-essential cookies.
        </p>
        <div className="flex gap-2">
          <button onClick={reject} className="btn-secondary text-sm">Reject</button>
          <button onClick={accept} className="btn-primary text-sm">Accept</button>
        </div>
      </div>
    </div>
  );
}
```

### 10. `apps/web/src/router.tsx`

```tsx
import { createBrowserRouter } from 'react-router';
import { Layout } from './components/layout/Layout.tsx';
import { LoginPage } from './pages/auth/LoginPage.tsx';
import { RegisterPage } from './pages/auth/RegisterPage.tsx';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage.tsx';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
```

### 11. `apps/web/src/App.tsx` — UPDATE

```tsx
import { RouterProvider } from 'react-router';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { ThemeProvider } from './contexts/ThemeContext.tsx';
import { router } from './router.tsx';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  );
}
```

### 12. `apps/web/src/pages/HomePage.tsx`

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { recipeApi } from '../api/index.ts';

export function HomePage() {
  const [latestRecipes, setLatestRecipes] = useState<any[]>([]);
  const [popularRecipes, setPopularRecipes] = useState<any[]>([]);

  useEffect(() => {
    recipeApi.list({ perPage: '6', sortBy: 'createdAt' }).then(setLatestRecipes).catch(() => {});
    recipeApi.list({ perPage: '6', sortBy: 'likeCount' }).then(setPopularRecipes).catch(() => {});
  }, []);

  return (
    <div>
      <section className="mx-auto max-w-6xl px-6 py-12 text-center">
        <h1 className="text-4xl font-bold" style={{ color: 'var(--accent-primary)' }}>
          ☕ BrewForm
        </h1>
        <p className="mt-4 text-lg" style={{ color: 'var(--text-secondary)' }}>
          Digitalize, share, and discover coffee brewing recipes and tasting notes.
        </p>
        <div className="mt-6 flex justify-center gap-4">
          <Link to="/recipes" className="btn-primary">Browse Recipes</Link>
          <Link to="/register" className="btn-secondary">Get Started</Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <h2 className="mb-4 text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Latest Recipes</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {latestRecipes.map((r: any) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <h2 className="mb-4 text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Popular Recipes</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {popularRecipes.map((r: any) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      </section>
    </div>
  );
}

function RecipeCard({ recipe }: { recipe: any }) {
  return (
    <Link to={`/recipes/${recipe.slug}`} className="card hover:shadow-lg transition-shadow">
      <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{recipe.title}</h3>
      <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>by {recipe.author?.username}</p>
      <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        <span>❤️ {recipe.likeCount}</span>
        <span>💬 {recipe.commentCount}</span>
        <span>🍴 {recipe.forkCount}</span>
      </div>
    </Link>
  );
}
```

### 13. `apps/web/src/pages/NotFoundPage.tsx`

```tsx
import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-6xl font-bold" style={{ color: 'var(--accent-primary)' }}>404</h1>
      <p className="mt-4 text-lg" style={{ color: 'var(--text-secondary)' }}>
        Looks like this cup is empty. The page you're looking for doesn't exist.
      </p>
      <Link to="/" className="btn-primary mt-6">Go Home</Link>
    </div>
  );
}
```

### 14. `apps/web/src/pages/auth/LoginPage.tsx`

```tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext.tsx';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Log In</h1>
      {error && <p style={{ color: 'var(--error)' }}>{error}</p>}
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="input-field" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="input-field" required />
        <button type="submit" className="btn-primary">Log In</button>
      </form>
      <p className="mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <Link to="/forgot-password">Forgot password?</Link>
      </p>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        Don't have an account? <Link to="/register" style={{ color: 'var(--accent-primary)' }}>Sign up</Link>
      </p>
    </div>
  );
}
```

### 15. `apps/web/src/pages/auth/RegisterPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`

Similar patterns — form with state management, API calls, error handling. Registration form includes username, email, password, optional display name. Forgot password sends email. Reset password takes token from URL query params.

---

## Key Design Decisions

- **Three themes via CSS custom properties** — `:root` (light), `.dark` (dark), `.coffee` (coffee). Applied by setting `document.documentElement.className`.
- **API client handles token refresh** — automatically retries 401s with the refresh token before redirecting to login.
- **Auth context persists tokens** — stores access + refresh tokens in `localStorage`. Initial load checks for existing tokens.
- **Theme context syncs with user preferences** — once the user preference API is connected, theme changes call the preferences endpoint. Falls back to system preference for logged-out users.
- **Layout component wraps all pages** — provides Navbar, Footer, Outlet for page content, and CookieConsent banner.
- **All components use CSS custom properties** — no hardcoded colors. This ensures all themes work globally.
- **Responsive grid layouts** — Tailwind responsive classes (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`).