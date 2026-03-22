/**
 * Mock for src/utils/auth/index.ts
 * Redirected via import_map.json during deno test runs.
 */

import { mockFn } from '../mock-fn.ts';

export const hashPassword = mockFn(() => Promise.resolve('hashed_password'));

export const verifyPassword = mockFn(() => Promise.resolve(true));

export const generateTokenPair = mockFn(() => ({
  accessToken: 'mock_access_token',
  refreshToken: 'mock_refresh_token',
}));

export const generateVerificationToken = mockFn(() => 'mock_verification_token');

export const generatePasswordResetToken = mockFn(() => 'mock_reset_token');

export const generateSessionToken = mockFn(() => 'mock_session_token');

export const verifyAccessToken = mockFn(() =>
  Promise.resolve({ userId: 'user_123', sessionId: 'session_123' })
);

export const verifyRefreshToken = mockFn(() =>
  Promise.resolve({ userId: 'user_123', sessionId: 'session_123' })
);
