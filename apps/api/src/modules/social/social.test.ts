/**
 * Social Module Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import socialModule from './index.js';

// API Response type for testing
interface ApiResponse {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
  message?: string;
}

// Mock auth middleware
vi.mock('../../middleware/auth', () => ({
  authMiddleware: vi.fn((_c, next) => {
    _c.set('user', { id: 'user_123', isAdmin: false });
    return next();
  }),
  optionalAuth: vi.fn((_c, next) => next()),
  requireAuth: vi.fn((_c, next) => next()),
}));

// Mock Prisma
vi.mock('../../utils/prisma', () => ({
  prisma: {
    recipe: {
      findUnique: vi.fn(),
    },
    userFavourite: {
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    comment: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    comparison: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from '../../utils/prisma/index.js';

describe('Social Module', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route('/social', socialModule);
  });

  describe('Favourites', () => {
    describe('POST /social/favourites/:recipeId', () => {
      it('should add recipe to favourites', async () => {
        const mockRecipe = {
          id: 'recipe_1',
          visibility: 'PUBLIC',
        };

        const mockFavourite = {
          id: 'fav_1',
          userId: 'user_123',
          recipeId: 'recipe_1',
          createdAt: new Date(),
        };

        vi.mocked(prisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);
        vi.mocked(prisma.userFavourite.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.userFavourite.create).mockResolvedValue(mockFavourite as never);

        const response = await app.request('/social/favourites/recipe_1', {
          method: 'POST',
        });

        expect(response.status).toBe(201);
      });

      it('should return 409 if already favourited', async () => {
        const mockRecipe = { id: 'recipe_1', visibility: 'PUBLIC' };
        const existingFavourite = { id: 'fav_1', userId: 'user_123', recipeId: 'recipe_1' };

        vi.mocked(prisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);
        vi.mocked(prisma.userFavourite.findFirst).mockResolvedValue(existingFavourite as never);

        const response = await app.request('/social/favourites/recipe_1', {
          method: 'POST',
        });

        expect(response.status).toBe(409);
      });

      it('should reject favouriting private recipes', async () => {
        const mockRecipe = { id: 'recipe_1', visibility: 'PRIVATE', userId: 'other_user' };

        vi.mocked(prisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);

        const response = await app.request('/social/favourites/recipe_1', {
          method: 'POST',
        });

        expect(response.status).toBe(403);
      });
    });

    describe('DELETE /social/favourites/:recipeId', () => {
      it('should remove recipe from favourites', async () => {
        const mockFavourite = { id: 'fav_1', userId: 'user_123', recipeId: 'recipe_1' };

        vi.mocked(prisma.userFavourite.findFirst).mockResolvedValue(mockFavourite as never);
        vi.mocked(prisma.userFavourite.delete).mockResolvedValue(mockFavourite as never);

        const response = await app.request('/social/favourites/recipe_1', {
          method: 'DELETE',
        });

        expect(response.status).toBe(200);
      });

      it('should return 404 if not favourited', async () => {
        vi.mocked(prisma.userFavourite.findFirst).mockResolvedValue(null);

        const response = await app.request('/social/favourites/recipe_1', {
          method: 'DELETE',
        });

        expect(response.status).toBe(404);
      });
    });
  });

  describe('Comments', () => {
    describe('GET /social/recipes/:recipeId/comments', () => {
      it('should return comments for a recipe', async () => {
        const mockRecipe = { id: 'recipe_1', visibility: 'PUBLIC' };
        const mockComments = [
          {
            id: 'comment_1',
            content: 'Great recipe!',
            createdAt: new Date(),
            user: { username: 'coffeeenthusiast', displayName: 'Coffee Enthusiast' },
          },
          {
            id: 'comment_2',
            content: 'Tried this, worked perfectly!',
            createdAt: new Date(),
            user: { username: 'barista', displayName: 'Barista' },
          },
        ];

        vi.mocked(prisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);
        vi.mocked(prisma.comment.findMany).mockResolvedValue(mockComments as never);

        const response = await app.request('/social/recipes/recipe_1/comments');

        expect(response.status).toBe(200);
        const body = await response.json() as ApiResponse;
        expect(body.data).toHaveLength(2);
      });

      it('should reject viewing comments on private recipes', async () => {
        const mockRecipe = { id: 'recipe_1', visibility: 'PRIVATE', userId: 'other_user' };

        vi.mocked(prisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);

        const response = await app.request('/social/recipes/recipe_1/comments');

        expect(response.status).toBe(403);
      });
    });

    describe('POST /social/recipes/:recipeId/comments', () => {
      it('should add a comment to a recipe', async () => {
        const mockRecipe = { id: 'recipe_1', visibility: 'PUBLIC' };
        const mockComment = {
          id: 'comment_new',
          content: 'Amazing recipe!',
          userId: 'user_123',
          recipeId: 'recipe_1',
          createdAt: new Date(),
        };

        vi.mocked(prisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);
        vi.mocked(prisma.comment.create).mockResolvedValue(mockComment as never);

        const response = await app.request('/social/recipes/recipe_1/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Amazing recipe!' }),
        });

        expect(response.status).toBe(201);
      });

      it('should validate comment content', async () => {
        const response = await app.request('/social/recipes/recipe_1/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: '' }), // Empty content
        });

        expect(response.status).toBe(400);
      });
    });

    describe('DELETE /social/comments/:id', () => {
      it('should delete own comment', async () => {
        const mockComment = {
          id: 'comment_1',
          userId: 'user_123',
          content: 'My comment',
        };

        vi.mocked(prisma.comment.findUnique).mockResolvedValue(mockComment as never);
        vi.mocked(prisma.comment.delete).mockResolvedValue(mockComment as never);

        const response = await app.request('/social/comments/comment_1', {
          method: 'DELETE',
        });

        expect(response.status).toBe(200);
      });

      it('should reject deleting others comments', async () => {
        const mockComment = {
          id: 'comment_1',
          userId: 'other_user',
          content: 'Their comment',
        };

        vi.mocked(prisma.comment.findUnique).mockResolvedValue(mockComment as never);

        const response = await app.request('/social/comments/comment_1', {
          method: 'DELETE',
        });

        expect(response.status).toBe(403);
      });
    });
  });

  describe('Comparisons', () => {
    describe('POST /social/comparisons', () => {
      it('should create a comparison between two recipes', async () => {
        const mockRecipeA = { id: 'recipe_1', visibility: 'PUBLIC' };
        const mockRecipeB = { id: 'recipe_2', visibility: 'PUBLIC' };

        const mockComparison = {
          id: 'comparison_1',
          shareToken: 'abc123xyz',
          recipeAId: 'recipe_1',
          recipeBId: 'recipe_2',
          createdById: 'user_123',
          createdAt: new Date(),
        };

        vi.mocked(prisma.recipe.findUnique)
          .mockResolvedValueOnce(mockRecipeA as never)
          .mockResolvedValueOnce(mockRecipeB as never);
        vi.mocked(prisma.comparison.create).mockResolvedValue(mockComparison as never);

        const response = await app.request('/social/comparisons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipeAId: 'recipe_1',
            recipeBId: 'recipe_2',
          }),
        });

        expect(response.status).toBe(201);
        const body = await response.json() as ApiResponse;
        expect((body.data as { shareToken: string }).shareToken).toBeDefined();
      });

      it('should reject comparing same recipe', async () => {
        const response = await app.request('/social/comparisons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipeAId: 'recipe_1',
            recipeBId: 'recipe_1',
          }),
        });

        expect(response.status).toBe(400);
      });
    });

    describe('GET /social/comparisons/:token', () => {
      it('should return comparison by share token', async () => {
        const mockComparison = {
          id: 'comparison_1',
          shareToken: 'abc123xyz',
          recipeA: {
            id: 'recipe_1',
            currentVersion: { title: 'Recipe A' },
            user: { username: 'user1' },
          },
          recipeB: {
            id: 'recipe_2',
            currentVersion: { title: 'Recipe B' },
            user: { username: 'user2' },
          },
        };

        vi.mocked(prisma.comparison.findFirst).mockResolvedValue(mockComparison as never);

        const response = await app.request('/social/comparisons/abc123xyz');

        expect(response.status).toBe(200);
        const body = await response.json() as ApiResponse;
        expect((body.data as { recipeA: unknown }).recipeA).toBeDefined();
        expect((body.data as { recipeB: unknown }).recipeB).toBeDefined();
      });

      it('should return 404 for invalid token', async () => {
        vi.mocked(prisma.comparison.findFirst).mockResolvedValue(null);

        const response = await app.request('/social/comparisons/invalid-token');

        expect(response.status).toBe(404);
      });
    });
  });
});
