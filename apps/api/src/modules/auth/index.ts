import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  AuthRegisterSchema,
  AuthLoginSchema,
  AuthRefreshSchema,
  PasswordResetSchema,
  PasswordResetConfirmSchema,
} from '@brewform/shared/schemas';
import * as authService from './service.ts';
import { success, error } from '../../utils/response/index.ts';

const auth = new Hono();

auth.post('/register', zValidator('json', AuthRegisterSchema), async (c) => {
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
    if (message === 'EMAIL_ALREADY_EXISTS') {
      return error(c, 'CONFLICT', 'Email already registered', 409);
    }
    if (message === 'USERNAME_ALREADY_EXISTS') {
      return error(c, 'CONFLICT', 'Username already taken', 409);
    }
    throw err;
  }
});

auth.post('/login', zValidator('json', AuthLoginSchema), async (c) => {
  const body = c.req.valid('json');
  try {
    const result = await authService.login(body.email, body.password);
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
});

auth.post('/refresh', zValidator('json', AuthRefreshSchema), async (c) => {
  const body = c.req.valid('json');
  try {
    const result = await authService.refreshAccessToken(body.refreshToken);
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
});

auth.post('/forgot-password', zValidator('json', PasswordResetSchema), async (c) => {
  const body = c.req.valid('json');
  await authService.requestPasswordReset(body.email);
  return success(c, { message: 'If an account with that email exists, a reset link has been sent.' });
});

auth.post('/reset-password', zValidator('json', PasswordResetConfirmSchema), async (c) => {
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
});

// deno-lint-ignore no-explicit-any
function sanitizeUser(user: any): Record<string, unknown> {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

export default auth;