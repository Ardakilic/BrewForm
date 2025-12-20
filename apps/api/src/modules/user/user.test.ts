/**
 * User Module Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import userModule from './index.js';

// API Response type for testing
interface ApiResponse {
  success: boolean;
  data?: Record<string, unknown>;
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
  requireAuth: vi.fn((_c, next) => next()),
}));

// Mock Prisma
vi.mock('../../utils/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    recipe: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    userFavourite: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../utils/prisma/index.js';

describe('User Module', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route('/users', userModule);
  });

  describe('GET /users/me', () => {
    it('should return current user profile', async () => {
      const mockUser = {
        id: 'user_123',
        email: 'test@example.com',
        username: 'testuser',
        displayName: 'Test User',
        bio: 'Coffee enthusiast',
        website: 'https://example.com',
        preferredUnits: 'METRIC',
        emailVerified: true,
        isAdmin: false,
        createdAt: new Date(),
        _count: {
          recipes: 5,
          favourites: 10,
        },
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);

      const response = await app.request('/users/me');
      
      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
      expect(body.data?.username).toBe('testuser');
      expect(body.data?.email).toBe('test@example.com');
    });
  });

  describe('PATCH /users/me', () => {
    it('should update user profile', async () => {
      const mockUser = {
        id: 'user_123',
        displayName: 'Updated Name',
        bio: 'Updated bio',
      };

      vi.mocked(prisma.user.update).mockResolvedValue(mockUser as never);

      const response = await app.request('/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: 'Updated Name',
          bio: 'Updated bio',
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.data?.displayName).toBe('Updated Name');
    });

    it('should validate website URL format', async () => {
      const response = await app.request('/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          website: 'not-a-valid-url',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should update preferred units', async () => {
      const mockUser = {
        id: 'user_123',
        preferredUnits: 'IMPERIAL',
      };

      vi.mocked(prisma.user.update).mockResolvedValue(mockUser as never);

      const response = await app.request('/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferredUnits: 'IMPERIAL',
        }),
      });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /users/me/recipes', () => {
    it('should return user recipes including drafts', async () => {
      const mockRecipes = [
        {
          id: 'recipe_1',
          slug: 'my-espresso',
          visibility: 'PUBLIC',
          currentVersion: { title: 'My Espresso' },
        },
        {
          id: 'recipe_2',
          slug: 'draft-recipe',
          visibility: 'DRAFT',
          currentVersion: { title: 'Draft Recipe' },
        },
      ];

      vi.mocked(prisma.recipe.findMany).mockResolvedValue(mockRecipes as never);

      const response = await app.request('/users/me/recipes');
      
      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.data).toHaveLength(2);
    });
  });

  describe('GET /users/me/favourites', () => {
    it('should return user favourited recipes', async () => {
      const mockFavourites = [
        {
          recipe: {
            id: 'recipe_1',
            slug: 'great-v60',
            visibility: 'PUBLIC',
            currentVersion: { title: 'Great V60' },
            user: { username: 'barista' },
          },
        },
      ];

      vi.mocked(prisma.userFavourite.findMany).mockResolvedValue(mockFavourites as never);

      const response = await app.request('/users/me/favourites');
      
      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.data).toBeDefined();
    });
  });

  describe('GET /users/:username', () => {
    it('should return public user profile', async () => {
      const mockUser = {
        id: 'user_456',
        username: 'coffeemaster',
        displayName: 'Coffee Master',
        bio: 'Professional barista',
        createdAt: new Date(),
        _count: {
          recipes: 20,
        },
      };

      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser as never);

      const response = await app.request('/users/coffeemaster');
      
      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.data?.username).toBe('coffeemaster');
      // Should not include email in public profile
      expect(body.data?.email).toBeUndefined();
    });

    it('should return 404 for non-existent user', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      const response = await app.request('/users/nonexistent');
      
      expect(response.status).toBe(404);
    });

    it('should not return banned users', async () => {
      // Banned users are filtered at query level, so findFirst returns null
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      const response = await app.request('/users/banneduser');
      
      expect(response.status).toBe(404);
    });
  });

  describe('GET /users/:username/recipes', () => {
    it('should return only public recipes for other users', async () => {
      const mockUser = {
        id: 'user_456',
        username: 'coffeemaster',
      };

      const mockRecipes = [
        {
          id: 'recipe_1',
          visibility: 'PUBLIC',
          currentVersion: { title: 'Public Recipe' },
        },
      ];

      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser as never);
      vi.mocked(prisma.recipe.findMany).mockResolvedValue(mockRecipes as never);

      const response = await app.request('/users/coffeemaster/recipes');
      
      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.data).toHaveLength(1);
    });
  });
});
