/**
 * Mock for src/utils/auth/index.ts
 * Redirected via import_map.json during deno test runs.
 */

import { spy } from "@std/testing/mock";

export const hashPassword = spy(() => Promise.resolve("hashed_password"));

export const verifyPassword = spy(() => Promise.resolve(true));

export const generateTokenPair = spy(() => ({
  accessToken: "mock_access_token",
  refreshToken: "mock_refresh_token",
}));

export const generateVerificationToken = spy(() => "mock_verification_token");

export const generatePasswordResetToken = spy(() => "mock_reset_token");

export const generateSessionToken = spy(() => "mock_session_token");

export const verifyAccessToken = spy(() =>
  Promise.resolve({ userId: "user_123", sessionId: "session_123" })
);

export const verifyRefreshToken = spy(() =>
  Promise.resolve({ userId: "user_123", sessionId: "session_123" })
);
