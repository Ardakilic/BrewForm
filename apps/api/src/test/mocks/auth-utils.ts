/**
 * Mock for src/utils/auth/index.ts
 * Redirected via import_map.json during deno test runs.
 */

// Create an object with methods that can be stubbed
const authUtils = {
  hashPassword(_password: string): Promise<string> {
    return Promise.resolve("hashed_password");
  },

  verifyPassword(_password: string, _hash: string): Promise<boolean> {
    return Promise.resolve(true);
  },

  generateTokenPair(_userId: string, _sessionId: string): {
    accessToken: string;
    refreshToken: string;
  } {
    return {
      accessToken: "mock_access_token",
      refreshToken: "mock_refresh_token",
    };
  },

  generateVerificationToken(): string {
    return "mock_verification_token";
  },

  generatePasswordResetToken(): string {
    return "mock_reset_token";
  },

  generateSessionToken(): string {
    return "mock_session_token";
  },

  verifyAccessToken(
    _token: string,
  ): Promise<{ userId: string; sessionId: string }> {
    return Promise.resolve({ userId: "user_123", sessionId: "session_123" });
  },

  verifyRefreshToken(
    _token: string,
  ): Promise<{ userId: string; sessionId: string }> {
    return Promise.resolve({ userId: "user_123", sessionId: "session_123" });
  },
};

// Export individual functions that delegate to the object
export const hashPassword = authUtils.hashPassword.bind(authUtils);
export const verifyPassword = authUtils.verifyPassword.bind(authUtils);
export const generateTokenPair = authUtils.generateTokenPair.bind(authUtils);
export const generateVerificationToken = authUtils.generateVerificationToken
  .bind(authUtils);
export const generatePasswordResetToken = authUtils.generatePasswordResetToken
  .bind(authUtils);
export const generateSessionToken = authUtils.generateSessionToken.bind(
  authUtils,
);
export const verifyAccessToken = authUtils.verifyAccessToken.bind(authUtils);
export const verifyRefreshToken = authUtils.verifyRefreshToken.bind(authUtils);

// Export the object for stubbing
export default authUtils;
