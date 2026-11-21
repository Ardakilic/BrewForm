import {
  AuthLoginSchema,
  AuthRefreshSchema,
  AuthRegisterSchema,
  ErrorEnvelopeSchema,
  PasswordResetConfirmSchema,
  PasswordResetSchema,
} from '@brewform/shared/schemas';
import type { User } from '@brewform/shared/types';
import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { config } from '../../config/env.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import {
  emailIpKey,
  emailKey,
  rateLimit,
  rateLimitFailures,
  validatedEmailIpKey,
  validatedEmailKey,
} from '../../middleware/rateLimit.ts';
import type { AppEnv } from '../../types/hono.ts';
import { createLogger } from '../../utils/logger/index.ts';
import { POLICIES } from '../../utils/rate-limit/policies.ts';
import { deleteRateLimitCounter } from '../../utils/rate-limit/registry.ts';
import { error, success } from '../../utils/response/index.ts';
import * as authService from './service.ts';

/** Module-scoped structured logger for the auth routes (exported for test spies). */
export const log = createLogger('auth');

/**
 * Hono sub-router for auth endpoints, mounted at `/api/v1/auth`.
 *
 * Rate limits (named policies in `utils/rate-limit/policies.ts`): IP-keyed
 * policies run before body validation and auth, email-keyed ones after
 * `zValidator`, user-keyed ones after `authMiddleware`.
 */
const auth = new Hono<AppEnv>();

/**
 * OpenAPI `429` response for a rate-limited auth route.
 *
 * @param limits - Human-readable limits, e.g. "5 per hour per IP".
 * @returns The `responses[429]` entry (standard error envelope).
 */
function rateLimited(limits: string) {
  return {
    description: `Rate limit exceeded (${limits}); see the Retry-After header`,
    content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
  };
}

function setAuthCookies(c: Context, accessToken: string, refreshToken: string, rememberMe = false) {
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
  rateLimit(POLICIES.authRegisterIp),
  describeRoute({
    tags: ['Auth'],
    summary: 'Register a new account',
    description:
      'Creates a new user account and returns access + refresh tokens. ' +
      'Email and username are checked for uniqueness. ' +
      'Rate-limited to 5 requests per hour per client IP.',
    responses: {
      201: { description: 'Account created; tokens issued' },
      403: { description: 'Registration disabled' },
      409: {
        description: 'Email or username already in use (envelope code CONFLICT)',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      429: rateLimited('5 requests per hour per client IP'),
    },
  }),
  zValidator('json', AuthRegisterSchema),
  async (c) => {
    const body = c.req.valid('json');
    try {
      const result = await authService.register(body);
      setAuthCookies(c, result.accessToken, result.refreshToken);
      return success(
        c,
        {
          user: sanitizeUser(result.user),
        },
        201,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'REGISTRATION_DISABLED') {
        log.warn({}, 'Registration attempt while disabled');
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
  rateLimit(POLICIES.authLoginIp),
  rateLimitFailures(POLICIES.authLoginFailIp),
  describeRoute({
    tags: ['Auth'],
    summary: 'Log in with email and password',
    description:
      'Returns access + refresh tokens on success. ' +
      'Set rememberMe to true for a long-lived refresh token (6 months by default). ' +
      'Rate-limited to 20 attempts per 15 minutes per client IP, 100 failed attempts per day ' +
      'per client IP, 5 consecutive failed attempts per 15 minutes per account and IP (reset ' +
      'by a successful login or password reset) and 20 failed attempts per hour per account. ' +
      'Unknown emails are counted exactly like existing accounts.',
    responses: {
      200: { description: 'Login succeeded; tokens issued' },
      401: { description: 'Invalid credentials' },
      403: { description: 'Account banned' },
      429: rateLimited(
        '20 per 15 min per IP; 100 failures per day per IP; 5 failures per 15 min per account and IP; 20 failures per hour per account',
      ),
    },
  }),
  zValidator('json', AuthLoginSchema),
  rateLimitFailures(POLICIES.authLoginFailAccountIp, {
    key: validatedEmailIpKey,
    resetOnSuccess: true,
  }),
  rateLimitFailures(POLICIES.authLoginFailAccount, { key: validatedEmailKey }),
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
    description:
      'Exchange a refresh token for a new access token. ' +
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
        const parsed = AuthRefreshSchema.parse(await c.req.json());
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
  rateLimit(POLICIES.authForgotIp),
  describeRoute({
    tags: ['Auth'],
    summary: 'Request a password reset email',
    description:
      'Always returns 200 (when not rate-limited) to avoid leaking which emails are registered. ' +
      'A token is emailed if the address matches an account. ' +
      'Rate-limited to 5 requests per 15 minutes per client IP and 3 per hour per email address.',
    responses: {
      200: { description: 'Acknowledged (a reset email was sent if the account exists)' },
      429: rateLimited('5 per 15 min per IP; 3 per hour per email address'),
    },
  }),
  zValidator('json', PasswordResetSchema),
  rateLimit(POLICIES.authForgotAccount, { key: validatedEmailKey }),
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
  rateLimit(POLICIES.authTokenIp),
  describeRoute({
    tags: ['Auth'],
    summary: 'Confirm a password reset',
    description:
      'Consumes a token from the reset email and sets a new password. A successful reset ' +
      "clears the account's login-failure limits. " +
      'Rate-limited to 10 requests per 15 minutes per client IP (shared with verify-email).',
    responses: {
      200: { description: 'Password updated' },
      400: { description: 'Token invalid, used, or expired' },
      429: rateLimited('10 per 15 min per IP, shared with verify-email'),
    },
  }),
  zValidator('json', PasswordResetConfirmSchema),
  async (c) => {
    const body = c.req.valid('json');
    try {
      const email = await authService.confirmPasswordReset(body.token, body.newPassword);
      if (email !== null) {
        // Give a locked-out owner a way back in (api-rate-limiting spec).
        await Promise.all([
          deleteRateLimitCounter(POLICIES.authLoginFailAccount, emailKey(email)),
          deleteRateLimitCounter(POLICIES.authLoginFailAccountIp, emailIpKey(c, email)),
        ]);
      }
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
    description:
      'Returns whether the server currently accepts new account registrations. ' +
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
  rateLimit(POLICIES.authVerifySendIp),
  authMiddleware,
  rateLimit(POLICIES.authVerifySendUserBurst),
  rateLimit(POLICIES.authVerifySendUserDaily),
  describeRoute({
    tags: ['Auth'],
    summary: 'Resend email verification link',
    description:
      'Sends a new verification email to the authenticated, unverified user. ' +
      'Rate-limited to 10 requests per hour per client IP, and 1 per minute and 5 per day per user.',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Verification email sent (if account is unverified)' },
      401: {
        description: 'Authentication required',
        content: { 'application/json': { schema: resolver(ErrorEnvelopeSchema) } },
      },
      429: rateLimited('10 per hour per IP; 1 per minute and 5 per day per user'),
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
  rateLimit(POLICIES.authTokenIp),
  describeRoute({
    tags: ['Auth'],
    summary: 'Verify email address with token',
    description:
      'Consumes an email verification token. ' +
      'Rate-limited to 10 requests per 15 minutes per client IP (shared with reset-password).',
    responses: {
      200: { description: 'Email verified' },
      400: { description: 'Invalid or expired token' },
      429: rateLimited('10 per 15 min per IP, shared with reset-password'),
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
