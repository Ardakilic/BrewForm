/**
 * BrewForm Recipe Routes
 * Handles recipe CRUD and related endpoints
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  createRecipeSchema,
  updateRecipeSchema,
  recipeFilterSchema,
  recipeVersionInputSchema,
  type RecipeFilters,
} from '../../utils/validation/index.js';
import { recipeService } from './service.js';
import { authMiddleware, requireAuth } from '../../middleware/auth.js';
import { writeRateLimiter } from '../../middleware/rateLimit.js';

const recipes = new Hono();

// Apply auth middleware to all routes
recipes.use('*', authMiddleware);

/**
 * GET /recipes
 * List recipes with filters
 */
recipes.get('/', zValidator('query', recipeFilterSchema), async (c) => {
  const filters = c.req.valid('query');
  const viewer = c.get('user');
  
  // Parse tags from comma-separated string if present
  const tagsParam = filters.tags;
  const parsedTags = typeof tagsParam === 'string' && tagsParam 
    ? tagsParam.split(',').map((t) => t.trim()) 
    : undefined;

  const result = await recipeService.listRecipes(
    { ...filters, tags: parsedTags } as RecipeFilters & { tags?: string[] },
    viewer?.id
  );

  return c.json({
    success: true,
    data: result.recipes,
    pagination: result.pagination,
  });
});

/**
 * GET /recipes/latest
 * Get latest public recipes
 */
recipes.get('/latest', async (c) => {
  const recipes = await recipeService.getLatestRecipes();

  return c.json({
    success: true,
    data: recipes,
  });
});

/**
 * GET /recipes/popular
 * Get most popular recipes
 */
recipes.get('/popular', async (c) => {
  const recipes = await recipeService.getPopularRecipes();

  return c.json({
    success: true,
    data: recipes,
  });
});

/**
 * POST /recipes
 * Create a new recipe
 */
recipes.post(
  '/',
  requireAuth,
  writeRateLimiter,
  zValidator('json', createRecipeSchema),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
    }
    const input = c.req.valid('json');
    const recipe = await recipeService.createRecipe(user.id, input);

    return c.json(
      {
        success: true,
        data: recipe,
      },
      201
    );
  }
);

/**
 * GET /recipes/:id
 * Get recipe by ID
 */
recipes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const viewer = c.get('user');

  // Check if it's a slug or ID
  const recipe = id.includes('-')
    ? await recipeService.getRecipeBySlug(id, viewer?.id)
    : await recipeService.getRecipeById(id, viewer?.id);

  return c.json({
    success: true,
    data: recipe,
  });
});

/**
 * PATCH /recipes/:id
 * Update recipe metadata
 */
recipes.patch(
  '/:id',
  requireAuth,
  zValidator('json', updateRecipeSchema),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
    }
    const id = c.req.param('id');
    const input = c.req.valid('json');

    const recipe = await recipeService.updateRecipe(id, user.id, input);

    return c.json({
      success: true,
      data: recipe,
    });
  }
);

/**
 * DELETE /recipes/:id
 * Delete a recipe
 */
recipes.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }
  const id = c.req.param('id');

  await recipeService.deleteRecipe(id, user.id);

  return c.json({
    success: true,
    message: 'Recipe deleted successfully',
  });
});

/**
 * GET /recipes/:id/versions
 * Get all versions of a recipe
 */
recipes.get('/:id/versions', async (c) => {
  const id = c.req.param('id');
  const viewer = c.get('user');

  const versions = await recipeService.getRecipeVersions(id, viewer?.id);

  return c.json({
    success: true,
    data: versions,
  });
});

/**
 * POST /recipes/:id/versions
 * Create a new version of a recipe
 */
recipes.post(
  '/:id/versions',
  requireAuth,
  writeRateLimiter,
  zValidator('json', recipeVersionInputSchema),
  async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
    }
    const id = c.req.param('id');
    const input = c.req.valid('json');

    const version = await recipeService.createRecipeVersion(id, user.id, input);

    return c.json(
      {
        success: true,
        data: version,
      },
      201
    );
  }
);

/**
 * POST /recipes/:id/fork
 * Fork a recipe
 */
recipes.post('/:id/fork', requireAuth, writeRateLimiter, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);
  }
  const id = c.req.param('id');

  const recipe = await recipeService.forkRecipe(id, user.id);

  return c.json(
    {
      success: true,
      data: recipe,
    },
    201
  );
});

export default recipes;
