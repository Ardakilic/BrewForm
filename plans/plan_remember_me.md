# "Remember Me" Feature — Implementation Plan

> **Related PR description:** [`pr_description.md`](pr_description.md) — to be created as the final step
> **Branch suggestion:** `feature/remember-me`

## Overview

Add a "Remember Me" checkbox to the login page. When checked, the user's refresh token is signed with a 6-month expiry (configurable via `JWT_REMEMBER_ME_EXPIRY`) instead of the default 7-day expiry (`JWT_REFRESH_EXPIRY`). This keeps the user logged in for an extended period without needing to re-authenticate.

**Design principle**: Stateless JWT approach — no DB changes, no server-side session tracking. The "remember me" checkbox simply controls which expiry value is used when signing the refresh token. The access token remains short-lived (15m) regardless.

**Default long-lived expiry**: `180d` (~6 months), configurable via `JWT_REMEMBER_ME_EXPIRY` environment variable.

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Stateless JWT** | No DB migration needed. No server-side session store. Works on Deno Deploy's edge infrastructure. |
| **Longer refresh token = "remember me"** | The refresh token already represents "session persistence". Extending its TTL is the natural stateless equivalent of "keep me logged in". |
| **New env var `JWT_REMEMBER_ME_EXPIRY`** | Configurable independently from `JWT_REFRESH_EXPIRY`. Default 180d. Supports `s/m/h/d/M` suffix format. |
| **`M` = 30 days** | New month suffix in `parseExpiry()`. Not a calendar month (variable), but a fixed 30-day period. |
| **`rememberMe` is optional with default `false`** | Backward-compatible. Existing clients that omit the field get the standard 7d refresh token. |
| **Refresh persistence** | The `rememberMe` intent is stored in localStorage (`brewform_remember_me`) so that token refreshes maintain the long-lived expiry. |
| **No cookie approach** | The app already uses localStorage for tokens. No HttpOnly cookie changes — consistent with existing architecture. |

---

## Architecture Flow

```mermaid
sequenceDiagram
    participant User
    participant LoginPage as LoginPage - React
    participant AuthCtx as AuthContext
    participant API as authLogin - Hono
    participant JWT as jwt.ts
    participant Env as env.ts
    participant LS as localStorage

    User->>LoginPage: Fill email + password + check Remember Me
    LoginPage->>AuthCtx: login email, password, rememberMe = true
    AuthCtx->>LS: setItem brewform_remember_me = true
    AuthCtx->>API: POST /auth/login {email, password, rememberMe: true}
    API->>JWT: signRefreshToken userId, JWT_REMEMBER_ME_EXPIRY
    JWT->>Env: read JWT_REMEMBER_ME_EXPIRY = 180d
    Env-->>JWT: 180d
    JWT-->>API: refreshToken exp = now + 180 days
    API-->>AuthCtx: {user, accessToken, refreshToken}
    AuthCtx->>LS: setItem brewform_refresh_token
    AuthCtx-->>LoginPage: login complete
    LoginPage->>User: Navigate to /

    Note over AuthCtx,LS: Later: token expires, auto-refresh
    AuthCtx->>LS: getItem brewform_remember_me = true
    AuthCtx->>API: POST /auth/refresh {refreshToken, rememberMe: true}
    API->>JWT: signRefreshToken userId, JWT_REMEMBER_ME_EXPIRY
    JWT-->>API: new refreshToken exp = now + 180 days
    API-->>AuthCtx: {accessToken, refreshToken}
```

---

## Task Breakdown

### Task 1: Config — Add `JWT_REMEMBER_ME_EXPIRY` environment variable

**Objective**: Add a new env var so the remember-me expiry is configurable independently from the standard refresh expiry.

#### 1a. Modify [`apps/api/src/config/env.ts`](apps/api/src/config/env.ts)

**Location**: After line 22 (`JWT_REFRESH_EXPIRY: z.string().default('7d'),`)

**Change**: Add one new field to the `envSchema` object:

```typescript
JWT_REMEMBER_ME_EXPIRY: z.string().default('180d'),
```

The full schema block (lines 20-22) should become:

```typescript
JWT_SECRET: z.string().min(16),
JWT_ACCESS_EXPIRY: z.string().default('15m'),
JWT_REFRESH_EXPIRY: z.string().default('7d'),
JWT_REMEMBER_ME_EXPIRY: z.string().default('180d'),
```

#### 1b. Modify [`apps/api/src/config/env.test.ts`](apps/api/src/config/env.test.ts)

**Location 1** — In the test-local `envSchema` definition (~line 15), add the same field:

```typescript
JWT_REMEMBER_ME_EXPIRY: z.string().default('180d'),
```

**Location 2** — Add a new `describe` block at the end of the file:

```typescript
describe('JWT_REMEMBER_ME_EXPIRY', () => {
  it('should default to 180d', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.JWT_REMEMBER_ME_EXPIRY).toBe('180d');
    }
  });

  it('should accept custom value', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
      JWT_REMEMBER_ME_EXPIRY: '365d',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.JWT_REMEMBER_ME_EXPIRY).toBe('365d');
    }
  });

  it('should accept month suffix M', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'a-very-long-secret-key-for-testing-12345',
      JWT_REMEMBER_ME_EXPIRY: '6M',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.JWT_REMEMBER_ME_EXPIRY).toBe('6M');
    }
  });
});
```

**Location 3** — In the existing test `'should apply defaults for optional fields'` (~line 35), add an assertion:

```typescript
expect(result.data.JWT_REMEMBER_ME_EXPIRY).toBe('180d');
```

#### 1c. Modify [`.env.example`](.env.example)

**Location**: After line 22 (`JWT_REFRESH_EXPIRY=7d`), insert:

```bash
# When "Remember Me" is checked on login, the refresh token uses this expiry.
# Default: 180d (~6 months). Supports s/m/h/d/M suffixes.
# M = 30 days (not calendar month).
JWT_REMEMBER_ME_EXPIRY=180d
```

#### 1d. Modify [`.env.prod.example`](.env.prod.example)

Same addition after the `JWT_REFRESH_EXPIRY` line.

---

### Task 2: JWT Module — Add `M` (month) suffix + custom expiry support

**Objective**: Extend `parseExpiry()` to support a month suffix (`M` = 30 days), and allow `signRefreshToken()` to accept an optional custom expiry string for remember-me sessions.

#### 2a. Modify [`apps/api/src/modules/auth/jwt.ts`](apps/api/src/modules/auth/jwt.ts)

**Change 1** — Add `config.JWT_REMEMBER_ME_EXPIRY` to the top-level imports (line 13 area). The config destructuring should read:

```typescript
const JWT_SECRET = config.JWT_SECRET;
const ACCESS_EXPIRY = config.JWT_ACCESS_EXPIRY;
const REFRESH_EXPIRY = config.JWT_REFRESH_EXPIRY;
const REMEMBER_ME_EXPIRY = config.JWT_REMEMBER_ME_EXPIRY;
```

**Change 2** — Update `parseExpiry()` regex from `[smhd]` to `[smhdM]` and add `case 'M'`:

```typescript
function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhdM])$/);
  if (!match) throw new Error(`Invalid expiry format: ${expiry}`);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    case 'M':
      return value * 30 * 86400; // 30 days per month
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }
}
```

**Change 3** — Update `signRefreshToken()` to accept optional `customExpiry`:

```typescript
/** Sign a new refresh token with subject only (no identity claims).
 *  When customExpiry is provided (e.g. for "remember me"), it overrides
 *  the default JWT_REFRESH_EXPIRY. */
export async function signRefreshToken(
  userId: string,
  customExpiry?: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expirySeconds = customExpiry ? parseExpiry(customExpiry) : parseExpiry(REFRESH_EXPIRY);
  const payload = {
    sub: userId,
    type: 'refresh' as const,
    iat: now,
    exp: now + expirySeconds,
  };
  return await sign(payload, JWT_SECRET);
}
```

#### 2b. Modify [`apps/api/src/modules/auth/jwt.test.ts`](apps/api/src/modules/auth/jwt.test.ts)

Add at the end of the file:

```typescript
describe('parseExpiry - M (month) suffix', () => {
  // parseExpiry is private, tested indirectly via signRefreshToken customExpiry
  it('should accept M suffix via signRefreshToken custom expiry', async () => {
    const token = await signRefreshToken('user-123', '6M');
    const decoded = await verifyJwt(token);
    expect(decoded.sub).toBe('user-123');
    expect(decoded.type).toBe('refresh');
    const now = Math.floor(Date.now() / 1000);
    const expectedExp = now + (6 * 30 * 86400); // 6 months
    expect(decoded.exp).toBeGreaterThan(now);
    expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 5);
  });
});

describe('signRefreshToken with custom expiry (remember me)', () => {
  it('should sign a refresh token with custom 180d expiry', async () => {
    const token = await signRefreshToken('user-123', '180d');
    const decoded = await verifyJwt(token);
    expect(decoded.sub).toBe('user-123');
    expect(decoded.type).toBe('refresh');
    const now = Math.floor(Date.now() / 1000);
    const expectedExp = now + (180 * 86400);
    expect(decoded.exp).toBeGreaterThan(now);
    expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 5);
  });

  it('should use default 7d expiry when no custom expiry provided', async () => {
    const token = await signRefreshToken('user-123');
    const decoded = await verifyJwt(token);
    const now = Math.floor(Date.now() / 1000);
    const expectedExp = now + (7 * 86400);
    expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 5);
  });

  it('should produce different expiries for different custom expiry values', async () => {
    const shortToken = await signRefreshToken('user-1', '1d');
    const longToken = await signRefreshToken('user-1', '365d');
    const shortDecoded = await verifyJwt(shortToken);
    const longDecoded = await verifyJwt(longToken);
    const now = Math.floor(Date.now() / 1000);
    const shortExp = shortDecoded.exp! - now;
    const longExp = longDecoded.exp! - now;
    expect(shortExp).toBeLessThan(longExp);
  });

  it('should reject invalid expiry format', async () => {
    try {
      await signRefreshToken('user-123', 'invalid');
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toContain('Invalid expiry format');
    }
  });
});
```

---

### Task 3: Auth Service — Accept `rememberMe` in `login()` and `refreshAccessToken()`

**Objective**: Pass the `rememberMe` flag through the service layer so JWT signing uses the correct expiry.

#### 3a. Modify [`apps/api/src/modules/auth/service.ts`](apps/api/src/modules/auth/service.ts)

**Change 1** — Update the `login()` function signature and refresh token creation:

```typescript
export async function login(email: string, password: string, rememberMe = false) {
  const rawUser = await model.findUserByEmail(email);
  if (!rawUser) {
    throw new Error('INVALID_CREDENTIALS');
  }
  const user = toAuthUser(rawUser);
  if (user.isBanned) {
    throw new Error('USER_BANNED');
  }

  const valid = model.verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const accessToken = await jwt.signAccessToken({
    id: user.id,
    email: user.email,
    username: user.username,
    isAdmin: user.isAdmin,
  });

  const refreshToken = rememberMe
    ? await jwt.signRefreshToken(user.id, config.JWT_REMEMBER_ME_EXPIRY)
    : await jwt.signRefreshToken(user.id);

  return { user, accessToken, refreshToken };
}
```

**Change 2** — Update `refreshAccessToken()` signature and new refresh token creation:

```typescript
export async function refreshAccessToken(refreshToken: string, rememberMe = false) {
  const payload = await jwt.verifyJwt(refreshToken);
  if (payload.type !== 'refresh') {
    throw new Error('INVALID_TOKEN_TYPE');
  }

  const rawUser = await model.findUserById(payload.sub);
  if (!rawUser) {
    throw new Error('USER_NOT_FOUND');
  }
  const user = toAuthUser(rawUser);
  if (user.isBanned) {
    throw new Error('USER_NOT_FOUND');
  }

  const newAccessToken = await jwt.signAccessToken({
    id: user.id,
    email: user.email,
    username: user.username,
    isAdmin: user.isAdmin,
  });

  const newRefreshToken = rememberMe
    ? await jwt.signRefreshToken(user.id, config.JWT_REMEMBER_ME_EXPIRY)
    : await jwt.signRefreshToken(user.id);

  return { user, accessToken: newAccessToken, refreshToken: newRefreshToken };
}
```

#### 3b. Modify [`apps/api/src/modules/auth/service.test.ts`](apps/api/src/modules/auth/service.test.ts)

Add after the `describe('Token refresh validation', ...)` block:

```typescript
describe('Remember Me login parameter', () => {
  it('should accept rememberMe = true without throwing', () => {
    const fn = async (_email: string, _password: string, _rememberMe?: boolean) => {
      throw new Error('INVALID_CREDENTIALS');
    };
    expect(fn).toBeDefined();
  });

  it('should accept rememberMe = false (explicit)', () => {
    const fn = async (_email: string, _password: string, _rememberMe = false) => {
      throw new Error('INVALID_CREDENTIALS');
    };
    expect(fn).toBeDefined();
  });
});

describe('Remember Me refresh parameter', () => {
  it('should accept rememberMe in refreshAccessToken signature', () => {
    const fn = async (_token: string, _rememberMe?: boolean) => {
      throw new Error('INVALID_TOKEN_TYPE');
    };
    expect(fn).toBeDefined();
  });
});
```

---

### Task 4: Auth Routes — Accept `rememberMe` in login and refresh endpoints

**Objective**: Pass the `rememberMe` field from the request body to the service layer.

#### 4a. Modify [`apps/api/src/modules/auth/index.ts`](apps/api/src/modules/auth/index.ts)

**Change 1** — `POST /auth/login` handler: pass `body.rememberMe` to service and update description:

```typescript
auth.post(
  '/login',
  describeRoute({
    tags: ['Auth'],
    summary: 'Log in with email and password',
    description: 'Returns access + refresh tokens on success. ' +
      'Set rememberMe to true for a long-lived refresh token (6 months by default).',
    responses: {
      200: { description: 'Login succeeded; tokens issued' },
      401: { description: 'Invalid credentials' },
      403: { description: 'Account banned' },
    },
  }),
  zValidator('json', AuthLoginSchema),
  async (c) => {
    const body = c.req.valid('json');
    try {
      const result = await authService.login(body.email, body.password, body.rememberMe);
      return success(c, {
        user: sanitizeUser(result.user),
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'INVALID_CREDENTIALS') {
        return error(c, 'INVALID_CREDENTIALS', 'Invalid email or password', 401);
      }
      if (message === 'USER_BANNED') {
        return error(c, 'USER_BANNED', 'This account has been banned', 403);
      }
      throw err;
    }
  },
);
```

**Change 2** — `POST /auth/refresh` handler: pass `body.rememberMe` to service and update description:

```typescript
auth.post(
  '/refresh',
  describeRoute({
    tags: ['Auth'],
    summary: 'Exchange a refresh token for a new access token',
    description: 'Exchange a refresh token for a new access token. ' +
      'Pass rememberMe: true to maintain the long-lived session.',
    responses: {
      200: { description: 'New access + refresh tokens issued' },
      401: { description: 'Refresh token invalid or expired' },
    },
  }),
  zValidator('json', AuthRefreshSchema),
  async (c) => {
    const body = c.req.valid('json');
    try {
      const result = await authService.refreshAccessToken(body.refreshToken, body.rememberMe);
      return success(c, {
        user: sanitizeUser(result.user),
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'INVALID_TOKEN_TYPE' || message === 'USER_NOT_FOUND') {
        return error(c, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token', 401);
      }
      throw err;
    }
  },
);
```

#### 4b. Modify [`apps/api/src/modules/auth/index.test.ts`](apps/api/src/modules/auth/index.test.ts)

Add at the end of the file:

```typescript
describe('POST /auth/login with rememberMe', () => {
  it('should accept rememberMe as optional boolean in request body', async () => {
    const app = createTestApp();
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123',
        rememberMe: true,
      }),
    });
    expect(res.status).toBe(401); // invalid creds but schema passes
  });

  it('should accept request without rememberMe field', async () => {
    const app = createTestApp();
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123',
      }),
    });
    expect(res.status).toBe(401);
  });

  it('should return 400 when rememberMe is not a boolean', async () => {
    const app = createTestApp();
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123',
        rememberMe: 'yes',
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/refresh with rememberMe', () => {
  it('should accept rememberMe in refresh request body', async () => {
    const app = createTestApp();
    const res = await app.request('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: 'some-fake-token',
        rememberMe: true,
      }),
    });
    expect(res.status).toBe(401); // invalid token but schema passes
  });

  it('should accept refresh request without rememberMe', async () => {
    const app = createTestApp();
    const res = await app.request('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: 'some-fake-token',
      }),
    });
    expect(res.status).toBe(401);
  });
});
```

---

### Task 5: Shared Schema — Add `rememberMe` to both `AuthLoginSchema` and `AuthRefreshSchema`

**Objective**: Extend Zod validation schemas so `rememberMe` is accepted and validated.

#### 5a. Modify [`packages/shared/src/schemas/auth.ts`](packages/shared/src/schemas/auth.ts)

```typescript
export const AuthLoginSchema = z.object({
  email: z.email(),
  password: z.string(),
  rememberMe: z.boolean().optional().default(false),
});

export const AuthRefreshSchema = z.object({
  refreshToken: z.string(),
  rememberMe: z.boolean().optional().default(false),
});
```

#### 5b. Modify [`packages/shared/src/schemas/auth.test.ts`](packages/shared/src/schemas/auth.test.ts)

Add after the existing `AuthLoginSchema` describe block:

```typescript
describe('AuthLoginSchema with rememberMe', () => {
  it('should accept rememberMe: true', () => {
    const result = AuthLoginSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      rememberMe: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rememberMe).toBe(true);
    }
  });

  it('should accept rememberMe: false (explicit)', () => {
    const result = AuthLoginSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      rememberMe: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rememberMe).toBe(false);
    }
  });

  it('should default rememberMe to false when omitted', () => {
    const result = AuthLoginSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rememberMe).toBe(false);
    }
  });

  it('should reject non-boolean rememberMe', () => {
    const result = AuthLoginSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      rememberMe: 'yes',
    });
    expect(result.success).toBe(false);
  });

  it('should reject rememberMe as number', () => {
    const result = AuthLoginSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      rememberMe: 1,
    });
    expect(result.success).toBe(false);
  });
});
```

Add after the existing `AuthRefreshSchema` describe block:

```typescript
describe('AuthRefreshSchema with rememberMe', () => {
  it('should accept rememberMe: true', () => {
    const result = AuthRefreshSchema.safeParse({
      refreshToken: 'some-token',
      rememberMe: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rememberMe).toBe(true);
    }
  });

  it('should default rememberMe to false when omitted', () => {
    const result = AuthRefreshSchema.safeParse({
      refreshToken: 'some-token',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rememberMe).toBe(false);
    }
  });

  it('should reject non-boolean rememberMe', () => {
    const result = AuthRefreshSchema.safeParse({
      refreshToken: 'some-token',
      rememberMe: 'true',
    });
    expect(result.success).toBe(false);
  });
});
```

---

### Task 6: Frontend API Layer — Accept `rememberMe` in login and refresh

**Objective**: Update the frontend API client TypeScript types and the auto-refresh logic.

#### 6a. Modify [`apps/web/src/api/index.ts`](apps/web/src/api/index.ts)

Update the `login` and `refresh` method type signatures:

```typescript
login: (data: { email: string; password: string; rememberMe?: boolean }) =>
  api.post<{ user: AuthUser; accessToken: string; refreshToken: string }>('/auth/login', data),
refresh: (data: { refreshToken: string; rememberMe?: boolean }) =>
  api.post<{ user: AuthUser; accessToken: string; refreshToken: string }>('/auth/refresh', data),
```

#### 6b. Modify [`apps/web/src/api/client.ts`](apps/web/src/api/client.ts)

**Change 1** — Update `refreshAccessToken()` to read and pass `rememberMe`:

```typescript
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('brewform_refresh_token');
  if (!refreshToken) return null;

  const rememberMe = localStorage.getItem('brewform_remember_me') === 'true';

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken, rememberMe }),
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
```

**Change 2** — Update `clearTokens()` to also clear `brewform_remember_me`:

```typescript
export function clearTokens() {
  accessToken = null;
  localStorage.removeItem('brewform_access_token');
  localStorage.removeItem('brewform_refresh_token');
  localStorage.removeItem('brewform_remember_me');
}
```

---

### Task 7: AuthContext — Store and pass `rememberMe` through login flow

**Objective**: Store the `rememberMe` intent in localStorage during login, and clear on logout.

#### 7a. Modify [`apps/web/src/contexts/AuthContext.tsx`](apps/web/src/contexts/AuthContext.tsx)

**Change 1** — Update the `AuthContextType` interface (line 18):

```typescript
login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
```

**Change 2** — Update the `login()` function:

```typescript
async function login(email: string, password: string, rememberMe = false) {
  if (rememberMe) {
    localStorage.setItem('brewform_remember_me', 'true');
  }
  const response = await authApi.login({ email, password, rememberMe });
  setAccessToken(response.accessToken);
  localStorage.setItem('brewform_refresh_token', response.refreshToken);
  setUser(response.user);
}
```

**Change 3** — `logout()` already calls `clearTokens()` which now clears `brewform_remember_me` too. No change needed to `logout()` itself.

> **Note**: All existing test files that mock `useAuth` with `login: vi.fn()` continue to work because the new parameter is optional with a default value.

---

### Task 8: LoginPage — Add "Remember Me" checkbox + comprehensive test file

**Objective**: Add the UI checkbox to the login form and create a thorough test suite.

#### 8a. Modify [`apps/web/src/pages/auth/LoginPage.tsx`](apps/web/src/pages/auth/LoginPage.tsx)

Full updated file:

```typescript
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../contexts/I18nContext';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, rememberMe);
      navigate('/');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('auth.login.title');
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='mx-auto max-w-md px-6 py-12'>
      <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
        {t('auth.login.title')}
      </h1>
      {error && (
        <div
          className='mt-4 rounded p-3 text-sm'
          style={{ backgroundColor: 'var(--error)', color: 'white' }}
        >
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className='mt-6 flex flex-col gap-4'>
        <div>
          <label
            className='mb-1 block text-sm font-medium'
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('auth.email')}
          </label>
          <input
            type='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder='you@example.com'
            className='input-field'
            required
          />
        </div>
        <div>
          <label
            className='mb-1 block text-sm font-medium'
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('auth.password')}
          </label>
          <input
            type='password'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder='Enter your password'
            className='input-field'
            required
          />
        </div>
        <div className='flex items-center gap-2'>
          <input
            type='checkbox'
            id='rememberMe'
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className='h-4 w-4 cursor-pointer'
            style={{ accentColor: 'var(--accent-primary)' }}
          />
          <label
            htmlFor='rememberMe'
            className='text-sm cursor-pointer select-none'
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('auth.login.rememberMe')}
          </label>
        </div>
        <button type='submit' className='btn-primary' disabled={loading}>
          {loading ? t('auth.login.loggingIn') : t('auth.login.title')}
        </button>
      </form>
      <p className='mt-4 text-sm' style={{ color: 'var(--text-secondary)' }}>
        <Link to='/forgot-password' style={{ color: 'var(--accent-primary)' }}>
          {t('auth.login.forgotPassword')}
        </Link>
      </p>
      <p className='mt-2 text-sm' style={{ color: 'var(--text-secondary)' }}>
        {t('auth.login.noAccount')}{' '}
        <Link to='/register' style={{ color: 'var(--accent-primary)' }}>
          {t('auth.login.signUp')}
        </Link>
      </p>
    </div>
  );
}
```

#### 8b. CREATE [`apps/web/src/pages/auth/LoginPage.test.tsx`](apps/web/src/pages/auth/LoginPage.test.tsx)

**This is a new file.** Create it with the following comprehensive test suite:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { LoginPage } from './LoginPage';
import { AuthProvider } from '../../contexts/AuthContext';
import { I18nProvider } from '../../contexts/I18nContext';

// Mock the API module
vi.mock('../../api/index', () => ({
  authApi: {
    login: vi.fn(),
    registrationStatus: vi.fn().mockResolvedValue({ enabled: true }),
  },
  userApi: {
    me: vi.fn().mockRejectedValue(new Error('Not authenticated')),
  },
  clearTokens: vi.fn(),
  getAccessToken: vi.fn().mockReturnValue(null),
  setAccessToken: vi.fn(),
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  },
  ApiError: class extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

import { authApi } from '../../api/index';

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  // ── Rendering ──

  it('should render the login form with email, password, and submit button', () => {
    renderLoginPage();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  it('should render the remember me checkbox unchecked by default', () => {
    renderLoginPage();
    const checkbox = screen.getByRole('checkbox', { name: /remember me/i });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it('should render forgot password link', () => {
    renderLoginPage();
    expect(screen.getByText(/forgot password\?/i)).toBeInTheDocument();
  });

  it('should render sign up link', () => {
    renderLoginPage();
    expect(screen.getByText(/sign up/i)).toBeInTheDocument();
  });

  // ── Checkbox toggle ──

  it('should toggle remember me checkbox on click', async () => {
    renderLoginPage();
    const checkbox = screen.getByRole('checkbox', { name: /remember me/i });
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it('should toggle checkbox via label click', async () => {
    renderLoginPage();
    const label = screen.getByText(/remember me/i);
    const checkbox = screen.getByRole('checkbox', { name: /remember me/i });
    await userEvent.click(label);
    expect(checkbox).toBeChecked();
  });

  // ── Form submission — rememberMe: true ──

  it('should call login with rememberMe: true when checkbox is checked', async () => {
    const loginMock = vi.mocked(authApi.login).mockResolvedValue({
      user: {
        id: '1', email: 'test@test.com', username: 'testuser',
        displayName: null, avatarUrl: null, isAdmin: false, onboardingCompleted: false,
      },
      accessToken: 'access-token-xxx',
      refreshToken: 'refresh-token-xxx',
    });

    renderLoginPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'test@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('checkbox', { name: /remember me/i }));
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({
        email: 'test@test.com',
        password: 'password123',
        rememberMe: true,
      });
    });
  });

  it('should store brewform_remember_me in localStorage when rememberMe is true', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      user: {
        id: '1', email: 'test@test.com', username: 'testuser',
        displayName: null, avatarUrl: null, isAdmin: false, onboardingCompleted: false,
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    renderLoginPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'test@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('checkbox', { name: /remember me/i }));
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(localStorage.getItem('brewform_remember_me')).toBe('true');
    });
  });

  // ── Form submission — rememberMe: false (default) ──

  it('should call login with rememberMe: false when checkbox is not checked', async () => {
    const loginMock = vi.mocked(authApi.login).mockResolvedValue({
      user: {
        id: '2', email: 'other@test.com', username: 'other',
        displayName: null, avatarUrl: null, isAdmin: false, onboardingCompleted: false,
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    renderLoginPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'other@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password456');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({
        email: 'other@test.com',
        password: 'password456',
        rememberMe: false,
      });
    });
  });

  it('should NOT store brewform_remember_me when checkbox is unchecked', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      user: {
        id: '2', email: 'other@test.com', username: 'other',
        displayName: null, avatarUrl: null, isAdmin: false, onboardingCompleted: false,
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    renderLoginPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'other@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password456');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(localStorage.getItem('brewform_remember_me')).toBeNull();
    });
  });

  // ── Error handling ──

  it('should display error message on login failure', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new Error('Invalid email or password'));
    renderLoginPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'bad@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
    });
  });

  // ── Loading state ──

  it('should disable button and show loading text while logging in', async () => {
    let resolveLogin: (value: unknown) => void;
    const loginPromise = new Promise((resolve) => { resolveLogin = resolve; });
    vi.mocked(authApi.login).mockReturnValue(loginPromise as Promise<unknown>);

    renderLoginPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'test@test.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(screen.getByRole('button', { name: /logging in/i })).toBeDisabled();

    resolveLogin!({
      user: {
        id: '1', email: 'test@test.com', username: 'testuser',
        displayName: null, avatarUrl: null, isAdmin: false, onboardingCompleted: false,
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
  });

  // ── Form validation ──

  it('should require email field', () => {
    renderLoginPage();
    expect(screen.getByLabelText(/email/i)).toBeRequired();
  });

  it('should require password field', () => {
    renderLoginPage();
    expect(screen.getByLabelText(/password/i)).toBeRequired();
  });
});
```

---

### Task 9: Internationalization — Add translation keys

**Objective**: Add translations for the "Remember me" label in both supported languages.

#### 9a. Modify [`packages/shared/src/i18n/en.json`](packages/shared/src/i18n/en.json)

After the existing `"auth.login.signUp": "Sign up"` key, add:

```json
"auth.login.rememberMe": "Remember me",
```

#### 9b. Modify [`packages/shared/src/i18n/tr.json`](packages/shared/src/i18n/tr.json)

After the existing `"auth.login.signUp": "Kayıt ol"` key, add:

```json
"auth.login.rememberMe": "Beni hatırla",
```

---

### Task 10: Documentation — Update `docs/auth.md` and `docs/api.md`

**Objective**: Document the new `rememberMe` field, the `JWT_REMEMBER_ME_EXPIRY` env var, and updated API request/response examples.

#### 10a. Modify [`docs/auth.md`](docs/auth.md)

**Change 1** — Update the "Token Strategy" table (lines 7-10):

```
| Token                        | Expiry               | Storage      | Purpose                                     |
| ---------------------------- | -------------------- | ------------ | ------------------------------------------- |
| Access Token                 | 15 minutes           | Memory       | Authorize API requests                      |
| Refresh Token                | 7 days               | localStorage | Obtain new access tokens                    |
| Refresh Token (Remember Me)  | 180 days (config)    | localStorage | Long-lived session when checkbox is checked |
```

**Change 2** — Update the "Login" request example (around line 90-95) to show `rememberMe`:

```markdown
To request a long-lived session:

```json
{ "email": "user@example.com", "password": "securepassword", "rememberMe": true }
```

When `rememberMe` is `true`, the refresh token is signed with `JWT_REMEMBER_ME_EXPIRY` (default:
`180d` ≈ 6 months) instead of the standard `JWT_REFRESH_EXPIRY` (default: `7d`).
```

**Change 3** — Add a new "Remember Me" section after the "Login" section:

```markdown
## Remember Me

The login and refresh endpoints accept an optional `rememberMe` boolean field to request a
long-lived refresh token.

### Behavior

| `rememberMe`       | Refresh Token Expiry Used                 | Session Duration         |
| ------------------ | ----------------------------------------- | ------------------------ |
| `true`             | `JWT_REMEMBER_ME_EXPIRY` (default 180d)   | ~6 months                |
| `false` / omitted  | `JWT_REFRESH_EXPIRY` (default 7d)         | 7 days                   |

### Persistence Across Refreshes

The frontend stores a `brewform_remember_me` flag in localStorage. When present:
- The flag is sent with every `POST /auth/refresh` call
- Each token refresh issues a new long-lived refresh token
- Logging out clears the flag

### Access Token

The access token expiry (`15m`) is **unaffected** by the `rememberMe` setting. Access tokens
remain short-lived for security regardless of session duration.

### Security Considerations

- The same HS256 JWT signing key is used for all tokens
- Token rotation works identically: each refresh returns a new access + refresh token pair
- No server-side session state is maintained (stateless JWT)
- A compromised token remains valid until its natural expiry (no revocation)
```

**Change 4** — Update the "Environment Configuration" table to add the new var:

```markdown
| `JWT_REMEMBER_ME_EXPIRY` | `180d` | Refresh token expiry when `rememberMe` is `true`. Supports s/m/h/d/M suffixes. M = 30 days. |
```

#### 10b. Modify [`docs/api.md`](docs/api.md)

**Change 1** — Update the `POST /auth/login` request documentation (around line 107-124) to include `rememberMe`:

```markdown
### POST /auth/login

Request body:

```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "rememberMe": false
}
```

| Field          | Type    | Required | Default | Description                                              |
| -------------- | ------- | -------- | ------- | -------------------------------------------------------- |
| `email`        | string  | yes      | —       | User's email address                                     |
| `password`     | string  | yes      | —       | User's password                                          |
| `rememberMe`   | boolean | no       | `false` | Request long-lived refresh token (180d by default)       |

Response `200`:

```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "email": "...", "username": "..." },
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```
```

**Change 2** — Add the `POST /auth/refresh` endpoint documentation (currently missing from api.md). Insert after the login section:

```markdown
### POST /auth/refresh

Request body:

```json
{
  "refreshToken": "...",
  "rememberMe": false
}
```

| Field          | Type    | Required | Default | Description                                              |
| -------------- | ------- | -------- | ------- | -------------------------------------------------------- |
| `refreshToken` | string  | yes      | —       | Current refresh token                                    |
| `rememberMe`   | boolean | no       | `false` | Maintain long-lived session if previously set            |

Response `200`:

```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "email": "...", "username": "..." },
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

Response `401` (invalid or expired refresh token):

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REFRESH_TOKEN",
    "message": "Invalid or expired refresh token",
    "requestId": "req_abc123"
  }
}
```
```

---

### Task 11: Create `pr_description.md` — Pull request description

**Objective**: Create a PR description file at the root of the project summarizing all changes.

#### CREATE (overwrite) [`pr_description.md`](pr_description.md)

```markdown
# PR: Remember Me — Long-Lived Sessions

> **Status:** Ready for review
> **Related plan:** [`plans/plan_remember_me.md`](plans/plan_remember_me.md)
> **Feature:** `remember-me-checkbox`

---

## Summary

Adds a "Remember Me" checkbox to the login page. When checked, the user's refresh token is signed
with a configurable 6-month expiry (`JWT_REMEMBER_ME_EXPIRY`, default `180d`) instead of the
standard 7-day expiry. The `rememberMe` intent persists across token refreshes so the user stays
logged in for the full duration.

This is a **stateless JWT approach** — no database changes, no server-side session store required.

## What Changed

### Shared Package (`packages/shared`)

| Change | File |
|--------|------|
| Added `rememberMe: z.boolean().optional().default(false)` to `AuthLoginSchema` | `src/schemas/auth.ts` |
| Added `rememberMe: z.boolean().optional().default(false)` to `AuthRefreshSchema` | `src/schemas/auth.ts` |
| Added schema validation tests for `rememberMe` in both schemas | `src/schemas/auth.test.ts` |
| Added `auth.login.rememberMe` translation key — English | `src/i18n/en.json` |
| Added `auth.login.rememberMe` translation key — Turkish | `src/i18n/tr.json` |

### Backend — Config (`apps/api/src/config/`)

| Change | File |
|--------|------|
| Added `JWT_REMEMBER_ME_EXPIRY` env var with default `180d` | `env.ts` |
| Added test cases for new env var (default, custom, M suffix) | `env.test.ts` |

### Backend — Auth Module (`apps/api/src/modules/auth/`)

| Change | File |
|--------|------|
| Added `M` (month = 30 days) suffix support to `parseExpiry()` | `jwt.ts` |
| Added optional `customExpiry` parameter to `signRefreshToken()` | `jwt.ts` |
| Added tests for custom expiry, M suffix, default expiry, invalid format | `jwt.test.ts` |
| Added `rememberMe` parameter to `login()` — uses `JWT_REMEMBER_ME_EXPIRY` when true | `service.ts` |
| Added `rememberMe` parameter to `refreshAccessToken()` — persists long-lived session | `service.ts` |
| Added remember-me parameter tests | `service.test.ts` |
| Updated `POST /auth/login` to pass `body.rememberMe` to service | `index.ts` |
| Updated `POST /auth/refresh` to pass `body.rememberMe` to service | `index.ts` |
| Updated `describeRoute` descriptions for both endpoints | `index.ts` |
| Added integration tests for login/refresh with rememberMe | `index.test.ts` |

### Frontend — API Layer (`apps/web/src/api/`)

| Change | File |
|--------|------|
| Updated `login()` type signature with `rememberMe?: boolean` | `index.ts` |
| Updated `refresh()` type signature with `rememberMe?: boolean` | `index.ts` |
| Updated `refreshAccessToken()` to read `brewform_remember_me` from localStorage and pass to API | `client.ts` |
| Updated `clearTokens()` to also clear `brewform_remember_me` | `client.ts` |

### Frontend — AuthContext (`apps/web/src/contexts/`)

| Change | File |
|--------|------|
| Updated `login()` to accept and pass `rememberMe`, store flag in localStorage | `AuthContext.tsx` |
| Updated `AuthContextType` interface with new `rememberMe` parameter | `AuthContext.tsx` |

### Frontend — LoginPage (`apps/web/src/pages/auth/`)

| Change | File |
|--------|------|
| Added "Remember me" checkbox with toggle state | `LoginPage.tsx` |
| Passes `rememberMe` state to `login()` on form submission | `LoginPage.tsx` |
| **New** comprehensive test suite (12+ test cases) | `LoginPage.test.tsx` |

### Environment Files

| Change | File |
|--------|------|
| Added `JWT_REMEMBER_ME_EXPIRY=180d` with documentation comment | `.env.example` |
| Added `JWT_REMEMBER_ME_EXPIRY=180d` with documentation comment | `.env.prod.example` |

### Documentation

| Change | File |
|--------|------|
| Updated "Token Strategy" table with Remember Me row | `docs/auth.md` |
| Added "Remember Me" section covering behavior, persistence, security | `docs/auth.md` |
| Updated "Login" section with `rememberMe` request example | `docs/auth.md` |
| Updated "Environment Configuration" table with `JWT_REMEMBER_ME_EXPIRY` | `docs/auth.md` |
| Updated `POST /auth/login` with `rememberMe` field documentation | `docs/api.md` |
| Added `POST /auth/refresh` endpoint documentation with `rememberMe` field | `docs/api.md` |

---

## Key Design Decisions

- **Stateless JWT** — No database migration. No server-side session store. Compatible with Deno Deploy.
- **Longer refresh token = "remember me"** — The refresh token already represents session persistence.
- **`M` suffix = 30 days** — Not a calendar month, but a fixed 30-day period. Prevents ambiguity.
- **`rememberMe` is optional, defaults to `false`** — Fully backward-compatible.
- **Refresh persistence via localStorage** — `brewform_remember_me` flag stored alongside tokens.
- **Logout clears everything** — `clearTokens()` removes all three localStorage keys.
- **Access token unchanged** — Always 15 minutes regardless of `rememberMe`.

## How to Test

```bash
# Full test suite
make test

# Specific test files
deno task test:api --filter=apps/api/src/config/env.test.ts
deno task test:api --filter=apps/api/src/modules/auth/jwt.test.ts
deno task test:api --filter=apps/api/src/modules/auth/service.test.ts
deno task test:api --filter=apps/api/src/modules/auth/index.test.ts
deno task test:shared --filter=packages/shared/src/schemas/auth.test.ts
cd apps/web && deno task test -- --filter=LoginPage.test.tsx

# Type check
deno task check

# Lint
deno task lint
```

## Manual Testing

1. Start the dev server: `make dev`
2. Navigate to `/login`
3. Verify "Remember me" checkbox appears unchecked
4. Fill in credentials, check "Remember me", submit
5. Open DevTools → Application → Local Storage
6. Verify `brewform_refresh_token`, `brewform_access_token`, and `brewform_remember_me: "true"` are present
7. Wait for access token to expire, navigate to a protected page — verify auto-refresh works
8. Log out — verify all three localStorage keys are removed

## Review Checklist

- [ ] `JWT_REMEMBER_ME_EXPIRY` added to `envSchema` with default `180d`
- [ ] `parseExpiry()` supports `M` (month = 30 days) suffix
- [ ] `signRefreshToken()` accepts optional `customExpiry` parameter
- [ ] `login()` service accepts and uses `rememberMe` parameter
- [ ] `refreshAccessToken()` service accepts and uses `rememberMe` parameter
- [ ] `AuthLoginSchema` and `AuthRefreshSchema` include `rememberMe: z.boolean().optional().default(false)`
- [ ] Login route passes `body.rememberMe` to service
- [ ] Refresh route passes `body.rememberMe` to service
- [ ] Frontend `api/index.ts` login and refresh types include `rememberMe?`
- [ ] Frontend `client.ts` refresh function reads `brewform_remember_me` from localStorage
- [ ] `clearTokens()` clears `brewform_remember_me`
- [ ] `AuthContext.login()` stores `brewform_remember_me` in localStorage when true
- [ ] `LoginPage.tsx` renders checkbox, toggles state, passes to `login()`
- [ ] `LoginPage.test.tsx` exists with tests for rendering, toggle, submission, error, loading
- [ ] i18n keys added for `en` and `tr` locales
- [ ] `.env.example` and `.env.prod.example` include `JWT_REMEMBER_ME_EXPIRY`
- [ ] `docs/auth.md` updated with Remember Me section, env table, login examples
- [ ] `docs/api.md` updated with `rememberMe` field documentation for login and refresh
- [ ] All existing tests pass (`deno task test`)
- [ ] Type check passes (`deno task check`)
- [ ] Lint passes (`deno task lint`)
- [ ] No secrets or PII logged
- [ ] Backward-compatible (omitting `rememberMe` works identically to before)
```

---

## Complete Files Summary (22 files)

| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | [`apps/api/src/config/env.ts`](apps/api/src/config/env.ts) | **Modify** | Add `JWT_REMEMBER_ME_EXPIRY: z.string().default('180d')` to envSchema |
| 2 | [`apps/api/src/config/env.test.ts`](apps/api/src/config/env.test.ts) | **Modify** | Add `JWT_REMEMBER_ME_EXPIRY` to test schema + 3 test cases + default assertion |
| 3 | [`apps/api/src/modules/auth/jwt.ts`](apps/api/src/modules/auth/jwt.ts) | **Modify** | Add `M` suffix to parseExpiry(); add `customExpiry` param to `signRefreshToken()`; add `REMEMBER_ME_EXPIRY` constant |
| 4 | [`apps/api/src/modules/auth/jwt.test.ts`](apps/api/src/modules/auth/jwt.test.ts) | **Modify** | Add 2 new describe blocks: M suffix tests + custom expiry tests (6 test cases) |
| 5 | [`apps/api/src/modules/auth/service.ts`](apps/api/src/modules/auth/service.ts) | **Modify** | Add `rememberMe` param to `login()` and `refreshAccessToken()`, use `JWT_REMEMBER_ME_EXPIRY` when true |
| 6 | [`apps/api/src/modules/auth/service.test.ts`](apps/api/src/modules/auth/service.test.ts) | **Modify** | Add 2 new describe blocks for remember-me login and refresh params |
| 7 | [`apps/api/src/modules/auth/index.ts`](apps/api/src/modules/auth/index.ts) | **Modify** | Pass `body.rememberMe` to service in login + refresh routes; update describeRoute descriptions |
| 8 | [`apps/api/src/modules/auth/index.test.ts`](apps/api/src/modules/auth/index.test.ts) | **Modify** | Add integration tests for login/refresh with rememberMe (5 test cases) |
| 9 | [`packages/shared/src/schemas/auth.ts`](packages/shared/src/schemas/auth.ts) | **Modify** | Add `rememberMe: z.boolean().optional().default(false)` to both `AuthLoginSchema` and `AuthRefreshSchema` |
| 10 | [`packages/shared/src/schemas/auth.test.ts`](packages/shared/src/schemas/auth.test.ts) | **Modify** | Add tests for `AuthLoginSchema` (5 cases) and `AuthRefreshSchema` (3 cases) with rememberMe |
| 11 | [`apps/web/src/api/index.ts`](apps/web/src/api/index.ts) | **Modify** | Add `rememberMe?: boolean` to `login()` and `refresh()` type signatures |
| 12 | [`apps/web/src/api/client.ts`](apps/web/src/api/client.ts) | **Modify** | Read `brewform_remember_me` from localStorage in `refreshAccessToken()`; clear it in `clearTokens()` |
| 13 | [`apps/web/src/contexts/AuthContext.tsx`](apps/web/src/contexts/AuthContext.tsx) | **Modify** | Accept `rememberMe` in `login()`, store flag in localStorage, update interface type |
| 14 | [`apps/web/src/pages/auth/LoginPage.tsx`](apps/web/src/pages/auth/LoginPage.tsx) | **Modify** | Add `rememberMe` state, checkbox UI, pass to `login()` |
| 15 | [`apps/web/src/pages/auth/LoginPage.test.tsx`](apps/web/src/pages/auth/LoginPage.test.tsx) | **Create** | New comprehensive test file (12+ test cases) |
| 16 | [`packages/shared/src/i18n/en.json`](packages/shared/src/i18n/en.json) | **Modify** | Add `"auth.login.rememberMe": "Remember me"` |
| 17 | [`packages/shared/src/i18n/tr.json`](packages/shared/src/i18n/tr.json) | **Modify** | Add `"auth.login.rememberMe": "Beni hatırla"` |
| 18 | [`.env.example`](.env.example) | **Modify** | Add `JWT_REMEMBER_ME_EXPIRY=180d` with documentation |
| 19 | [`.env.prod.example`](.env.prod.example) | **Modify** | Add `JWT_REMEMBER_ME_EXPIRY=180d` with documentation |
| 20 | [`docs/auth.md`](docs/auth.md) | **Modify** | Update token strategy table, add Remember Me section, update env table, update login examples |
| 21 | [`docs/api.md`](docs/api.md) | **Modify** | Add `rememberMe` field docs to `POST /auth/login` + `POST /auth/refresh`, add refresh endpoint docs |
| 22 | [`pr_description.md`](pr_description.md) | **Create** | Pull request description summarizing all changes, design decisions, test plan, review checklist |

---

## Execution Order (Dependency Graph)

```mermaid
graph TD
    A[Task 9: i18n keys] --> H[Task 8: LoginPage]
    B[Task 5: Shared schemas] --> E[Task 4: Auth routes]
    C[Task 1: Config + env files] --> D[Task 2: JWT module]
    D --> F[Task 3: Auth service]
    F --> E
    B --> E
    E --> G[Task 10: Documentation]
    F --> G
    D --> G
    C --> G
    A --> G
    H --> G
    I[Task 6: Frontend API layer] --> J[Task 7: AuthContext]
    J --> H
    B --> I
    G --> K[Task 11: Create pr_description.md]

    style A fill:#a5d6a7
    style B fill:#a5d6a7
    style C fill:#a5d6a7
    style I fill:#a5d6a7
```

**Phase 1 — No dependencies** (can run in parallel):
- Task 1: Config + env files
- Task 5: Shared schemas
- Task 9: i18n keys
- Task 6: Frontend API layer

**Phase 2** — Depends on Phase 1:
- Task 2: JWT module (depends on config)
- Task 7: AuthContext (depends on API layer)

**Phase 3** — Depends on Phase 2:
- Task 3: Auth service (depends on JWT module)
- Task 8: LoginPage (depends on AuthContext + i18n)

**Phase 4** — Depends on Phase 3:
- Task 4: Auth routes (depends on service + shared schemas)

**Phase 5** — Final:
- Task 10: Documentation (depends on all implementation)
- Task 11: Create `pr_description.md` (depends on documentation)

---

## Edge Cases & Considerations

### 1. Token Refresh Persistence

**Problem**: `refreshAccessToken()` always called `jwt.signRefreshToken(user.id)` with the default expiry, downgrading a "remember me" session to 7 days after the first refresh.

**Solution**: 
- Frontend stores `brewform_remember_me` flag in localStorage during login
- `client.ts` reads this flag and passes `rememberMe` on every `POST /auth/refresh`
- Backend `refreshAccessToken()` accepts `rememberMe` and uses the appropriate expiry
- `clearTokens()` clears the flag on logout

### 2. Multiple Browser Tabs

The localStorage-based flag approach works across tabs naturally. All tabs share the same localStorage.

### 3. Token Rotation Security

Even with remember-me, each token refresh rotates both access and refresh tokens. This is the same security model as the standard refresh flow. A compromised token is valid until its natural expiry.

### 4. Backward Compatibility

- `rememberMe` is optional with a default of `false` at every layer (Zod schema, service function params, API types)
- Existing clients that omit the field get the standard 7-day refresh token
- Existing tests that mock `login` with `vi.fn()` continue to work unchanged

### 5. The `M` Suffix Semantics

`M` = 30 days (not calendar month). This avoids ambiguity with months of 28, 29, 30, or 31 days. If a user passes `6M`, they get 180 days.

### 6. Deno Deploy Compatibility

All changes are stateless (no DB, no KV store, no file system writes). The implementation works identically on Deno Deploy's edge infrastructure as it does locally.