/**
 * User Module Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

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
  authMiddleware: vi.fn((_c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    _c.set('user', { id: 'user_123', isAdmin: false });
    return next();
  }),
  requireAuth: vi.fn((_c: unknown, next: () => Promise<void>) => next()),
}));

// Mock database module
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

// Mock logger
vi.mock('../../utils/logger/index.js', () => ({
  logAudit: vi.fn(),
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Custom error classes for testing
class NotFoundError extends Error {
  statusCode = 404;
  code = 'NOT_FOUND';
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

// Mock error handler module
vi.mock('../../middleware/errorHandler.js', () => ({
  NotFoundError: class NotFoundError extends Error {
    statusCode = 404;
    code = 'NOT_FOUND';
    constructor(resource: string) {
      super(`${resource} not found`);
      this.name = 'NotFoundError';
    }
  },
}));

import userModule from './index.js';
import { getPrisma } from '../../utils/database/index.js';

// Simple error handler for tests
const testErrorHandler = (err: Error, c: { json: (body: unknown, status: number) => Response }) => {
  if (err instanceof NotFoundError || err.name === 'NotFoundError') {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: err.message } }, 404);
  }
  return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }, 500);
};

// Create mock prisma instance
const mockPrisma = {
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
    count: vi.fn(),
  },
};

describe('User Module', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    // Set up getPrisma to return our mock
    vi.mocked(getPrisma).mockReturnValue(mockPrisma as never);
    app = new Hono();
    app.route('/users', userModule);
    // Attach error handler for proper error responses
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

      vi.mocked(mockPrisma.user.findUnique).mockResolvedValue(mockUser as never);

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

      vi.mocked(mockPrisma.user.update).mockResolvedValue(mockUser as never);

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

      vi.mocked(mockPrisma.user.update).mockResolvedValue(mockUser as never);

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

      vi.mocked(mockPrisma.recipe.findMany).mockResolvedValue(mockRecipes as never);
      vi.mocked(mockPrisma.recipe.count).mockResolvedValue(2);

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

      vi.mocked(mockPrisma.userFavourite.findMany).mockResolvedValue(mockFavourites as never);
      vi.mocked(mockPrisma.userFavourite.count).mockResolvedValue(1);

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

      vi.mocked(mockPrisma.user.findFirst).mockResolvedValue(mockUser as never);

      const response = await app.request('/users/coffeemaster');
      
      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.data?.username).toBe('coffeemaster');
      // Should not include email in public profile
      expect(body.data?.email).toBeUndefined();
    });

    it('should return 404 for non-existent user', async () => {
      vi.mocked(mockPrisma.user.findFirst).mockResolvedValue(null);

      const response = await app.request('/users/nonexistent');
      
      expect(response.status).toBe(404);
    });

    it('should not return banned users', async () => {
      // Banned users are filtered at query level, so findFirst returns null
      vi.mocked(mockPrisma.user.findFirst).mockResolvedValue(null);

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

      vi.mocked(mockPrisma.user.findFirst).mockResolvedValue(mockUser as never);
      vi.mocked(mockPrisma.recipe.findMany).mockResolvedValue(mockRecipes as never);
      vi.mocked(mockPrisma.recipe.count).mockResolvedValue(1);

      const response = await app.request('/users/coffeemaster/recipes');
      
      expect(response.status).toBe(200);
      const body = await response.json() as ApiResponse;
      expect(body.data).toHaveLength(1);
    });
  });
});
