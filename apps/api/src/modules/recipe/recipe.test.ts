/**
 * Recipe Module Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import recipeModule from './index.js';

// API Response type for testing
interface ApiResponse {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
  message?: string;
  pagination?: { page: number; limit: number; total: number; pages: number };
}

// Mock auth middleware
vi.mock('../../middleware/auth', () => ({
  authMiddleware: vi.fn((_c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    _c.set('user', { id: 'user_123', isAdmin: false });
    return next();
  }),
  requireAuth: vi.fn((_c: unknown, next: () => Promise<void>) => next()),
  optionalAuth: vi.fn((_c: unknown, next: () => Promise<void>) => next()),
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
    hasNext: page < Math.ceil(total / limit),
    hasPrev: page > 1,
  })),
}));

// Mock redis utilities
vi.mock('../../utils/redis/index.js', () => ({
  invalidateCache: vi.fn(),
  cacheGetOrSet: vi.fn((_key: string, fetcher: () => Promise<unknown>) => fetcher()),
  CacheKeys: {
    recipe: (id: string) => `recipe:${id}`,
    recipeBySlug: (slug: string) => `recipe:slug:${slug}`,
    recipeList: (filters: string) => `recipes:list:${filters}`,
    latestRecipes: () => 'recipes:latest',
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

// Mock slug utility
vi.mock('../../utils/slug/index.js', () => ({
  createRecipeSlug: vi.fn((title: string) => title.toLowerCase().replace(/\s+/g, '-')),
}));

// Mock units utility
vi.mock('../../utils/units/index.js', () => ({
  calculateBrewRatio: vi.fn((dose: number, yieldGrams: number) => yieldGrams / dose),
  calculateFlowRate: vi.fn((yieldMl: number, timeSec: number) => yieldMl / timeSec),
}));

// Mock error handler
vi.mock('../../middleware/errorHandler.js', () => ({
  NotFoundError: class NotFoundError extends Error {
    constructor(resource: string) {
      super(`${resource} not found`);
      this.name = 'NotFoundError';
    }
    statusCode = 404;
  },
  ForbiddenError: class ForbiddenError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ForbiddenError';
    }
    statusCode = 403;
  },
  ValidationError: class ValidationError extends Error {
    constructor(_errors: Array<{ field: string; message: string }>) {
      super('Validation failed');
      this.name = 'ValidationError';
    }
    statusCode = 422;
  },
}));

// Mock rate limiter
vi.mock('../../middleware/rateLimit.js', () => ({
  writeRateLimiter: vi.fn((_c: unknown, next: () => Promise<void>) => next()),
}));

import { getPrisma } from '../../utils/database/index.js';
import type { Context } from 'hono';

// Test error handler
const testErrorHandler = (err: Error & { statusCode?: number }, c: Context) => {
  const statusCode = err.statusCode || 500;
  const code = err.name === 'NotFoundError' ? 'NOT_FOUND' 
    : err.name === 'ForbiddenError' ? 'FORBIDDEN'
    : err.name === 'ValidationError' ? 'VALIDATION_ERROR'
    : 'INTERNAL_ERROR';
  return c.json({ success: false, error: { code, message: err.message } }, statusCode as 400 | 403 | 404 | 422 | 500);
};

// Create mock prisma instance
const mockPrisma = {
  recipe: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  recipeVersion: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  userFavourite: {
    findFirst: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) => callback(mockPrisma)),
};

describe('Recipe Module', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    // Set up getPrisma to return our mock
    vi.mocked(getPrisma).mockReturnValue(mockPrisma as never);
    app = new Hono();
    app.route('/recipes', recipeModule);
    app.onError(testErrorHandler);
  });

  describe('GET /recipes', () => {
    it('should return paginated public recipes', async () => {
      const mockRecipes = [
        {
          id: 'recipe_1',
          slug: 'perfect-espresso',
          visibility: 'PUBLIC',
          currentVersion: {
            title: 'Perfect Espresso',
            brewMethod: 'ESPRESSO_MACHINE',
            drinkType: 'ESPRESSO',
            doseGrams: 18,
            yieldGrams: 36,
          },
          user: { username: 'coffeemaster', displayName: 'Coffee Master' },
        },
        {
          id: 'recipe_2',
          slug: 'morning-v60',
          visibility: 'PUBLIC',
          currentVersion: {
            title: 'Morning V60',
            brewMethod: 'POUR_OVER_V60',
            drinkType: 'POUR_OVER',
            doseGrams: 15,
          },
          user: { username: 'barista', displayName: 'Barista' },
        },
      ];

      vi.mocked(mockPrisma.recipe.findMany).mockResolvedValue(mockRecipes as never);
      vi.mocked(mockPrisma.recipe.count).mockResolvedValue(2);

      const response = await app.request('/recipes?visibility=PUBLIC');
      
      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.pagination).toBeDefined();
    });

    it('should filter by brew method', async () => {
      vi.mocked(mockPrisma.recipe.findMany).mockResolvedValue([]);
      vi.mocked(mockPrisma.recipe.count).mockResolvedValue(0);

      const response = await app.request('/recipes?brewMethod=ESPRESSO_MACHINE');
      
      expect(response.status).toBe(200);
      expect(mockPrisma.recipe.findMany).toHaveBeenCalled();
    });
  });

  describe('GET /recipes/:slug', () => {
    it('should return a recipe by slug', async () => {
      const fullRecipe = {
        id: 'recipe_1',
        slug: 'perfect-espresso',
        visibility: 'PUBLIC',
        userId: 'user_456',
        currentVersion: {
          id: 'version_1',
          title: 'Perfect Espresso',
          brewMethod: 'ESPRESSO_MACHINE',
          drinkType: 'ESPRESSO',
          doseGrams: 18,
          yieldGrams: 36,
          brewTimeSec: 28,
          description: 'My perfect morning espresso',
        },
        user: { username: 'coffeemaster', displayName: 'Coffee Master' },
        _count: { versions: 1, forks: 0, comments: 0 },
      };

      // First call for slug lookup, second call for full recipe fetch
      vi.mocked(mockPrisma.recipe.findUnique)
        .mockResolvedValueOnce({ id: 'recipe_1', slug: 'perfect-espresso' } as never)
        .mockResolvedValueOnce(fullRecipe as never);
      vi.mocked(mockPrisma.recipe.update).mockResolvedValue({} as never);

      const response = await app.request('/recipes/perfect-espresso');
      
      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
      expect((body.data as { slug: string }).slug).toBe('perfect-espresso');
      expect((body.data as { currentVersion: { title: string } }).currentVersion.title).toBe('Perfect Espresso');
    });

    it('should return 404 for non-existent recipe', async () => {
      vi.mocked(mockPrisma.recipe.findUnique).mockResolvedValueOnce(null);

      const response = await app.request('/recipes/nonexistent-recipe');
      
      expect(response.status).toBe(404);
    });
  });

  describe('POST /recipes', () => {
    it('should create a new recipe', async () => {
      const mockCreatedRecipe = {
        id: 'recipe_new',
        slug: 'my-new-espresso',
        visibility: 'DRAFT',
        userId: 'user_123',
        versions: [{ id: 'version_1' }],
        user: { id: 'user_123', username: 'testuser', displayName: 'Test User', avatarUrl: null },
      };
      
      const mockUpdatedRecipe = {
        id: 'recipe_new',
        slug: 'my-new-espresso',
        visibility: 'DRAFT',
        userId: 'user_123',
        currentVersionId: 'version_1',
        currentVersion: {
          id: 'version_1',
          title: 'My New Espresso',
          brewMethod: 'ESPRESSO_MACHINE',
          drinkType: 'ESPRESSO',
          doseGrams: 18,
          yieldGrams: 36,
        },
        user: { id: 'user_123', username: 'testuser', displayName: 'Test User', avatarUrl: null },
      };

      vi.mocked(mockPrisma.recipe.create).mockResolvedValue(mockCreatedRecipe as never);
      vi.mocked(mockPrisma.recipe.update).mockResolvedValue(mockUpdatedRecipe as never);

      const response = await app.request('/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibility: 'DRAFT',
          version: {
            title: 'My New Espresso',
            brewMethod: 'ESPRESSO_MACHINE',
            drinkType: 'ESPRESSO',
            doseGrams: 18,
            yieldGrams: 36,
          },
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
    });

    it('should create a recipe with pressure field', async () => {
      const mockCreatedRecipe = {
        id: 'recipe_pressure',
        slug: 'espresso-with-pressure',
        visibility: 'DRAFT',
        userId: 'user_123',
        versions: [{ id: 'version_1' }],
        user: { id: 'user_123', username: 'testuser', displayName: 'Test User', avatarUrl: null },
      };
      
      const mockUpdatedRecipe = {
        id: 'recipe_pressure',
        slug: 'espresso-with-pressure',
        visibility: 'DRAFT',
        userId: 'user_123',
        currentVersionId: 'version_1',
        currentVersion: {
          id: 'version_1',
          title: 'Espresso with Pressure',
          brewMethod: 'ESPRESSO_MACHINE',
          drinkType: 'ESPRESSO',
          doseGrams: 18,
          yieldGrams: 36,
          pressure: '9',
        },
        user: { id: 'user_123', username: 'testuser', displayName: 'Test User', avatarUrl: null },
      };

      vi.mocked(mockPrisma.recipe.create).mockResolvedValue(mockCreatedRecipe as never);
      vi.mocked(mockPrisma.recipe.update).mockResolvedValue(mockUpdatedRecipe as never);

      const response = await app.request('/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibility: 'DRAFT',
          version: {
            title: 'Espresso with Pressure',
            brewMethod: 'ESPRESSO_MACHINE',
            drinkType: 'ESPRESSO',
            doseGrams: 18,
            yieldGrams: 36,
            pressure: '9',
          },
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
    });

    it('should accept variable pressure values', async () => {
      const mockCreatedRecipe = {
        id: 'recipe_variable_pressure',
        slug: 'gagguino-espresso',
        visibility: 'DRAFT',
        userId: 'user_123',
        versions: [{ id: 'version_1' }],
        user: { id: 'user_123', username: 'testuser', displayName: 'Test User', avatarUrl: null },
      };

      vi.mocked(mockPrisma.recipe.create).mockResolvedValue(mockCreatedRecipe as never);
      vi.mocked(mockPrisma.recipe.update).mockResolvedValue({} as never);

      const response = await app.request('/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibility: 'DRAFT',
          version: {
            title: 'Gagguino Espresso',
            brewMethod: 'ESPRESSO_MACHINE',
            drinkType: 'ESPRESSO',
            doseGrams: 18,
            yieldGrams: 36,
            pressure: '6-9',
          },
        }),
      });

      expect(response.status).toBe(201);
    });

    it('should validate required fields', async () => {
      const response = await app.request('/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibility: 'PUBLIC',
          version: {
            // Missing required fields
          },
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /recipes/:id', () => {
    it('should update recipe visibility', async () => {
      const recipeId = 'clh1234567890abcdefghij01';
      const mockRecipe = {
        id: recipeId,
        userId: 'user_123',
        visibility: 'DRAFT',
      };

      vi.mocked(mockPrisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);
      vi.mocked(mockPrisma.recipe.update).mockResolvedValue({
        ...mockRecipe,
        visibility: 'PUBLIC',
      } as never);

      const response = await app.request(`/recipes/${recipeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibility: 'PUBLIC',
        }),
      });

      expect(response.status).toBe(200);
    });

    it('should reject update by non-owner', async () => {
      const recipeId = 'clh1234567890abcdefghij01';
      const mockRecipe = {
        id: recipeId,
        userId: 'other_user', // Different from auth user
        visibility: 'DRAFT',
      };

      vi.mocked(mockPrisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);

      const response = await app.request(`/recipes/${recipeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibility: 'PUBLIC',
        }),
      });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /recipes/:id', () => {
    it('should soft delete recipe (owner)', async () => {
      const recipeId = 'clh1234567890abcdefghij01';
      const mockRecipe = {
        id: recipeId,
        userId: 'user_123',
      };

      vi.mocked(mockPrisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);
      vi.mocked(mockPrisma.recipe.update).mockResolvedValue({
        ...mockRecipe,
        deletedAt: new Date(),
      } as never);

      const response = await app.request(`/recipes/${recipeId}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(200);
    });

    it('should reject delete by non-owner', async () => {
      const recipeId = 'clh1234567890abcdefghij01';
      const mockRecipe = {
        id: recipeId,
        userId: 'other_user',
      };

      vi.mocked(mockPrisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);

      const response = await app.request(`/recipes/${recipeId}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /recipes/:id/versions', () => {
    it('should create a new version', async () => {
      const recipeId = 'clh1234567890abcdefghij01';
      const mockRecipe = {
        id: recipeId,
        userId: 'user_123',
        currentVersionId: 'version_1',
        versions: [{ versionNumber: 1 }],
      };

      const mockNewVersion = {
        id: 'version_2',
        recipeId,
        versionNumber: 2,
        title: 'Updated Espresso',
        brewMethod: 'ESPRESSO_MACHINE',
        drinkType: 'ESPRESSO',
        doseGrams: 18,
        yieldGrams: 40,
      };

      vi.mocked(mockPrisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);
      vi.mocked(mockPrisma.recipeVersion.create).mockResolvedValue(mockNewVersion as never);
      vi.mocked(mockPrisma.recipe.update).mockResolvedValue({} as never);

      const response = await app.request(`/recipes/${recipeId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Updated Espresso',
          brewMethod: 'ESPRESSO_MACHINE',
          drinkType: 'ESPRESSO',
          doseGrams: 18,
          yieldGrams: 40,
        }),
      });

      expect(response.status).toBe(201);
    });
  });

  describe('POST /recipes/:id/fork', () => {
    it('should fork a public recipe', async () => {
      const originalRecipeId = 'clh1234567890abcdefghij01';
      const mockOriginalRecipe = {
        id: originalRecipeId,
        userId: 'other_user',
        visibility: 'PUBLIC',
        currentVersion: {
          id: 'version_1',
          title: 'Original Espresso',
          description: 'A great espresso',
          brewMethod: 'ESPRESSO_MACHINE',
          drinkType: 'ESPRESSO',
          coffeeId: null,
          coffeeName: null,
          roastDate: null,
          grindDate: null,
          grinderId: null,
          brewerId: null,
          portafilterId: null,
          basketId: null,
          puckScreenId: null,
          paperFilterId: null,
          tamperId: null,
          grindSize: null,
          doseGrams: 18,
          yieldMl: null,
          yieldGrams: 36,
          brewTimeSec: 28,
          tempCelsius: 93,
          pressure: '9',
          brewRatio: 2.0,
          flowRate: null,
          preparations: null,
          tastingNotes: null,
          rating: null,
          emojiRating: null,
          isFavourite: false,
          tags: [],
        },
      };

      const mockForkedRecipe = {
        id: 'clh1234567890abcdefghij02',
        slug: 'forked-original-espresso',
        userId: 'user_123',
        forkedFromId: originalRecipeId,
        versions: [{ id: 'new_version_1' }],
      };

      vi.mocked(mockPrisma.recipe.findUnique).mockResolvedValue(mockOriginalRecipe as never);
      vi.mocked(mockPrisma.recipe.create).mockResolvedValue(mockForkedRecipe as never);
      vi.mocked(mockPrisma.recipe.update).mockResolvedValue({} as never);

      const response = await app.request(`/recipes/${originalRecipeId}/fork`, {
        method: 'POST',
      });

      expect(response.status).toBe(201);
    });

    it('should reject forking private recipes', async () => {
      const recipeId = 'clh1234567890abcdefghij03';
      const mockRecipe = {
        id: recipeId,
        userId: 'other_user',
        visibility: 'PRIVATE',
        currentVersion: {
          id: 'version_1',
          title: 'Private Recipe',
        },
      };

      vi.mocked(mockPrisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);

      const response = await app.request(`/recipes/${recipeId}/fork`, {
        method: 'POST',
      });

      expect(response.status).toBe(403);
    });
  });
});
