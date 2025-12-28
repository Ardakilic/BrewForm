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
  authMiddleware: vi.fn((_c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    _c.set('user', { id: 'user_123', isAdmin: false });
    return next();
  }),
  optionalAuth: vi.fn((_c: unknown, next: () => Promise<void>) => next()),
  requireAuth: vi.fn((_c: unknown, next: () => Promise<void>) => next()),
}));

// Mock database utilities
vi.mock('../../utils/database/index.js', () => ({
  getPrisma: vi.fn(),
  softDeleteFilter: vi.fn(() => ({ deletedAt: null })),
  getPagination: vi.fn(({ page = 1, limit = 20 }: { page?: number; limit?: number }) => ({
    skip: (page - 1) * limit,
    take: limit,
  })),
  createPaginationMeta: vi.fn((page: number, limit: number, total: number) => ({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  })),
}));

// Mock redis utilities
vi.mock('../../utils/redis/index.js', () => ({
  invalidateCache: vi.fn().mockResolvedValue(undefined),
  CacheKeys: {
    recipe: (id: string) => `recipe:${id}`,
    popularRecipes: () => 'recipes:popular',
  },
}));

// Mock logger
vi.mock('../../utils/logger/index.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
  logAudit: vi.fn(),
}));

// Error classes defined in mock below - these are for reference only
// The actual errors are thrown by the mocked module

// Mock error handler module
vi.mock('../../middleware/errorHandler.js', () => ({
  NotFoundError: class extends Error {
    statusCode = 404;
    code = 'NOT_FOUND';
    constructor(resource: string) { super(`${resource} not found`); this.name = 'NotFoundError'; }
  },
  ForbiddenError: class extends Error {
    statusCode = 403;
    code = 'FORBIDDEN';
    constructor(message: string) { super(message); this.name = 'ForbiddenError'; }
  },
  ConflictError: class extends Error {
    statusCode = 409;
    code = 'CONFLICT';
    constructor(message: string) { super(message); this.name = 'ConflictError'; }
  },
  BadRequestError: class extends Error {
    statusCode = 400;
    code = 'BAD_REQUEST';
    constructor(message: string) { super(message); this.name = 'BadRequestError'; }
  },
}));

import { getPrisma } from '../../utils/database/index.js';

// Simple error handler for tests
const testErrorHandler = (err: Error & { statusCode?: number; code?: string }, c: { json: (body: unknown, status: number) => Response }) => {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  return c.json({ success: false, error: { code, message: err.message } }, statusCode);
};

// Mock slug utility
vi.mock('../../utils/slug/index.js', () => ({
  createComparisonToken: vi.fn(() => 'abc123xyz'),
}));

// Create mock prisma instance
const mockPrisma = {
  recipe: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  userFavourite: {
    findUnique: vi.fn(),
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
    count: vi.fn(),
  },
  comparison: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
};

describe('Social Module', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    // Set up getPrisma to return our mock
    vi.mocked(getPrisma).mockReturnValue(mockPrisma as never);
    app = new Hono();
    app.route('/social', socialModule);
    // Attach error handler for proper error responses
    app.onError(testErrorHandler as never);
  });

  describe('Favourites', () => {
    describe('POST /social/favourites/:recipeId', () => {
      it('should add recipe to favourites', async () => {
        const mockRecipe = {
          id: 'clh1234567890abcdefghij01',
          visibility: 'PUBLIC',
        };

        const mockFavourite = {
          id: 'fav_1',
          userId: 'user_123',
          recipeId: 'clh1234567890abcdefghij01',
          createdAt: new Date(),
        };

        vi.mocked(mockPrisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);
        vi.mocked(mockPrisma.userFavourite.findUnique).mockResolvedValue(null);
        vi.mocked(mockPrisma.userFavourite.create).mockResolvedValue(mockFavourite as never);
        vi.mocked(mockPrisma.recipe.update).mockResolvedValue({} as never);

        const response = await app.request('/social/favourites/clh1234567890abcdefghij01', {
          method: 'POST',
        });

        expect(response.status).toBe(201);
      });

      it('should return 409 if already favourited', async () => {
        const mockRecipe = { id: 'clh1234567890abcdefghij01', visibility: 'PUBLIC' };
        const existingFavourite = { id: 'fav_1', userId: 'user_123', recipeId: 'clh1234567890abcdefghij01' };

        vi.mocked(mockPrisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);
        vi.mocked(mockPrisma.userFavourite.findUnique).mockResolvedValue(existingFavourite as never);

        const response = await app.request('/social/favourites/clh1234567890abcdefghij01', {
          method: 'POST',
        });

        expect(response.status).toBe(409);
      });

      it('should reject favouriting private recipes', async () => {
        const mockRecipe = { id: 'clh1234567890abcdefghij01', visibility: 'PRIVATE', userId: 'other_user' };

        vi.mocked(mockPrisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);

        const response = await app.request('/social/favourites/clh1234567890abcdefghij01', {
          method: 'POST',
        });

        expect(response.status).toBe(403);
      });
    });

    describe('DELETE /social/favourites/:recipeId', () => {
      it('should remove recipe from favourites', async () => {
        const mockFavourite = { id: 'fav_1', userId: 'user_123', recipeId: 'clh1234567890abcdefghij01' };

        vi.mocked(mockPrisma.userFavourite.findUnique).mockResolvedValue(mockFavourite as never);
        vi.mocked(mockPrisma.userFavourite.delete).mockResolvedValue(mockFavourite as never);
        vi.mocked(mockPrisma.recipe.update).mockResolvedValue({} as never);

        const response = await app.request('/social/favourites/clh1234567890abcdefghij01', {
          method: 'DELETE',
        });

        expect(response.status).toBe(200);
      });

      it('should return 404 if not favourited', async () => {
        vi.mocked(mockPrisma.userFavourite.findUnique).mockResolvedValue(null);

        const response = await app.request('/social/favourites/clh1234567890abcdefghij01', {
          method: 'DELETE',
        });

        expect(response.status).toBe(404);
      });
    });
  });

  describe('Comments', () => {
    describe('GET /social/recipes/:recipeId/comments', () => {
      it('should return comments for a recipe', async () => {
        const mockRecipe = { id: 'clh1234567890abcdefghij01', visibility: 'PUBLIC', userId: 'user_456' };
        const mockComments = [
          {
            id: 'comment_1',
            content: 'Great recipe!',
            userId: 'user_789',
            createdAt: new Date(),
            user: { username: 'coffeeenthusiast', displayName: 'Coffee Enthusiast' },
            replies: [],
          },
          {
            id: 'comment_2',
            content: 'Tried this, worked perfectly!',
            userId: 'user_790',
            createdAt: new Date(),
            user: { username: 'barista', displayName: 'Barista' },
            replies: [],
          },
        ];

        vi.mocked(mockPrisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);
        vi.mocked(mockPrisma.comment.findMany).mockResolvedValue(mockComments as never);
        vi.mocked(mockPrisma.comment.count).mockResolvedValue(2);

        const response = await app.request('/social/recipes/clh1234567890abcdefghij01/comments');

        expect(response.status).toBe(200);
        const body = await response.json() as ApiResponse;
        expect(body.data).toHaveLength(2);
      });

      it('should reject viewing comments on private recipes', async () => {
        const mockRecipe = { id: 'clh1234567890abcdefghij01', visibility: 'PRIVATE', userId: 'other_user' };

        vi.mocked(mockPrisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);

        const response = await app.request('/social/recipes/clh1234567890abcdefghij01/comments');

        expect(response.status).toBe(403);
      });
    });

    describe('POST /social/recipes/:recipeId/comments', () => {
      it('should add a comment to a recipe', async () => {
        const recipeId = 'clh1234567890abcdefghij01';
        const mockRecipe = { id: recipeId, visibility: 'PUBLIC' };
        const mockComment = {
          id: 'clh1234567890abcdefghij99',
          content: 'Amazing recipe!',
          userId: 'user_123',
          recipeId,
          createdAt: new Date(),
        };

        vi.mocked(mockPrisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);
        vi.mocked(mockPrisma.comment.create).mockResolvedValue(mockComment as never);

        const response = await app.request(`/social/recipes/${recipeId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Amazing recipe!' }),
        });

        expect(response.status).toBe(201);
      });

      it('should validate comment content', async () => {
        const recipeId = 'clh1234567890abcdefghij01';
        const response = await app.request(`/social/recipes/${recipeId}/comments`, {
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

        vi.mocked(mockPrisma.comment.findUnique).mockResolvedValue(mockComment as never);
        vi.mocked(mockPrisma.comment.delete).mockResolvedValue(mockComment as never);

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

        vi.mocked(mockPrisma.comment.findUnique).mockResolvedValue(mockComment as never);

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
        const recipeAId = 'clh1234567890abcdefghij01';
        const recipeBId = 'clh1234567890abcdefghij02';
        const mockRecipeA = { id: recipeAId, visibility: 'PUBLIC' };
        const mockRecipeB = { id: recipeBId, visibility: 'PUBLIC' };

        const mockComparison = {
          id: 'clh1234567890abcdefghij03',
          shareToken: 'abc123xyz',
          recipeAId,
          recipeBId,
          createdById: 'user_123',
          createdAt: new Date(),
        };

        vi.mocked(mockPrisma.recipe.findUnique)
          .mockResolvedValueOnce(mockRecipeA as never)
          .mockResolvedValueOnce(mockRecipeB as never);
        vi.mocked(mockPrisma.comparison.create).mockResolvedValue(mockComparison as never);

        const response = await app.request('/social/comparisons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipeAId,
            recipeBId,
          }),
        });

        expect(response.status).toBe(201);
        const body = await response.json() as ApiResponse;
        expect((body.data as { shareToken: string }).shareToken).toBeDefined();
      });

      it('should reject comparing same recipe', async () => {
        const sameRecipeId = 'clh1234567890abcdefghij01';
        const response = await app.request('/social/comparisons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipeAId: sameRecipeId,
            recipeBId: sameRecipeId,
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
            id: 'clh1234567890abcdefghij01',
            visibility: 'PUBLIC',
            currentVersion: { title: 'Recipe A' },
            user: { username: 'user1' },
          },
          recipeB: {
            id: 'clh1234567890abcdefghij02',
            visibility: 'PUBLIC',
            currentVersion: { title: 'Recipe B' },
            user: { username: 'user2' },
          },
        };

        vi.mocked(mockPrisma.comparison.findUnique).mockResolvedValue(mockComparison as never);

        const response = await app.request('/social/comparisons/abc123xyz');

        expect(response.status).toBe(200);
        const body = await response.json() as ApiResponse;
        expect((body.data as { recipeA: unknown }).recipeA).toBeDefined();
        expect((body.data as { recipeB: unknown }).recipeB).toBeDefined();
      });

      it('should return 404 for invalid token', async () => {
        vi.mocked(mockPrisma.comparison.findUnique).mockResolvedValue(null);

        const response = await app.request('/social/comparisons/invalid-token');

        expect(response.status).toBe(404);
      });
    });
  });
});
