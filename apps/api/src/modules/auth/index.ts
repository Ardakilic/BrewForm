/**
 * BrewForm Authentication Routes
 * Handles user authentication endpoints
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  registerSchema,
  loginSchema,
  resetPasswordRequestSchema,
  resetPasswordSchema,
} from '../../utils/validation/index.js';
import { authService } from './service.js';
import { requireAuth, authMiddleware } from '../../middleware/auth.js';
import { authRateLimiter } from '../../middleware/rateLimit.js';
import { z } from 'zod';

const auth = new Hono();

// Apply rate limiting to all auth routes
auth.use('*', authRateLimiter);

/**
 * POST /auth/register
 * Register a new user
 */
auth.post(
  '/register',
  zValidator('json', registerSchema),
  async (c) => {
    const input = c.req.valid('json');
    const result = await authService.register(input);

    return c.json(
      {
        success: true,
        data: result,
      },
      201
    );
  }
);

/**
 * POST /auth/login
 * Login user
 */
auth.post(
  '/login',
  zValidator('json', loginSchema),
  async (c) => {
    const input = c.req.valid('json');
    const userAgent = c.req.header('user-agent');
    const forwarded = c.req.header('x-forwarded-for');
    const ipAddress = forwarded?.split(',')[0]?.trim() || c.req.header('x-real-ip');

    const result = await authService.login(input, userAgent, ipAddress);

    return c.json({
      success: true,
      data: result,
    });
  }
);

/**
 * POST /auth/logout
 * Logout user
 */
auth.post(
  '/logout',
  authMiddleware,
  requireAuth,
  zValidator('json', z.object({ refreshToken: z.string() })),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
    }
    const { refreshToken } = c.req.valid('json');

    await authService.logout(user.id, refreshToken);

    return c.json({
      success: true,
      message: 'Logged out successfully',
    });
  }
);

/**
 * POST /auth/refresh
 * Refresh access token
 */
auth.post(
  '/refresh',
  zValidator('json', z.object({ refreshToken: z.string() })),
  async (c) => {
    const { refreshToken } = c.req.valid('json');
    const tokens = await authService.refreshTokens(refreshToken);

    return c.json({
      success: true,
      data: tokens,
    });
  }
);

/**
 * POST /auth/verify-email
 * Verify email address
 */
auth.post(
  '/verify-email',
  zValidator('json', z.object({ token: z.string() })),
  async (c) => {
    const { token } = c.req.valid('json');
    await authService.verifyEmail(token);

    return c.json({
      success: true,
      message: 'Email verified successfully',
    });
  }
);

/**
 * POST /auth/forgot-password
 * Request password reset
 */
auth.post(
  '/forgot-password',
  zValidator('json', resetPasswordRequestSchema),
  async (c) => {
    const { email } = c.req.valid('json');
    await authService.requestPasswordReset(email);

    // Always return success to prevent email enumeration
    return c.json({
      success: true,
      message: 'If an account exists with this email, a reset link has been sent',
    });
  }
);

/**
 * POST /auth/reset-password
 * Reset password with token
 */
auth.post(
  '/reset-password',
  zValidator('json', resetPasswordSchema),
  async (c) => {
    const { token, password } = c.req.valid('json');
    await authService.resetPassword(token, password);

    return c.json({
      success: true,
      message: 'Password reset successfully',
    });
  }
);

/**
 * POST /auth/change-password
 * Change password (while logged in)
 */
auth.post(
  '/change-password',
  authMiddleware,
  requireAuth,
  zValidator(
    'json',
    z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(128),
    })
  ),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
    }
    const { currentPassword, newPassword } = c.req.valid('json');

    await authService.changePassword(user.id, currentPassword, newPassword);

    return c.json({
      success: true,
      message: 'Password changed successfully',
    });
  }
);

/**
 * GET /auth/me
 * Get current user info
 */
auth.get('/me', authMiddleware, requireAuth, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }

  return c.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      username: user.username,
      isAdmin: user.isAdmin,
    },
  });
});

export default auth;
