/**
 * User Module Tests
 */

import { describe, it, beforeEach } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import { mockFn } from '../../test/mock-fn.ts';
import { setPrisma } from '../../test/mocks/database.ts';

// API Response type for testing
interface ApiResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
  message?: string;
  pagination?: { page: number; limit: number; total: number; pages: number };
}

import userModule from './index.ts';

// Simple error handler for tests
const testErrorHandler = (err: Error, c: { json: (body: unknown, status: number) => Response }) => {
  if (err.name === 'NotFoundError') {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: err.message } }, 404);
  }
  return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
};

// Create mock prisma instance factory
const createLocalMockPrisma = () => ({
  user: {
    findUnique: mockFn(),
    findFirst: mockFn(),
    findMany: mockFn(),
    update: mockFn(),
    count: mockFn(),
  },
  recipe: {
    findMany: mockFn(),
    count: mockFn(),
  },
  userFavourite: {
    findMany: mockFn(),
    count: mockFn(),
  },
  session: {
    deleteMany: mockFn(),
  },
});

describe('User Module', () => {
  let app: Hono;
  let mockPrisma: ReturnType<typeof createLocalMockPrisma>;

  beforeEach(() => {
    mockPrisma = createLocalMockPrisma();
    setPrisma(mockPrisma);
    app = new Hono();
    app.route('/users', userModule);
    app.onError(testErrorHandler as never);
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

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

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
        email: 'test@example.com',
        username: 'testuser',
        displayName: 'Updated Name',
        avatarUrl: null,
        bio: 'Updated bio',
        website: null,
        isAdmin: false,
        emailVerified: true,
        preferredLocale: 'en',
        preferredTimezone: 'UTC',
        preferredUnits: 'METRIC',
        preferredTheme: 'SYSTEM',
        createdAt: new Date(),
        _count: { recipes: 5, favourites: 10 },
      };

      mockPrisma.user.update.mockResolvedValue(mockUser);

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
        email: 'test@example.com',
        username: 'testuser',
        displayName: 'Test User',
        avatarUrl: null,
        bio: null,
        website: null,
        isAdmin: false,
        emailVerified: true,
        preferredLocale: 'en',
        preferredTimezone: 'UTC',
        preferredUnits: 'IMPERIAL',
        preferredTheme: 'SYSTEM',
        createdAt: new Date(),
        _count: { recipes: 5, favourites: 10 },
      };

      mockPrisma.user.update.mockResolvedValue(mockUser);

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

      mockPrisma.recipe.findMany.mockResolvedValue(mockRecipes);
      mockPrisma.recipe.count.mockResolvedValue(2);

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

      mockPrisma.userFavourite.findMany.mockResolvedValue(mockFavourites);
      mockPrisma.userFavourite.count.mockResolvedValue(1);

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

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);

      const response = await app.request('/users/coffeemaster');
      
      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.data?.username).toBe('coffeemaster');
      // Should not include email in public profile
      expect(body.data?.email).toBeUndefined();
    });

    it('should return 404 for non-existent user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const response = await app.request('/users/nonexistent');
      
      expect(response.status).toBe(404);
    });

    it('should not return banned users', async () => {
      // Banned users are filtered at query level, so findFirst returns null
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const response = await app.request('/users/banneduser');
      
      expect(response.status).toBe(404);
    });
  });

  describe('GET /users/:username/recipes', () => {
    it('should return only public recipes for other users', async () => {
      const mockUser = {
        id: 'user_456',
        username: 'coffeemaster',
        displayName: 'Coffee Master',
        avatarUrl: null,
        bio: 'Professional barista',
        website: null,
        createdAt: new Date(),
        _count: { recipes: 10 },
      };

      const mockRecipes = [
        {
          id: 'recipe_1',
          visibility: 'PUBLIC',
          currentVersion: { title: 'Public Recipe' },
        },
      ];

      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      mockPrisma.recipe.findMany.mockResolvedValue(mockRecipes);
      mockPrisma.recipe.count.mockResolvedValue(1);

      const response = await app.request('/users/coffeemaster/recipes');
      
      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.data).toHaveLength(1);
    });
  });

  describe('DELETE /users/me', () => {
    it('should soft delete user account', async () => {
      mockPrisma.user.update.mockResolvedValue({ id: 'user_123' });
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 2 });

      const response = await app.request('/users/me', {
        method: 'DELETE',
      });

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
      expect(mockPrisma.user.update.calls[0]).toEqual([
        expect.objectContaining({
          where: { id: 'user_123' },
          data: { deletedAt: expect.any(Date) },
        })
      ]);
      expect(mockPrisma.session.deleteMany.calls[0]).toEqual([{
        where: { userId: 'user_123' },
      }]);
    });
  });

  describe('GET /users', () => {
    it('should list all public users', async () => {
      const mockUsers = [
        {
          id: 'user_1',
          username: 'barista1',
          displayName: 'Barista One',
          avatarUrl: null,
          bio: 'Coffee lover',
          website: null,
          createdAt: new Date(),
          _count: { recipes: 5 },
        },
        {
          id: 'user_2',
          username: 'barista2',
          displayName: 'Barista Two',
          avatarUrl: null,
          bio: null,
          website: null,
          createdAt: new Date(),
          _count: { recipes: 3 },
        },
      ];

      mockPrisma.user.findMany.mockResolvedValue(mockUsers);
      mockPrisma.user.count.mockResolvedValue(2);

      const response = await app.request('/users');

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    });

    it('should filter users by search term', async () => {
      const mockUsers = [
        {
          id: 'user_1',
          username: 'coffeemaster',
          displayName: 'Coffee Master',
          avatarUrl: null,
          bio: null,
          website: null,
          createdAt: new Date(),
          _count: { recipes: 10 },
        },
      ];

      mockPrisma.user.findMany.mockResolvedValue(mockUsers);
      mockPrisma.user.count.mockResolvedValue(1);

      const response = await app.request('/users?search=coffee');

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
    });

    it('should return empty list when no users match', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      const response = await app.request('/users?search=nonexistent');

      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.success).toBe(true);
    });
  });

  describe('GET /users/me - edge cases', () => {
    it('should return 404 when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const response = await app.request('/users/me');

      expect(response.status).toBe(404);
    });
  });
});
