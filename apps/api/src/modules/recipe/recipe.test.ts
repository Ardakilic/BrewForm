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
  authMiddleware: vi.fn((_c, next) => {
    _c.set('user', { id: 'user_123', isAdmin: false });
    return next();
  }),
  optionalAuth: vi.fn((_c, next) => next()),
}));

// Mock Prisma
vi.mock('../../utils/prisma', () => ({
  prisma: {
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
    favourite: {
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback({
      recipe: {
        create: vi.fn(),
        update: vi.fn(),
      },
      recipeVersion: {
        create: vi.fn(),
      },
    })),
  },
}));

vi.mock('../../utils/redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

import { prisma } from '../../utils/prisma/index.js';

describe('Recipe Module', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route('/recipes', recipeModule);
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

      vi.mocked(prisma.recipe.findMany).mockResolvedValue(mockRecipes as never);
      vi.mocked(prisma.recipe.count).mockResolvedValue(2);

      const response = await app.request('/recipes?visibility=PUBLIC');
      
      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.pagination).toBeDefined();
    });

    it('should filter by brew method', async () => {
      vi.mocked(prisma.recipe.findMany).mockResolvedValue([]);
      vi.mocked(prisma.recipe.count).mockResolvedValue(0);

      const response = await app.request('/recipes?brewMethod=ESPRESSO_MACHINE');
      
      expect(response.status).toBe(200);
      expect(prisma.recipe.findMany).toHaveBeenCalled();
    });
  });

  describe('GET /recipes/:slug', () => {
    it('should return a recipe by slug', async () => {
      const mockRecipe = {
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
        _count: { favourites: 5 },
      };

      vi.mocked(prisma.recipe.findFirst).mockResolvedValue(mockRecipe as never);

      const response = await app.request('/recipes/perfect-espresso');
      
      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
      expect((body.data as { slug: string }).slug).toBe('perfect-espresso');
      expect((body.data as { currentVersion: { title: string } }).currentVersion.title).toBe('Perfect Espresso');
    });

    it('should return 404 for non-existent recipe', async () => {
      vi.mocked(prisma.recipe.findFirst).mockResolvedValue(null);

      const response = await app.request('/recipes/nonexistent-recipe');
      
      expect(response.status).toBe(404);
    });
  });

  describe('POST /recipes', () => {
    it('should create a new recipe', async () => {
      const mockRecipe = {
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
      };

      vi.mocked(prisma.$transaction).mockImplementation(async () => {
        return mockRecipe;
      });

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
      const mockRecipe = {
        id: 'recipe_1',
        userId: 'user_123',
        visibility: 'DRAFT',
      };

      vi.mocked(prisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);
      vi.mocked(prisma.recipe.update).mockResolvedValue({
        ...mockRecipe,
        visibility: 'PUBLIC',
      } as never);

      const response = await app.request('/recipes/recipe_1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibility: 'PUBLIC',
        }),
      });

      expect(response.status).toBe(200);
    });

    it('should reject update by non-owner', async () => {
      const mockRecipe = {
        id: 'recipe_1',
        userId: 'other_user', // Different from auth user
        visibility: 'DRAFT',
      };

      vi.mocked(prisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);

      const response = await app.request('/recipes/recipe_1', {
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
      const mockRecipe = {
        id: 'recipe_1',
        userId: 'user_123',
      };

      vi.mocked(prisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);
      vi.mocked(prisma.recipe.update).mockResolvedValue({
        ...mockRecipe,
        deletedAt: new Date(),
      } as never);

      const response = await app.request('/recipes/recipe_1', {
        method: 'DELETE',
      });

      expect(response.status).toBe(200);
    });

    it('should reject delete by non-owner', async () => {
      const mockRecipe = {
        id: 'recipe_1',
        userId: 'other_user',
      };

      vi.mocked(prisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);

      const response = await app.request('/recipes/recipe_1', {
        method: 'DELETE',
      });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /recipes/:id/versions', () => {
    it('should create a new version', async () => {
      const mockRecipe = {
        id: 'recipe_1',
        userId: 'user_123',
        currentVersionId: 'version_1',
      };

      const mockNewVersion = {
        id: 'version_2',
        recipeId: 'recipe_1',
        versionNumber: 2,
        title: 'Updated Espresso',
        brewMethod: 'ESPRESSO_MACHINE',
        drinkType: 'ESPRESSO',
        doseGrams: 18,
        yieldGrams: 40,
      };

      vi.mocked(prisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);
      vi.mocked(prisma.recipeVersion.findMany).mockResolvedValue([{ versionNumber: 1 }] as never);
      vi.mocked(prisma.$transaction).mockImplementation(async () => mockNewVersion);

      const response = await app.request('/recipes/recipe_1/versions', {
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
      const mockOriginalRecipe = {
        id: 'recipe_original',
        userId: 'other_user',
        visibility: 'PUBLIC',
        currentVersion: {
          title: 'Original Espresso',
          brewMethod: 'ESPRESSO_MACHINE',
          drinkType: 'ESPRESSO',
          doseGrams: 18,
          yieldGrams: 36,
        },
      };

      const mockForkedRecipe = {
        id: 'recipe_forked',
        slug: 'forked-original-espresso',
        userId: 'user_123',
        forkedFromId: 'recipe_original',
      };

      vi.mocked(prisma.recipe.findUnique).mockResolvedValue(mockOriginalRecipe as never);
      vi.mocked(prisma.$transaction).mockImplementation(async () => mockForkedRecipe);

      const response = await app.request('/recipes/recipe_original/fork', {
        method: 'POST',
      });

      expect(response.status).toBe(201);
    });

    it('should reject forking private recipes', async () => {
      const mockRecipe = {
        id: 'recipe_1',
        userId: 'other_user',
        visibility: 'PRIVATE',
      };

      vi.mocked(prisma.recipe.findUnique).mockResolvedValue(mockRecipe as never);

      const response = await app.request('/recipes/recipe_1/fork', {
        method: 'POST',
      });

      expect(response.status).toBe(403);
    });
  });
});
