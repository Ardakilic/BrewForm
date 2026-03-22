/**
 * Mock for src/middleware/auth.ts
 * Redirected via import_map.json during deno test runs.
 */

import { mockFn } from '../mock-fn.ts';

let _mockUser = {
  id: 'user_123',
  email: 'test@example.com',
  username: 'testuser',
  displayName: 'Test User',
  isAdmin: false,
  isBanned: false,
};

let _checkHeader = false;
const VALID_TEST_TOKEN = 'valid_token';

export function setMockUser(user: typeof _mockUser): void {
  _mockUser = user;
}

export function setCheckHeaderMode(enabled: boolean): void {
  _checkHeader = enabled;
}

// deno-lint-ignore no-explicit-any
export const authMiddleware = mockFn((...args: unknown[]) => {
  const c = args[0] as any;
  const next = args[1] as () => Promise<void>;
  if (_checkHeader && c.req?.header) {
    const authHeader: string | undefined = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      c.set('user', token === VALID_TEST_TOKEN ? _mockUser : null);
    } else {
      c.set('user', null);
    }
  } else {
    c.set('user', _mockUser);
  }
  return next();
});

// deno-lint-ignore no-explicit-any
export const requireAuth = mockFn((...args: unknown[]) => {
  const c = args[0] as any;
  const next = args[1] as () => Promise<void>;
  if (_checkHeader) {
    const authHeader: string | undefined = c.req?.header?.('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const user = token === VALID_TEST_TOKEN ? _mockUser : null;
      c.set('user', user);
      if (!user) {
        return c.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
          401,
        );
      }
    } else {
      return c.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        401,
      );
    }
  } else {
    c.set('user', _mockUser);
  }
  return next();
});

export const requireAdmin = mockFn(
  (...args: unknown[]) => (args[1] as () => Promise<void>)(),
);

export const optionalAuth = mockFn(
  (...args: unknown[]) => (args[1] as () => Promise<void>)(),
);
