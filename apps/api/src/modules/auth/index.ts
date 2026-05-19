import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute } from 'hono-openapi';
import {
  AuthLoginSchema,
  AuthRefreshSchema,
  AuthRegisterSchema,
  PasswordResetConfirmSchema,
  PasswordResetSchema,
} from '@brewform/shared/schemas';
import * as authService from './service.ts';
import { error, success } from '../../utils/response/index.ts';
import { config } from '../../config/env.ts';
import { createLogger } from '../../utils/logger/index.ts';

const log = createLogger('auth');

const auth = new Hono();

auth.post(
  '/register',
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
      return success(c, {
        user: sanitizeUser(result.user),
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
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
      if (['INVALID_TOKEN_TYPE', 'USER_NOT_FOUND'].includes(message)) {
        return error(c, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token', 401);
      }
      // Catch JWT verification errors (expired, invalid signature, malformed)
      if (err instanceof Error && err.name.startsWith('Jwt')) {
        return error(c, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token', 401);
      }
      throw err;
    }
  },
);

auth.post(
  '/forgot-password',
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

// deno-lint-ignore no-explicit-any
function sanitizeUser(user: any): Record<string, unknown> {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

export default auth;
