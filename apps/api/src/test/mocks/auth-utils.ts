/**
 * Mock for src/utils/auth/index.ts
 * Redirected via import_map.json during deno test runs.
 */

// Create an object with methods that can be stubbed
const authUtils = {
  hashPassword(_password: string): Promise<string> {
    return Promise.resolve('hashed_password');
  },

  verifyPassword(_password: string, _hash: string): Promise<boolean> {
    return Promise.resolve(true);
  },

  generateTokenPair(_userId: string, _sessionId: string): {
    accessToken: string;
    refreshToken: string;
  } {
    return {
      accessToken: 'mock_access_token',
      refreshToken: 'mock_refresh_token',
    };
  },

  generateVerificationToken(): string {
    return 'mock_verification_token';
  },

  generatePasswordResetToken(): string {
    return 'mock_reset_token';
  },

  generateSessionToken(): string {
    return 'mock_session_token';
  },

  verifyAccessToken(
    _token: string,
  ): Promise<{ userId: string; sessionId: string }> {
    return Promise.resolve({ userId: 'user_123', sessionId: 'session_123' });
  },

  verifyRefreshToken(
    _token: string,
  ): Promise<{ userId: string; sessionId: string }> {
    return Promise.resolve({ userId: 'user_123', sessionId: 'session_123' });
  },
};

// Export individual functions that delegate to the object
export function hashPassword(password: string): Promise<string> {
  return authUtils.hashPassword(password);
}

export function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return authUtils.verifyPassword(password, hash);
}

export function generateTokenPair(
  userId: string,
  sessionId: string,
): { accessToken: string; refreshToken: string } {
  return authUtils.generateTokenPair(userId, sessionId);
}

export function generateVerificationToken(): string {
  return authUtils.generateVerificationToken();
}

export function generatePasswordResetToken(): string {
  return authUtils.generatePasswordResetToken();
}

export function generateSessionToken(): string {
  return authUtils.generateSessionToken();
}

export function verifyAccessToken(
  token: string,
): Promise<{ userId: string; sessionId: string }> {
  return authUtils.verifyAccessToken(token);
}

export function verifyRefreshToken(
  token: string,
): Promise<{ userId: string; sessionId: string }> {
  return authUtils.verifyRefreshToken(token);
}

// Export the object for stubbing
export default authUtils;
