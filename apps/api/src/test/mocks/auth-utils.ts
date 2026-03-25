/**
 * Mock for src/utils/auth/index.ts
 * Redirected via import_map.json during deno test runs.
 */

// Export plain functions that can be stubbed in tests
export function hashPassword(_password: string): Promise<string> {
  return Promise.resolve("hashed_password");
}

export function verifyPassword(
  _password: string,
  _hash: string,
): Promise<boolean> {
  return Promise.resolve(true);
}

export function generateTokenPair(_userId: string, _sessionId: string): {
  accessToken: string;
  refreshToken: string;
} {
  return {
    accessToken: "mock_access_token",
    refreshToken: "mock_refresh_token",
  };
}

export function generateVerificationToken(): string {
  return "mock_verification_token";
}

export function generatePasswordResetToken(): string {
  return "mock_reset_token";
}

export function generateSessionToken(): string {
  return "mock_session_token";
}

export function verifyAccessToken(
  _token: string,
): Promise<{ userId: string; sessionId: string }> {
  return Promise.resolve({ userId: "user_123", sessionId: "session_123" });
}

export function verifyRefreshToken(
  _token: string,
): Promise<{ userId: string; sessionId: string }> {
  return Promise.resolve({ userId: "user_123", sessionId: "session_123" });
}
