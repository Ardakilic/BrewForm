/**
 * BrewForm Social Routes
 * Handles favourites, comments, and comparisons
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  paginationSchema,
  recipeIdParamSchema,
  commentIdParamSchema,
} from '../../utils/validation';
import { socialService } from './service';
import { authMiddleware, requireAuth } from '../../middleware/auth';
import { writeRateLimiter } from '../../middleware/rateLimit';

const social = new Hono();

// Apply auth middleware
social.use('*', authMiddleware);

// ============================================
// Favourites
// ============================================

/**
 * POST /social/favourites/:recipeId
 * Add recipe to favourites
 */
social.post(
  '/favourites/:recipeId',
  requireAuth,
  zValidator('param', recipeIdParamSchema),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
    }
    const { recipeId } = c.req.valid('param');

    const result = await socialService.addFavourite(user.id, recipeId);

    if (result.alreadyFavourited) {
      return c.json(
        { success: false, error: { code: 'CONFLICT', message: 'Recipe already favourited' } },
        409
      );
    }

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
 * DELETE /social/favourites/:recipeId
 * Remove recipe from favourites
 */
social.delete(
  '/favourites/:recipeId',
  requireAuth,
  zValidator('param', recipeIdParamSchema),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
    }
    const { recipeId } = c.req.valid('param');

    const result = await socialService.removeFavourite(user.id, recipeId);

    return c.json({
      success: true,
      data: result,
    });
  }
);

/**
 * GET /social/favourites/:recipeId/check
 * Check if recipe is favourited
 */
social.get(
  '/favourites/:recipeId/check',
  requireAuth,
  zValidator('param', recipeIdParamSchema),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
    }
    const { recipeId } = c.req.valid('param');

    const isFavourited = await socialService.isFavourited(user.id, recipeId);

    return c.json({
      success: true,
      data: { isFavourited },
    });
  }
);

// ============================================
// Comments
// ============================================

/**
 * GET /social/recipes/:recipeId/comments
 * Get comments for a recipe
 */
social.get(
  '/recipes/:recipeId/comments',
  zValidator('param', recipeIdParamSchema),
  zValidator('query', paginationSchema),
  async (c) => {
    const { recipeId } = c.req.valid('param');
    const { page, limit } = c.req.valid('query');

    const result = await socialService.getRecipeComments(recipeId, page, limit);

    return c.json({
      success: true,
      data: result.comments,
      pagination: result.pagination,
    });
  }
);

/**
 * POST /social/recipes/:recipeId/comments
 * Add a comment to a recipe
 */
social.post(
  '/recipes/:recipeId/comments',
  requireAuth,
  writeRateLimiter,
  zValidator('param', recipeIdParamSchema),
  zValidator(
    'json',
    z.object({
      content: z.string().min(1).max(2000),
      parentId: z.string().cuid().optional(),
    })
  ),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
    }
    const { recipeId } = c.req.valid('param');
    const { content, parentId } = c.req.valid('json');

    const comment = await socialService.addComment(
      user.id,
      recipeId,
      content,
      parentId
    );

    return c.json(
      {
        success: true,
        data: comment,
      },
      201
    );
  }
);

/**
 * PATCH /social/comments/:commentId
 * Update a comment
 */
social.patch(
  '/comments/:commentId',
  requireAuth,
  zValidator('param', commentIdParamSchema),
  zValidator('json', z.object({ content: z.string().min(1).max(2000) })),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
    }
    const { commentId } = c.req.valid('param');
    const { content } = c.req.valid('json');

    const comment = await socialService.updateComment(commentId, user.id, content);

    return c.json({
      success: true,
      data: comment,
    });
  }
);

/**
 * DELETE /social/comments/:commentId
 * Delete a comment
 */
social.delete(
  '/comments/:commentId',
  requireAuth,
  zValidator('param', commentIdParamSchema),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
    }
    const { commentId } = c.req.valid('param');

    await socialService.deleteComment(commentId, user.id, user.isAdmin);

    return c.json({
      success: true,
      message: 'Comment deleted successfully',
    });
  }
);

// ============================================
// Comparisons
// ============================================

/**
 * POST /social/comparisons
 * Create a recipe comparison
 */
social.post(
  '/comparisons',
  zValidator(
    'json',
    z.object({
      recipeAId: z.string().cuid(),
      recipeBId: z.string().cuid(),
    })
  ),
  async (c) => {
    const { recipeAId, recipeBId } = c.req.valid('json');

    const comparison = await socialService.createComparison(recipeAId, recipeBId);

    return c.json(
      {
        success: true,
        data: comparison,
      },
      201
    );
  }
);

/**
 * GET /social/comparisons/:token
 * Get comparison by share token
 */
social.get('/comparisons/:token', async (c: any) => {
  const token = c.req.param('token');

  const comparison = await socialService.getComparisonByToken(token);

  return c.json({
    success: true,
    data: comparison,
  });
});

export default social;
