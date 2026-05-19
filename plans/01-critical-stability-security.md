# Plan 01 -- Critical Stability & Security

**Priority:** P0 (do first)
**Issues covered:** C2, H11, H12, H13, N1, N5
**Estimated effort:** 3--4 days
**Impact:** Eliminates XSS token theft vector, prevents white-screen crashes, adds 6 missing security headers, closes open-redirect hole, enables email verification, and fixes Deno Deploy rate-limit leak.

---

## Table of Contents

1. [C2 -- No React Error Boundary (White Screen on Crash)](#c2----no-react-error-boundary-white-screen-on-crash)
2. [H13 -- Missing HTTP Security Headers](#h13----missing-http-security-headers)
3. [H11 -- JWT Tokens Stored in localStorage (XSS-Vulnerable)](#h11----jwt-tokens-stored-in-localstorage-xss-vulnerable)
4. [H12 -- No Email Verification Flow](#h12----no-email-verification-flow)
5. [N1 -- sessionStorage.redirect Script (Open Redirect Risk)](#n1----sessionstorageredirect-script-open-redirect-risk)
6. [N5 -- authRateLimitMiddleware Uses In-Memory Map (Deno Deploy Issue)](#n5----authratelimitmiddleware-uses-in-memory-map-deno-deploy-issue)
7. [Dependencies & Ordering](#dependencies--ordering)

---

## C2 -- No React Error Boundary (White Screen on Crash)

### Evidence

| Location | Finding |
|----------|---------|
| `apps/web/src/router.tsx` | 41 static imports, zero `errorElement` or `ErrorBoundary` property on any route |
| `apps/web/src/App.tsx:7-16` | `RouterProvider` wrapped in `ThemeProvider > I18nProvider > AuthProvider`, no `ErrorBoundary` wrapper |
| `apps/web/src/` (full grep) | Zero occurrences of `ErrorBoundary`, `React.lazy`, `Suspense`, `ScrollRestoration` |

### Impact

Any unhandled exception in any route component (API network failure, undefined property access, malformed data from backend) produces a blank white screen. The user has no way to recover without manually navigating or refreshing. This is especially likely during deploys when API responses change shape.

### Action Plan

- [ ] **1. Create `apps/web/src/components/ErrorBoundary.tsx`**

```tsx
import { useRouteError, isRouteErrorResponse, Link } from 'react-router';

export function RootErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
        style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      >
        <h1 className="text-6xl font-bold" style={{ color: 'var(--accent-primary)' }}>
          {error.status}
        </h1>
        <p className="mt-4 text-lg" style={{ color: 'var(--text-secondary)' }}>
          {error.status === 404
            ? "Looks like this cup is empty. The page you're looking for doesn't exist."
            : error.statusText || 'Something went wrong.'}
        </p>
        <div className="mt-6 flex gap-4">
          <Link to="/" className="btn-primary">Go Home</Link>
          <button
            type="button"
            className="btn-primary"
            onClick={() => globalThis.location.reload()}
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  const message = error instanceof Error ? error.message : 'An unexpected error occurred.';

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <h1 className="text-6xl font-bold" style={{ color: 'var(--accent-primary)' }}>
        Oops
      </h1>
      <p className="mt-4 text-lg" style={{ color: 'var(--text-secondary)' }}>
        {message}
      </p>
      {import.meta.env.DEV && error instanceof Error && error.stack && (
        <pre
          className="mt-4 max-w-2xl overflow-auto rounded-lg p-4 text-left text-xs"
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
        >
          {error.stack}
        </pre>
      )}
      <div className="mt-6 flex gap-4">
        <Link to="/" className="btn-primary">Go Home</Link>
        <button
          type="button"
          className="btn-primary"
          onClick={() => globalThis.location.reload()}
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}
```

- [ ] **2. Add `errorElement` to root route in `apps/web/src/router.tsx`**

Add the import at the top:
```ts
import { RootErrorBoundary } from './components/ErrorBoundary';
```

Modify the root route object to include `errorElement`:
```ts
// Before:
{
  path: '/',
  element: <Layout />,
  children: [ ... ],
}

// After:
{
  path: '/',
  element: <Layout />,
  errorElement: <RootErrorBoundary />,
  children: [ ... ],
}
```

- [ ] **3. Add error boundary to admin section**

The `/admin` route tree has its own top-level route object. Add a separate error boundary there:

```ts
// Before:
{
  path: '/admin',
  element: (
    <RequireAuth requireAdmin>
      <AdminLayout />
    </RequireAuth>
  ),
  children: [ ... ],
}

// After:
{
  path: '/admin',
  element: (
    <RequireAuth requireAdmin>
      <AdminLayout />
    </RequireAuth>
  ),
  errorElement: <RootErrorBoundary />,
  children: [ ... ],
}
```

- [ ] **4. Verify** -- Navigate to a non-existent route and confirm `RootErrorBoundary` renders. Temporarily throw an error in a route component and confirm the error screen appears instead of a white screen.

---

## H13 -- Missing HTTP Security Headers

### Evidence

| Location | Finding |
|----------|---------|
| `apps/api/src/main.ts:45-51` | Middleware chain: `cors -> requestId -> rateLimit -> cache injection`. Zero security headers. |
| Full codebase grep | Zero occurrences of `secureHeaders`, `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security` |

### Impact

Without security headers, the application is vulnerable to:
- **Clickjacking** (no `X-Frame-Options`)
- **MIME-type sniffing attacks** (no `X-Content-Type-Options`)
- **Protocol downgrade attacks** (no `Strict-Transport-Security`)
- **Uncontrolled browser feature access** (no `Permissions-Policy`)
- **Loose referrer leaking** (no `Referrer-Policy`)

### Action Plan

- [ ] **1. Add `secureHeaders` middleware to `apps/api/src/main.ts`**

Add the import:
```ts
import { secureHeaders } from 'hono/secure-headers';
```

Insert the middleware **after** CORS and **before** rate limiting. The CORS middleware must run first because `secureHeaders` does not handle preflight; placing it after CORS ensures `Access-Control-*` headers are already set when the security headers are appended.

```ts
// apps/api/src/main.ts -- updated middleware stack

app.use('*', corsMiddleware);
app.use('*', requestIdMiddleware);
app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],  // Tailwind JIT injects inline styles
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
  },
  strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
  xContentTypeOptions: 'nosniff',
  xFrameOptions: 'DENY',
  referrerPolicy: 'strict-origin-when-cross-origin',
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
  },
}));
app.use('*', rateLimitMiddleware({ windowMs: 60_000, maxRequests: 100 }));
app.use('*', async (c, next) => {
  c.set('cache', cacheProvider);
  await next();
});
```

> **Note on Hono v4 `secureHeaders` API:** The `secureHeaders()` function accepts an options object where each header is a named property. CSP directives use an object with directive names as keys and arrays of sources as values. HSTS and other single-value headers take strings. `permissionsPolicy` takes an object where each feature maps to an array of allowlist entries (empty array = disabled for all origins). Consult the [Hono secure headers docs](https://hono.dev/docs/middleware/builtin/secure-headers) if the API has changed since this plan was written.

- [ ] **2. Verify** -- Start the API server and run:
```bash
curl -I http://localhost:8000/health
```
Confirm the response includes: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.

---

## H11 -- JWT Tokens Stored in localStorage (XSS-Vulnerable)

### Evidence

| Location | Finding |
|----------|---------|
| `apps/web/src/api/client.ts:8` | `localStorage.setItem('brewform_access_token', token)` |
| `apps/web/src/api/client.ts:16` | `localStorage.getItem('brewform_access_token')` |
| `apps/web/src/api/client.ts:24` | `localStorage.removeItem('brewform_access_token')` |
| `apps/web/src/api/client.ts:29` | `localStorage.getItem('brewform_refresh_token')` |
| `apps/web/src/contexts/AuthContext.tsx:55-62` | Login stores access + refresh tokens in localStorage |
| `apps/web/src/contexts/AuthContext.tsx:66-71` | Register stores access + refresh tokens in localStorage |
| `apps/api/src/modules/auth/index.ts:38-42` | Register handler returns tokens in JSON body |
| `apps/api/src/modules/auth/index.ts:86-89` | Login handler returns tokens in JSON body |
| `apps/api/src/middleware/auth.ts:19-24` | Reads token from `Authorization: Bearer` header only |
| `apps/api/src/middleware/cors.ts:8` | `credentials: true` already set |
| Full codebase grep | Zero `Set-Cookie` anywhere in auth module |
| `apps/web/src/api/client.ts:63-66` | Fetch calls do NOT include `credentials: 'include'` |

### Impact

Any XSS vulnerability (even via a third-party script or browser extension) can steal the JWT from `localStorage`. Unlike cookies with `httpOnly`, JavaScript can freely read `localStorage`. An attacker can exfiltrate both access and refresh tokens, gaining full persistent access to the victim's account.

### Action Plan

#### Backend Changes

- [ ] **1. Add cookie helper functions to `apps/api/src/modules/auth/index.ts`**

Import Hono's cookie utilities at the top of the file:
```ts
import { setCookie, deleteCookie } from 'hono/cookie';
import type { Context } from 'hono';
```

Create helper functions (add before the `sanitizeUser` function, near the bottom of the file):
```ts
function setAuthCookies(
  c: Context,
  accessToken: string,
  refreshToken: string,
  rememberMe = false,
) {
  const isProduction = config.APP_ENV === 'production';

  setCookie(c, 'brewform_access_token', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'Strict',
    path: '/',
    maxAge: 15 * 60, // 15 minutes (matches JWT_ACCESS_EXPIRY default)
  });

  setCookie(c, 'brewform_refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'Strict',
    path: '/api/v1/auth', // only sent to auth endpoints (refresh, logout)
    maxAge: rememberMe ? 180 * 24 * 60 * 60 : 7 * 24 * 60 * 60, // 180d or 7d
  });
}

function clearAuthCookies(c: Context) {
  const isProduction = config.APP_ENV === 'production';

  // NOTE: deleteCookie only accepts `path`, `secure`, and `domain`.
  // httpOnly/sameSite/maxAge are setCookie-only options — the browser
  // matches cookies to delete by name + path + domain, not flags.
  deleteCookie(c, 'brewform_access_token', {
    path: '/',
    secure: isProduction,
  });

  deleteCookie(c, 'brewform_refresh_token', {
    path: '/api/v1/auth',
    secure: isProduction,
  });
}
```

- [ ] **2. Update login handler to set cookies**

```ts
// apps/api/src/modules/auth/index.ts -- login handler (around line 86)
// Replace the success() call:

// Before:
return success(c, {
  user: sanitizeUser(result.user),
  accessToken: result.accessToken,
  refreshToken: result.refreshToken,
});

// After:
setAuthCookies(c, result.accessToken, result.refreshToken, body.rememberMe);
return success(c, {
  user: sanitizeUser(result.user),
});
```

- [ ] **3. Update register handler to set cookies**

```ts
// apps/api/src/modules/auth/index.ts -- register handler (around line 38)
// Replace the success() call:

// Before:
return success(c, {
  user: sanitizeUser(result.user),
  accessToken: result.accessToken,
  refreshToken: result.refreshToken,
}, 201);

// After:
setAuthCookies(c, result.accessToken, result.refreshToken);
return success(c, {
  user: sanitizeUser(result.user),
}, 201);
```

- [ ] **4. Update refresh handler to set cookies and read refresh token from cookie**

```ts
import { getCookie } from 'hono/cookie';
```

In the refresh handler, after validating the JSON body:
```ts
// Read refresh token from cookie as fallback when body field is empty
const refreshTokenValue = body.refreshToken || getCookie(c, 'brewform_refresh_token');
if (!refreshTokenValue) {
  return error(c, 'INVALID_REFRESH_TOKEN', 'No refresh token provided', 401);
}
// Use refreshTokenValue instead of body.refreshToken
const result = await authService.refreshAccessToken(refreshTokenValue, body.rememberMe);
setAuthCookies(c, result.accessToken, result.refreshToken, body.rememberMe);
return success(c, {
  user: sanitizeUser(result.user),
});
```

Note: The `AuthRefreshSchema` Zod validator currently requires `refreshToken` in the body. During the migration period, make `refreshToken` optional in the schema in `packages/shared/src/schemas/`. Once the frontend is fully migrated, the body field can be removed.

- [ ] **5. Add logout endpoint to `apps/api/src/modules/auth/index.ts`**

Add before the `sanitizeUser` function:

```ts
auth.post(
  '/logout',
  describeRoute({
    tags: ['Auth'],
    summary: 'Log out and clear auth cookies',
    description: 'Clears the httpOnly auth cookies. No token required.',
    responses: {
      200: { description: 'Logged out' },
    },
  }),
  (c) => {
    clearAuthCookies(c);
    return success(c, { message: 'Logged out successfully' });
  },
);
```

- [ ] **6. Update `apps/api/src/middleware/auth.ts` to read from cookies**

The auth middleware currently only reads from the `Authorization` header. Update both `authMiddleware` and `optionalAuthMiddleware` to also accept the cookie:

```ts
// apps/api/src/middleware/auth.ts -- FULL REPLACEMENT
import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { verifyJwt } from '../modules/auth/jwt.ts';
import { db } from '@brewform/db';
import { users } from '@brewform/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { forbidden, unauthorized } from '../utils/response/index.ts';

/** Extract access token from Authorization header or httpOnly cookie. */
function extractAccessToken(c: Context): string | undefined {
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return getCookie(c, 'brewform_access_token');
}

export async function authMiddleware(c: Context, next: Next) {
  const token = extractAccessToken(c);

  if (!token) {
    return unauthorized(c, 'Missing or invalid Authorization header');
  }

  try {
    const payload = await verifyJwt(token);
    if (!payload.sub || payload.type !== 'access') {
      return unauthorized(c, 'Invalid token payload');
    }

    const result = await db.select().from(users)
      .where(and(eq(users.id, payload.sub), isNull(users.deletedAt)))
      .limit(1);
    const user = result[0];

    if (!user) {
      return unauthorized(c, 'User not found');
    }
    if (user.isBanned) {
      return unauthorized(c, 'User account is banned');
    }

    c.set('userId', user.id);
    c.set('user', user);
    await next();
  } catch {
    return unauthorized(c, 'Invalid or expired token');
  }
}

export async function optionalAuthMiddleware(c: Context, next: Next) {
  const token = extractAccessToken(c);

  if (!token) {
    c.set('userId', null);
    c.set('user', null);
    await next();
    return;
  }

  try {
    const payload = await verifyJwt(token);
    if (payload.sub && payload.type === 'access') {
      const result = await db.select().from(users)
        .where(and(eq(users.id, payload.sub), isNull(users.deletedAt)))
        .limit(1);
      const user = result[0];
      if (user && !user.isBanned) {
        c.set('userId', user.id);
        c.set('user', user);
      } else {
        c.set('userId', null);
        c.set('user', null);
      }
    } else {
      c.set('userId', null);
      c.set('user', null);
    }
  } catch {
    c.set('userId', null);
    c.set('user', null);
  }
  await next();
}

export async function adminMiddleware(c: Context, next: Next) {
  const user = c.get('user') as { isAdmin: boolean } | null;
  if (!user || !user.isAdmin) {
    return forbidden(c, 'Admin access required');
  }
  await next();
}
```

#### Frontend Changes

- [ ] **7. Rewrite `apps/web/src/api/client.ts`**

Remove all `localStorage` token operations. The browser sends httpOnly cookies automatically for same-origin requests. Add `credentials: 'include'` for future-proofing (needed if API is ever on a different subdomain).

```ts
// apps/web/src/api/client.ts -- FULL REPLACEMENT

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  let response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // send httpOnly cookies with every request
  });

  // If access token cookie expired, try a silent refresh
  if (response.status === 401) {
    const refreshResponse = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}), // refresh token is in the cookie
      credentials: 'include',
    });

    if (refreshResponse.ok) {
      // Retry the original request -- new access token cookie was set by the server
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include',
      });
    } else {
      // Refresh failed -- session is truly expired
      globalThis.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data.error?.code || 'UNKNOWN_ERROR',
      data.error?.message || 'Request failed',
      data.error?.details,
      response.status,
    );
  }

  return data.data as T;
}

export class ApiError extends Error {
  code: string;
  details?: Array<{ field: string; message: string }>;
  status: number;

  constructor(
    code: string,
    message: string,
    details?: Array<{ field: string; message: string }>,
    status: number = 500,
  ) {
    super(message);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
  upload: <T>(endpoint: string, formData: FormData) =>
    request<T>(endpoint, {
      method: 'POST',
      body: formData,
      headers: {} as Record<string, string>, // let browser set Content-Type for multipart
    }),
};
```

- [ ] **8. Update `apps/web/src/api/index.ts` -- remove token re-exports**

Remove the now-nonexistent re-exports (`clearTokens`, `getAccessToken`, `setAccessToken`) and update `authApi` response types:

```ts
// First line changes:
import { api, ApiError } from './client.ts';
export { api, ApiError };

// Updated authApi (tokens no longer in response body):
export const authApi = {
  register: (data: { email: string; username: string; password: string; displayName?: string }) =>
    api.post<{ user: AuthUser }>('/auth/register', data),
  login: (data: { email: string; password: string; rememberMe?: boolean }) =>
    api.post<{ user: AuthUser }>('/auth/login', data),
  logout: () => api.post<{ message: string }>('/auth/logout', {}),
  forgotPassword: (data: { email: string }) =>
    api.post<{ message: string }>('/auth/forgot-password', data),
  resetPassword: (data: { token: string; newPassword: string }) =>
    api.post<{ message: string }>('/auth/reset-password', data),
  registrationStatus: () => api.get<{ enabled: boolean }>('/auth/registration-status'),
};
```

The rest of the file (`userApi`, `recipeApi`, etc.) remains unchanged.

- [ ] **9. Update `apps/web/src/contexts/AuthContext.tsx`**

Remove all `localStorage` and token management. The auth context now only tracks the user object; cookie management is handled entirely by the browser.

```tsx
// apps/web/src/contexts/AuthContext.tsx -- FULL REPLACEMENT

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { authApi, userApi } from '../api/index';

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

  // On mount, try to fetch the current user.
  // If the access token cookie is present, the server will recognize us.
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
      // Server might be unreachable; clear local state anyway
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
```

- [ ] **10. Search for and update all remaining `clearTokens` / `getAccessToken` / `setAccessToken` imports**

Run:
```bash
grep -rn 'clearTokens\|getAccessToken\|setAccessToken\|localStorage.*brewform_' apps/web/src/ --include='*.ts' --include='*.tsx'
```

Any remaining references must be removed or replaced with the new cookie-based flow. The `logout` function should call `authApi.logout()` instead of `clearTokens()`.

- [ ] **11. Verify** -- Log in, confirm no tokens appear in `localStorage`. Open DevTools > Application > Cookies and confirm `brewform_access_token` and `brewform_refresh_token` are present with `HttpOnly` flag. Close the browser tab, reopen, and confirm the session persists (cookie was not session-scoped).

---

## H12 -- No Email Verification Flow

### Evidence

| Location | Finding |
|----------|---------|
| `packages/db/src/schema.ts` -- `users` table (lines 132-155) | No `emailVerifiedAt` or `emailVerified` column |
| `apps/api/src/modules/auth/service.ts:34-69` | `register()` immediately returns tokens after creating user -- no verification step |
| `apps/api/src/routes/index.ts:38` | Auth routes: register, login, refresh, forgot-password, reset-password, registration-status. No verify-email. |
| `apps/api/src/modules/auth/email.ts` | Only `sendWelcomeEmail` and `sendPasswordResetEmail` -- no verification email |

### Impact

Without email verification:
- Users can register with disposable/fake email addresses
- Impossible to reliably send password reset emails
- No proof that the user owns the email they registered with
- Account recovery is broken for mistyped emails

### Action Plan

#### Database Changes

- [ ] **1. Add `emailVerifiedAt` column to users table in `packages/db/src/schema.ts`**

Add inside the `users` table definition, after the `email` field (around line 137):

```ts
// packages/db/src/schema.ts -- in the users table column definitions
emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
```

This is a nullable timestamp column -- `null` means unverified, a timestamp means verified.

- [ ] **2. Create `emailVerificationTokens` table in `packages/db/src/schema.ts`**

Add after the `passwordResets` table definition (after line 632):

```ts
export const emailVerificationTokens = pgTable(
  'email_verification_token',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, {
      onDelete: 'cascade',
    }),
    token: varchar('token', { length: 255 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('email_verification_token_token_idx').on(table.token),
    index('email_verification_token_user_id_idx').on(table.userId),
    index('email_verification_token_expires_at_idx').on(table.expiresAt),
  ],
);
```

- [ ] **3. Add relations for the new table**

```ts
export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, {
    fields: [emailVerificationTokens.userId],
    references: [users.id],
  }),
}));
```

Also update `usersRelations` to include:
```ts
emailVerificationTokens: many(emailVerificationTokens),
```

- [ ] **4. Run migration**

```bash
make db-generate
make db-migrate
```

#### Backend Changes

- [ ] **5. Create email verification email template**

Create a new MJML template at `apps/api/src/modules/auth/templates/verify-email.mjml` (follow the pattern of the existing `password-reset.mjml`). The template should contain a link to `{{appUrl}}/verify-email?token={{token}}`.

- [ ] **6. Add `sendVerificationEmail` function to `apps/api/src/modules/auth/email.ts`**

Follow the pattern of `sendPasswordResetEmail` -- compile the MJML template, replace template variables, and send via Nodemailer.

- [ ] **7. Add model functions to `apps/api/src/modules/auth/model.ts`**

```ts
import { emailVerificationTokens } from '@brewform/db/schema';

export async function createEmailVerificationToken(
  userId: string,
  token: string,
  expiresAt: Date,
) {
  await db.insert(emailVerificationTokens).values({
    userId,
    token,
    expiresAt,
  });
}

export async function findEmailVerificationByToken(token: string) {
  const result = await db.select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.token, token))
    .limit(1);
  return result[0] ?? null;
}

export async function markEmailVerified(userId: string, tokenId: string) {
  await db.update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(users.id, userId));
  await db.update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(emailVerificationTokens.id, tokenId));
}
```

- [ ] **8. Add service functions to `apps/api/src/modules/auth/service.ts`**

```ts
export async function sendVerificationToken(userId: string, email: string) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000); // 24 hours

  await model.createEmailVerificationToken(userId, token, expiresAt);
  await sendVerificationEmail(email, token);
}

export async function verifyEmail(token: string) {
  const record = await model.findEmailVerificationByToken(token);
  if (!record) {
    throw new Error('INVALID_VERIFICATION_TOKEN');
  }
  if (record.usedAt) {
    throw new Error('TOKEN_ALREADY_USED');
  }
  if (new Date(record.expiresAt) < new Date()) {
    throw new Error('TOKEN_EXPIRED');
  }

  await model.markEmailVerified(record.userId, record.id);
}
```

- [ ] **9. Modify `register` in `service.ts` to send verification email**

In the `register()` function, replace the `sendWelcomeEmail` call with `sendVerificationToken`:

```ts
// Before:
try {
  await sendWelcomeEmail(user.email, user.username);
} catch (err) {
  logger.warn({ err }, 'Failed to send welcome email');
}

// After:
try {
  await sendVerificationToken(user.id, user.email);
} catch (err) {
  logger.warn({ err }, 'Failed to send verification email');
}
```

Registration should still return the user object (and set cookies per H11). The user can log in immediately but will see a "verify your email" banner and be gated from certain actions.

- [ ] **10. Add API endpoints to `apps/api/src/modules/auth/index.ts`**

```ts
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.ts';

auth.post(
  '/send-verification',
  authMiddleware,
  describeRoute({
    tags: ['Auth'],
    summary: 'Resend email verification link',
    responses: {
      200: { description: 'Verification email sent (if account is unverified)' },
      401: { description: 'Authentication required' },
    },
  }),
  async (c) => {
    const user = c.get('user') as { id: string; email: string; emailVerifiedAt: Date | null };
    if (user.emailVerifiedAt) {
      return success(c, { message: 'Email is already verified' });
    }
    await authService.sendVerificationToken(user.id, user.email);
    return success(c, { message: 'Verification email sent' });
  },
);

auth.post(
  '/verify-email',
  describeRoute({
    tags: ['Auth'],
    summary: 'Verify email address with token',
    responses: {
      200: { description: 'Email verified' },
      400: { description: 'Invalid or expired token' },
    },
  }),
  zValidator('json', z.object({ token: z.string().min(1) })),
  async (c) => {
    const { token } = c.req.valid('json');
    try {
      await authService.verifyEmail(token);
      return success(c, { message: 'Email verified successfully' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'INVALID_VERIFICATION_TOKEN') {
        return error(c, 'INVALID_TOKEN', 'Invalid verification token', 400);
      }
      if (message === 'TOKEN_ALREADY_USED') {
        return error(c, 'TOKEN_USED', 'This verification token has already been used', 400);
      }
      if (message === 'TOKEN_EXPIRED') {
        return error(c, 'TOKEN_EXPIRED', 'This verification token has expired', 400);
      }
      throw err;
    }
  },
);
```

- [ ] **11. Add email verification gating (soft enforcement)**

Create a reusable guard. In service functions for recipe creation and commenting, check if the user's email is verified before allowing the action:

```ts
// apps/api/src/utils/response/index.ts -- add this helper
export function isEmailVerified(c: Context): boolean {
  const user = c.get('user') as { emailVerifiedAt: Date | null } | null;
  return !!user?.emailVerifiedAt;
}
```

Apply this check in the recipe create and comment create handlers:
```ts
if (!isEmailVerified(c)) {
  return error(c, 'EMAIL_NOT_VERIFIED', 'Please verify your email to perform this action', 403);
}
```

Users can still browse, view recipes, and access their settings without verification.

#### Frontend Changes

- [ ] **12. Add `emailVerifiedAt` to the frontend `AuthUser` interface**

In `apps/web/src/contexts/AuthContext.tsx` and `apps/web/src/api/index.ts`, add to the `AuthUser` interface:
```ts
emailVerifiedAt: string | null;
```

Ensure the backend's `sanitizeUser` function includes `emailVerifiedAt` in its output (it currently spreads all fields except `passwordHash`, so it should already be included after the schema migration).

- [ ] **13. Create `apps/web/src/components/EmailVerificationBanner.tsx`**

```tsx
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../api/index';

export function EmailVerificationBanner() {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Only show for logged-in users with unverified emails
  if (!user || user.emailVerifiedAt) return null;

  const handleResend = async () => {
    setSending(true);
    try {
      await authApi.sendVerification();
      setSent(true);
    } catch {
      // Silently fail -- user can try again
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="flex items-center justify-center gap-2 px-4 py-2 text-sm"
      style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
    >
      <span>Please verify your email address to unlock all features.</span>
      <button
        type="button"
        onClick={handleResend}
        disabled={sending || sent}
        className="underline font-medium"
      >
        {sent ? 'Email sent!' : sending ? 'Sending...' : 'Resend verification email'}
      </button>
    </div>
  );
}
```

Add `sendVerification` to `authApi` in `apps/web/src/api/index.ts`:
```ts
sendVerification: () => api.post<{ message: string }>('/auth/send-verification', {}),
```

- [ ] **14. Add the banner to Layout**

In `apps/web/src/components/layout/Layout.tsx`, import and render `EmailVerificationBanner` at the top of the layout, above the main content area.

- [ ] **15. Create `/verify-email` route and page**

Create `apps/web/src/pages/auth/VerifyEmailPage.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { authApi } from '../../api/index';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuth();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('No verification token provided.');
      return;
    }

    authApi.verifyEmail({ token })
      .then(async () => {
        await refreshUser(); // re-fetch user so emailVerifiedAt is set in AuthContext
        setStatus('success');
      })
      .catch((err) => {
        setStatus('error');
        setErrorMessage(err.message || 'Verification failed.');
      });
  }, [token, refreshUser]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      {status === 'loading' && (
        <p style={{ color: 'var(--text-secondary)' }}>Verifying your email...</p>
      )}
      {status === 'success' && (
        <>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--accent-primary)' }}>
            Email Verified!
          </h1>
          <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>
            Your email has been verified. You now have full access to all features.
          </p>
          <Link to="/" className="btn-primary mt-6">Go Home</Link>
        </>
      )}
      {status === 'error' && (
        <>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--accent-primary)' }}>
            Verification Failed
          </h1>
          <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>
            {errorMessage}
          </p>
          <Link to="/" className="btn-primary mt-6">Go Home</Link>
        </>
      )}
    </div>
  );
}
```

Add `verifyEmail` to `authApi` in `apps/web/src/api/index.ts`:
```ts
verifyEmail: (data: { token: string }) =>
  api.post<{ message: string }>('/auth/verify-email', data),
```

Add the route to `apps/web/src/router.tsx`:
```ts
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage';

// In the root route children array, after the reset-password route:
{ path: 'verify-email', element: <VerifyEmailPage /> },
```

- [ ] **16. Verify** -- Register a new user, confirm the verification email arrives (check Mailpit at localhost:8025 in dev). Click the link and confirm `emailVerifiedAt` is set in the database. Attempt to create a recipe without verification and confirm the 403 response. Confirm the banner disappears after verification.

---

## N1 -- sessionStorage.redirect Script (Open Redirect Risk)

### Evidence

| Location | Finding |
|----------|---------|
| `apps/web/index.html:11-15` | Script reads `sessionStorage.redirect` and calls `history.replaceState(null, '', redirect)` with no URL validation |

Current code:
```html
<script>
  if (sessionStorage.redirect) {
    var redirect = sessionStorage.redirect;
    delete sessionStorage.redirect;
    history.replaceState(null, '', redirect);
  }
</script>
```

### Impact

If an attacker can set `sessionStorage.redirect` to an absolute URL (e.g., `https://evil.com/phish`) or a `javascript:` URI, the browser's address bar would display the malicious URL or potentially execute code. While `history.replaceState` cannot navigate to a different origin, it can set the URL bar to a confusing path. More importantly, this is an unnecessary risk with a trivial fix.

### Action Plan

- [ ] **1. Replace the script in `apps/web/index.html` with validated redirect**

```html
<script>
  if (sessionStorage.redirect) {
    var redirect = sessionStorage.redirect;
    delete sessionStorage.redirect;
    // Only allow relative paths starting with "/" (no protocol, no //, no scheme:)
    if (
      typeof redirect === 'string' &&
      redirect.charAt(0) === '/' &&
      redirect.charAt(1) !== '/' &&
      redirect.indexOf(':') === -1
    ) {
      history.replaceState(null, '', redirect);
    }
  }
</script>
```

This validation ensures:
- Must be a string
- Must start with `/` (relative path)
- Must NOT start with `//` (protocol-relative URL like `//evil.com`)
- Must NOT contain `:` (blocks `javascript:`, `data:`, `https:`, etc.)

- [ ] **2. Verify** -- Open browser console, set `sessionStorage.redirect = 'https://evil.com'`, reload, and confirm the redirect is NOT applied. Set `sessionStorage.redirect = '/recipes'`, reload, and confirm it IS applied.

---

## N5 -- authRateLimitMiddleware Uses In-Memory Map (Deno Deploy Issue)

### Evidence

| Location | Finding |
|----------|---------|
| `apps/api/src/middleware/rateLimit.ts:4` | `const loginAttempts = new Map<string, { count: number; resetAt: number }>()` |
| `apps/api/src/middleware/rateLimit.ts:57-87` | `authRateLimitMiddleware` reads/writes to this in-memory `Map` |
| Full codebase grep | `authRateLimitMiddleware` is never imported or used anywhere (dead code) |

### Impact

1. **Deno Deploy runs multiple isolates.** An in-memory `Map` is per-isolate. An attacker can brute-force login credentials by getting their requests routed to different isolates, each with its own separate counter.
2. The middleware is dead code -- auth routes have no rate limiting at all, making brute-force attacks trivially easy on login, register, and forgot-password endpoints.

### Action Plan

- [ ] **1. Rewrite `authRateLimitMiddleware` in `apps/api/src/middleware/rateLimit.ts`**

Remove the module-level `loginAttempts` Map and rewrite to use the `CacheProvider` singleton (backed by Deno KV in production, which is shared across isolates):

```ts
// apps/api/src/middleware/rateLimit.ts -- FULL REPLACEMENT

import type { Context, Next } from 'hono';
import { cacheProvider } from '../utils/cache/singleton.ts';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export function rateLimitMiddleware(options: {
  windowMs?: number;
  maxRequests?: number;
  keyPrefix?: string;
} = {}) {
  const windowMs = options.windowMs || 60_000;
  const maxRequests = options.maxRequests || 100;
  const keyPrefix = options.keyPrefix || 'rate-limit';

  return async (c: Context, next: Next) => {
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    const entry = await cacheProvider.get<RateLimitEntry>(['ratelimit', key]);
    const current = entry || { count: 0, resetAt: now + windowMs };

    if (now > current.resetAt) {
      current.count = 0;
      current.resetAt = now + windowMs;
    }

    current.count++;

    await cacheProvider.set(['ratelimit', key], current, { ttlMs: windowMs });

    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - current.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(current.resetAt / 1000)));

    if (current.count > maxRequests) {
      return c.json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests, please try again later',
        },
      }, 429);
    }

    await next();
  };
}

export function authRateLimitMiddleware(options: {
  windowMs?: number;
  maxAttempts?: number;
} = {}) {
  const windowMs = options.windowMs || 15 * 60_000; // 15 minutes
  const maxAttempts = options.maxAttempts || 5;

  return async (c: Context, next: Next) => {
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    const key = `auth-ratelimit:${ip}`;
    const now = Date.now();

    const entry = await cacheProvider.get<RateLimitEntry>(['ratelimit', key]);
    const current = entry || { count: 0, resetAt: now + windowMs };

    if (now > current.resetAt) {
      current.count = 0;
      current.resetAt = now + windowMs;
    }

    current.count++;

    await cacheProvider.set(['ratelimit', key], current, { ttlMs: windowMs });

    c.header('X-RateLimit-Limit', String(maxAttempts));
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxAttempts - current.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(current.resetAt / 1000)));

    if (current.count > maxAttempts) {
      return c.json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many login attempts, please try again later',
        },
      }, 429);
    }

    await next();
  };
}
```

**Key changes from the original:**
- Removed the `const loginAttempts = new Map<...>()` declaration entirely
- Both functions now use `cacheProvider` singleton (imported from `../utils/cache/singleton.ts`)
- `rateLimitMiddleware` no longer reads from `c.get('cache')` -- it uses the singleton directly, which avoids a timing issue (the global rate limiter runs before cache is injected via `c.set('cache', ...)`; this worked by accident because the cache singleton is initialized before request processing, but the explicit import is clearer)
- Removed the unused `CacheProvider` type import

- [ ] **2. Wire `authRateLimitMiddleware` to auth routes in `apps/api/src/modules/auth/index.ts`**

```ts
import { authRateLimitMiddleware } from '../../middleware/rateLimit.ts';

const authRateLimit = authRateLimitMiddleware({ windowMs: 15 * 60_000, maxAttempts: 5 });

// Apply to login (add as first middleware after the route path):
auth.post('/login', authRateLimit, describeRoute({ ... }), zValidator(...), async (c) => { ... });

// Apply to register:
auth.post('/register', authRateLimit, describeRoute({ ... }), zValidator(...), async (c) => { ... });

// Apply to forgot-password:
auth.post('/forgot-password', authRateLimit, describeRoute({ ... }), zValidator(...), async (c) => { ... });
```

- [ ] **3. Verify** -- Send 6 rapid POST requests to `/api/v1/auth/login` with wrong credentials:
```bash
for i in $(seq 1 6); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:8000/api/v1/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"test@test.com","password":"wrong"}'
done
```
Confirm the 6th returns HTTP 429. Check the `X-RateLimit-Remaining` header decrements correctly.

---

## Dependencies & Ordering

```
N1 (open redirect)          -- standalone, do first (5 min)
  |
C2 (error boundary)        -- standalone, can be done in parallel (1 hr)
  |
H13 (security headers)     -- standalone (30 min)
  |
N5 (rate limit rewrite)    -- must be done before H11 so auth routes are protected (1-2 hr)
  |
H11 (cookie auth)          -- largest change, touches backend + frontend (4-6 hr)
  |                           must be done before H12 since H12 modifies the same files
  v
H12 (email verification)   -- depends on H11 (cookie auth must be in place) (4-6 hr)
                              depends on N5 (auth rate limit should protect new endpoints)
```

**Recommended execution order:**

| Step | Issue | Est. Time | Why This Order |
|------|-------|-----------|----------------|
| 1 | N1 (open redirect) | 5 min | Smallest change, highest confidence. One-line fix in `index.html`. |
| 2 | C2 (error boundary) | 1 hr | Independent of backend. Frontend-only change. |
| 3 | H13 (security headers) | 30 min | One import + config block in `main.ts`. No other files touched. |
| 4 | N5 (rate limit rewrite) | 1-2 hr | Rewrite rate limiter before adding it to auth routes. |
| 5 | H11 (cookie auth) | 4-6 hr | Cookie migration. Touches `auth/index.ts`, `middleware/auth.ts`, `api/client.ts`, `AuthContext.tsx`, `api/index.ts`. |
| 6 | H12 (email verification) | 4-6 hr | Builds on H11 (cookie auth) and N5 (rate limiter for new endpoints). |

**Total estimated effort:** 12--16 hours of focused work across 3--4 days.
