import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute } from 'hono-openapi';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';
import {
  AuthLoginSchema,
  AuthRegisterSchema,
  PasswordResetConfirmSchema,
  PasswordResetSchema,
} from '@brewform/shared/schemas';
import { z } from 'zod';
import * as authService from './service.ts';
import { error, success } from '../../utils/response/index.ts';
import { config } from '../../config/env.ts';
import { createLogger } from '../../utils/logger/index.ts';
import { authRateLimitMiddleware } from '../../middleware/rateLimit.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import type { AppEnv } from '../../types/hono.ts';
import type { User } from '@brewform/shared/types';

const log = createLogger('auth');

const auth = new Hono<AppEnv>();
const authRateLimit = authRateLimitMiddleware({ windowMs: 15 * 60_000, maxAttempts: 5 });

const CookieRefreshSchema = z.object({
  refreshToken: z.string().optional(),
});

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
    maxAge: 15 * 60,
  });

  setCookie(c, 'brewform_refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'Strict',
    path: '/api/v1/auth',
    maxAge: rememberMe ? 180 * 24 * 60 * 60 : 7 * 24 * 60 * 60,
  });
}

function clearAuthCookies(c: Context) {
  const isProduction = config.APP_ENV === 'production';

  deleteCookie(c, 'brewform_access_token', {
    path: '/',
    secure: isProduction,
  });

  deleteCookie(c, 'brewform_refresh_token', {
    path: '/api/v1/auth',
    secure: isProduction,
  });
}

auth.post(
  '/register',
  authRateLimit,
  describeRoute({
    tags: ['Auth'],
    summary: 'Register a new account',
    description: 'Creates a new user account and returns access + refresh tokens. ' +
      'Email and username are checked for uniqueness.',
    responses: {
      201: { description: 'Account created; tokens issued' },
      403: { description: 'Registration disabled' },
      409: { description: 'Email or username already in use' },
    },
  }),
  zValidator('json', AuthRegisterSchema),
  async (c) => {
    const body = c.req.valid('json');
    try {
      const result = await authService.register(body);
      setAuthCookies(c, result.accessToken, result.refreshToken);
      return success(c, {
        user: sanitizeUser(result.user),
      }, 201);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'REGISTRATION_DISABLED') {
        log.warn(
          { ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown' },
          'Registration attempt while disabled',
        );
        return error(
          c,
          'REGISTRATION_DISABLED',
          'New account registration is currently disabled',
          403,
        );
      }
      if (message === 'EMAIL_ALREADY_EXISTS') {
        return error(c, 'CONFLICT', 'Email already registered', 409);
      }
      if (message === 'USERNAME_ALREADY_EXISTS') {
        return error(c, 'CONFLICT', 'Username already taken', 409);
      }
      throw err;
    }
  },
);

auth.post(
  '/login',
  authRateLimit,
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
      setAuthCookies(c, result.accessToken, result.refreshToken, body.rememberMe);
      return success(c, {
        user: sanitizeUser(result.user),
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

auth.post(
  '/refresh',
  describeRoute({
    tags: ['Auth'],
    summary: 'Exchange a refresh token for a new access token',
    description: 'Exchange a refresh token for a new access token. ' +
      'The refresh token can be provided in the request body or via httpOnly cookie.',
    responses: {
      200: { description: 'New access + refresh tokens issued' },
      401: { description: 'Refresh token invalid or expired' },
    },
  }),
  async (c) => {
    let bodyToken: string | undefined;
    try {
      const contentType = c.req.header('content-type');
      if (contentType?.includes('application/json')) {
        const parsed = CookieRefreshSchema.parse(await c.req.json());
        bodyToken = parsed.refreshToken;
      }
    } catch {
      // Invalid or missing body — fall through to cookie
    }
    const refreshTokenValue = bodyToken || getCookie(c, 'brewform_refresh_token');
    if (!refreshTokenValue) {
      return error(c, 'INVALID_REFRESH_TOKEN', 'No refresh token provided', 401);
    }
    try {
      const result = await authService.refreshAccessToken(refreshTokenValue);
      setAuthCookies(c, result.accessToken, result.refreshToken, result.wasRememberMe);
      return success(c, {
        user: sanitizeUser(result.user),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (['INVALID_TOKEN_TYPE', 'USER_NOT_FOUND'].includes(message)) {
        return error(c, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token', 401);
      }
      if (err instanceof Error && err.name.startsWith('Jwt')) {
        return error(c, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token', 401);
      }
      throw err;
    }
  },
);

auth.post(
  '/forgot-password',
  authRateLimit,
  describeRoute({
    tags: ['Auth'],
    summary: 'Request a password reset email',
    description: 'Always returns 200 to avoid leaking which emails are registered. ' +
      'A token is emailed if the address matches an account.',
    responses: {
      200: { description: 'Acknowledged (a reset email was sent if the account exists)' },
    },
  }),
  zValidator('json', PasswordResetSchema),
  async (c) => {
    const body = c.req.valid('json');
    await authService.requestPasswordReset(body.email);
    return success(c, {
      message: 'If an account with that email exists, a reset link has been sent.',
    });
  },
);

auth.post(
  '/reset-password',
  describeRoute({
    tags: ['Auth'],
    summary: 'Confirm a password reset',
    description: 'Consumes a token from the reset email and sets a new password.',
    responses: {
      200: { description: 'Password updated' },
      400: { description: 'Token invalid, used, or expired' },
    },
  }),
  zValidator('json', PasswordResetConfirmSchema),
  async (c) => {
    const body = c.req.valid('json');
    try {
      await authService.confirmPasswordReset(body.token, body.newPassword);
      return success(c, { message: 'Password has been reset successfully.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'INVALID_RESET_TOKEN') {
        return error(c, 'INVALID_TOKEN', 'Invalid password reset token', 400);
      }
      if (message === 'TOKEN_ALREADY_USED') {
        return error(c, 'TOKEN_USED', 'This reset token has already been used', 400);
      }
      if (message === 'TOKEN_EXPIRED') {
        return error(c, 'TOKEN_EXPIRED', 'This reset token has expired', 400);
      }
      throw err;
    }
  },
);

auth.get(
  '/registration-status',
  describeRoute({
    tags: ['Auth'],
    summary: 'Check if new user registration is enabled',
    description: 'Returns whether the server currently accepts new account registrations. ' +
      'Public endpoint — no authentication required.',
    responses: {
      200: { description: 'Registration status returned' },
    },
  }),
  (c) => {
    return success(c, { enabled: config.ENABLE_REGISTRATION });
  },
);

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
    const user = c.get('user') as unknown as {
      id: string;
      email: string;
      username: string;
      emailVerifiedAt: Date | null;
    };
    if (user.emailVerifiedAt) {
      return success(c, { message: 'Email is already verified' });
    }
    await authService.sendVerificationToken(user.id, user.email, user.username);
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

interface UserWithPasswordHash extends Omit<User, 'preferences'> {
  passwordHash: string;
  preferences?: User['preferences'];
}

function sanitizeUser(user: UserWithPasswordHash): Omit<UserWithPasswordHash, 'passwordHash'> {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

export default auth;
