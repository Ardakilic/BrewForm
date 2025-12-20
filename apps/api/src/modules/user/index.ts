/**
 * BrewForm User Routes
 * Handles user profile endpoints
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { updateProfileSchema, paginationSchema } from '../../utils/validation/index.js';
import { userService } from './service.js';
import { authMiddleware, requireAuth } from '../../middleware/auth.js';

const users = new Hono();

// Apply auth middleware to all routes
users.use('*', authMiddleware);

/**
 * GET /users/me
 * Get current user's profile
 */
users.get('/me', requireAuth, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }
  const profile = await userService.getProfile(user.id);

  return c.json({
    success: true,
    data: profile,
  });
});

/**
 * PATCH /users/me
 * Update current user's profile
 */
users.patch(
  '/me',
  requireAuth,
  zValidator('json', updateProfileSchema),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
    }
    const input = c.req.valid('json');
    const profile = await userService.updateProfile(user.id, input);

    return c.json({
      success: true,
      data: profile,
    });
  }
);

/**
 * DELETE /users/me
 * Delete current user's account
 */
users.delete('/me', requireAuth, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }
  await userService.deleteAccount(user.id);

  return c.json({
    success: true,
    message: 'Account deleted successfully',
  });
});

/**
 * GET /users/me/recipes
 * Get current user's recipes
 */
users.get(
  '/me/recipes',
  requireAuth,
  zValidator('query', paginationSchema),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
    }
    const { page, limit } = c.req.valid('query');
    const result = await userService.getUserRecipes(user.id, user.id, page, limit);

    return c.json({
      success: true,
      data: result.recipes,
      pagination: result.pagination,
    });
  }
);

/**
 * GET /users/me/favourites
 * Get current user's favourites
 */
users.get(
  '/me/favourites',
  requireAuth,
  zValidator('query', paginationSchema),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
    }
    const { page, limit } = c.req.valid('query');
    const result = await userService.getUserFavourites(user.id, page, limit);

    return c.json({
      success: true,
      data: result.favourites,
      pagination: result.pagination,
    });
  }
);

/**
 * GET /users/:username
 * Get public user profile
 */
users.get('/:username', async (c) => {
  const username = c.req.param('username');
  const profile = await userService.getPublicProfile(username);

  return c.json({
    success: true,
    data: profile,
  });
});

/**
 * GET /users/:username/recipes
 * Get user's public recipes
 */
users.get(
  '/:username/recipes',
  zValidator('query', paginationSchema),
  async (c) => {
    const username = c.req.param('username');
    const { page, limit } = c.req.valid('query');
    const viewer = c.get('user');

    // First get the user ID from username
    const profile = await userService.getPublicProfile(username);
    const result = await userService.getUserRecipes(
      profile.id,
      viewer?.id || null,
      page,
      limit
    );

    return c.json({
      success: true,
      data: result.recipes,
      pagination: result.pagination,
    });
  }
);

export default users;
