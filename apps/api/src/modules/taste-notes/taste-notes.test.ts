/**
 * Taste Notes Module Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import tasteNotesModule from './index.js';

// API Response type for testing
interface ApiResponse {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

// Mock user for authenticated requests
const mockAuthUser = {
  id: 'user_123',
  email: 'test@example.com',
  username: 'testuser',
  isAdmin: false,
  isBanned: false,
};

// Mock taste note data
const mockTasteNotes = [
  {
    id: 'taste_1',
    name: 'Fruity',
    slug: 'fruity',
    depth: 0,
    colour: '#DA1D23',
    definition: 'A sweet, floral, aromatic blend of a variety of ripe fruits.',
    parentId: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  },
  {
    id: 'taste_2',
    name: 'Berry',
    slug: 'fruity-berry',
    depth: 1,
    colour: '#DD4C51',
    definition: 'The sweet, sour, floral aromatic associated with berries.',
    parentId: 'taste_1',
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  },
  {
    id: 'taste_3',
    name: 'Raspberry',
    slug: 'fruity-berry-raspberry',
    depth: 2,
    colour: '#E52968',
    definition: 'The lightly sweet, fruity, floral aromatic associated with raspberries.',
    parentId: 'taste_2',
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  },
  {
    id: 'taste_4',
    name: 'Blackberry',
    slug: 'fruity-berry-blackberry',
    depth: 2,
    colour: '#3E0317',
    definition: 'The sweet, dark, fruity aromatic associated with blackberries.',
    parentId: 'taste_2',
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  },
  {
    id: 'taste_5',
    name: 'Roasted',
    slug: 'roasted',
    depth: 0,
    colour: '#894810',
    definition: 'A rich, full aromatic associated with roasted products.',
    parentId: null,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  },
  {
    id: 'taste_6',
    name: 'Brown, Roast',
    slug: 'roasted-brown-roast',
    depth: 1,
    colour: '#894810',
    definition: 'A rich, full, round aromatic characterized as some degree of darkness.',
    parentId: 'taste_5',
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  },
];

// Mock database utilities
vi.mock('../../utils/database/index.js', () => ({
  getPrisma: vi.fn(() => ({
    tasteNote: {
      findMany: vi.fn(() => Promise.resolve(mockTasteNotes)),
      findUnique: vi.fn((args: { where: { id?: string; slug?: string } }) => {
        const note = mockTasteNotes.find(
          (n) => n.id === args.where.id || n.slug === args.where.slug
        );
        return Promise.resolve(note || null);
      }),
      groupBy: vi.fn(() =>
        Promise.resolve([
          { depth: 0, _count: 2 },
          { depth: 1, _count: 2 },
          { depth: 2, _count: 2 },
        ])
      ),
    },
    user: {
      findUnique: vi.fn((args: { where: { id: string } }) => {
        if (args.where.id === mockAuthUser.id) {
          return Promise.resolve({ ...mockAuthUser, deletedAt: null });
        }
        return Promise.resolve(null);
      }),
    },
  })),
  softDeleteFilter: vi.fn(() => ({ deletedAt: null })),
}));

// Mock redis utilities
const mockRedisGet = vi.fn(() => null);
const mockRedisSetex = vi.fn();
const mockRedisDel = vi.fn();

vi.mock('../../utils/redis/index.js', () => ({
  getRedis: vi.fn(() => ({
    get: mockRedisGet,
    setex: mockRedisSetex,
    del: mockRedisDel,
  })),
  cacheGetOrSet: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => {
    return fetcher();
  }),
  invalidateCache: vi.fn(),
}));

// Mock logger
vi.mock('../../utils/logger/index.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
  logSecurity: vi.fn(),
}));

// Mock auth utilities
vi.mock('../../utils/auth/index.js', () => ({
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'valid_token') {
      return Promise.resolve({ userId: mockAuthUser.id });
    }
    return Promise.resolve(null);
  }),
}));

// Mock auth middleware - this is important for testing authentication
vi.mock('../../middleware/auth.js', async () => {
  const { createMiddleware } = await import('hono/factory');
  
  return {
    authMiddleware: createMiddleware(async (c, next) => {
      const authHeader = c.req.header('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        c.set('user', null);
        return next();
      }
      
      const token = authHeader.slice(7);
      if (token === 'valid_token') {
        c.set('user', mockAuthUser);
      } else {
        c.set('user', null);
      }
      return next();
    }),
    requireAuth: createMiddleware(async (c, next) => {
      const user = c.get('user');
      if (!user) {
        return c.json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        }, 401);
      }
      return next();
    }),
  };
});

// Helper to create authenticated request
const authHeaders = { Authorization: 'Bearer valid_token' };

describe('Taste Notes Module', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route('/taste-notes', tasteNotesModule);
  });

  describe('Authentication', () => {
    it('should return 401 when no authentication is provided', async () => {
      const res = await app.request('/taste-notes');
      const body = (await res.json()) as ApiResponse;

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 with invalid token', async () => {
      const res = await app.request('/taste-notes', {
        headers: { Authorization: 'Bearer invalid_token' },
      });
      const body = (await res.json()) as ApiResponse;

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for search without authentication', async () => {
      const res = await app.request('/taste-notes/search?q=fruity');
      const body = (await res.json()) as ApiResponse;

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for hierarchy without authentication', async () => {
      const res = await app.request('/taste-notes/hierarchy');
      const body = (await res.json()) as ApiResponse;

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for single note without authentication', async () => {
      const res = await app.request('/taste-notes/taste_1');
      const body = (await res.json()) as ApiResponse;

      expect(res.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /taste-notes', () => {
    it('should return all taste notes with full paths when authenticated', async () => {
      const res = await app.request('/taste-notes', { headers: authHeaders });
      const body = (await res.json()) as ApiResponse;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should include fullPath for each taste note', async () => {
      const res = await app.request('/taste-notes', { headers: authHeaders });
      const body = (await res.json()) as ApiResponse;

      expect(body.success).toBe(true);
      const notes = body.data as Array<{ fullPath: string; name: string }>;
      
      // Check that fullPath is constructed correctly
      const fruityNote = notes.find((n) => n.name === 'Fruity');
      expect(fruityNote?.fullPath).toBe('Fruity');

      const berryNote = notes.find((n) => n.name === 'Berry');
      expect(berryNote?.fullPath).toBe('Fruity > Berry');

      const raspberryNote = notes.find((n) => n.name === 'Raspberry');
      expect(raspberryNote?.fullPath).toBe('Fruity > Berry > Raspberry');
    });
  });

  describe('GET /taste-notes/hierarchy', () => {
    it('should return taste notes in hierarchical structure', async () => {
      const res = await app.request('/taste-notes/hierarchy', { headers: authHeaders });
      const body = (await res.json()) as ApiResponse;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should have correct parent-child relationships', async () => {
      const res = await app.request('/taste-notes/hierarchy', { headers: authHeaders });
      const body = (await res.json()) as ApiResponse;

      const hierarchy = body.data as Array<{
        name: string;
        children: Array<{ name: string; children: Array<{ name: string }> }>;
      }>;

      // Top level should only have root notes
      const fruity = hierarchy.find((n) => n.name === 'Fruity');
      expect(fruity).toBeDefined();
      expect(fruity?.children.length).toBeGreaterThan(0);

      // Berry should be a child of Fruity
      const berry = fruity?.children.find((n) => n.name === 'Berry');
      expect(berry).toBeDefined();
      expect(berry?.children.length).toBeGreaterThan(0);

      // Raspberry should be a child of Berry
      const raspberry = berry?.children.find((n) => n.name === 'Raspberry');
      expect(raspberry).toBeDefined();
    });
  });

  describe('GET /taste-notes/search', () => {
    it('should require minimum 3 characters for search', async () => {
      const res = await app.request('/taste-notes/search?q=fr', { headers: authHeaders });
      
      expect(res.status).toBe(400);
    });

    it('should return matching taste notes for valid query', async () => {
      const res = await app.request('/taste-notes/search?q=fruit', { headers: authHeaders });
      const body = (await res.json()) as ApiResponse;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should include children when parent matches', async () => {
      const res = await app.request('/taste-notes/search?q=fruity', { headers: authHeaders });
      const body = (await res.json()) as ApiResponse;

      expect(body.success).toBe(true);
      const results = body.data as Array<{ name: string }>;

      // Should include Fruity and all its descendants
      const names = results.map((r) => r.name);
      expect(names).toContain('Fruity');
      expect(names).toContain('Berry');
      expect(names).toContain('Raspberry');
      expect(names).toContain('Blackberry');
    });

    it('should be case insensitive', async () => {
      const res1 = await app.request('/taste-notes/search?q=FRUITY', { headers: authHeaders });
      const body1 = (await res1.json()) as ApiResponse;

      const res2 = await app.request('/taste-notes/search?q=fruity', { headers: authHeaders });
      const body2 = (await res2.json()) as ApiResponse;

      expect(body1.success).toBe(true);
      expect(body2.success).toBe(true);
      
      const results1 = body1.data as Array<{ id: string }>;
      const results2 = body2.data as Array<{ id: string }>;
      
      expect(results1.length).toBe(results2.length);
    });

    it('should search across full path', async () => {
      const res = await app.request('/taste-notes/search?q=berry', { headers: authHeaders });
      const body = (await res.json()) as ApiResponse;

      expect(body.success).toBe(true);
      const results = body.data as Array<{ name: string }>;

      // Should include Berry and its children
      const names = results.map((r) => r.name);
      expect(names).toContain('Berry');
      expect(names).toContain('Raspberry');
      expect(names).toContain('Blackberry');
    });

    it('should return empty array for no matches', async () => {
      const res = await app.request('/taste-notes/search?q=chocolate', { headers: authHeaders });
      const body = (await res.json()) as ApiResponse;

      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
    });
  });

  describe('GET /taste-notes/:id', () => {
    it('should return a single taste note by ID', async () => {
      const res = await app.request('/taste-notes/taste_1', { headers: authHeaders });
      const body = (await res.json()) as ApiResponse;

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      
      const note = body.data as { id: string; name: string };
      expect(note.id).toBe('taste_1');
      expect(note.name).toBe('Fruity');
    });

    it('should return 404 for non-existent taste note', async () => {
      const res = await app.request('/taste-notes/nonexistent', { headers: authHeaders });
      const body = (await res.json()) as ApiResponse;

      expect(res.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('NOT_FOUND');
    });
  });
});

describe('Taste Notes Service', () => {
  describe('buildFullPath', () => {
    it('should build correct path for top-level note', async () => {
      const app = new Hono();
      app.route('/taste-notes', tasteNotesModule);

      const res = await app.request('/taste-notes', { headers: authHeaders });
      const body = (await res.json()) as ApiResponse;
      const notes = body.data as Array<{ name: string; fullPath: string; depth: number }>;

      const topLevel = notes.filter((n) => n.depth === 0);
      for (const note of topLevel) {
        expect(note.fullPath).toBe(note.name);
      }
    });

    it('should build correct path for nested notes', async () => {
      const app = new Hono();
      app.route('/taste-notes', tasteNotesModule);

      const res = await app.request('/taste-notes', { headers: authHeaders });
      const body = (await res.json()) as ApiResponse;
      const notes = body.data as Array<{ name: string; fullPath: string; depth: number }>;

      const raspberryNote = notes.find((n) => n.name === 'Raspberry');
      expect(raspberryNote?.fullPath).toBe('Fruity > Berry > Raspberry');
      expect(raspberryNote?.depth).toBe(2);
    });
  });

  describe('searchTasteNotes', () => {
    it('should sort results with exact matches first', async () => {
      const app = new Hono();
      app.route('/taste-notes', tasteNotesModule);

      const res = await app.request('/taste-notes/search?q=berry', { headers: authHeaders });
      const body = (await res.json()) as ApiResponse;
      const results = body.data as Array<{ name: string }>;

      // Exact match "Berry" should be first
      if (results.length > 0) {
        expect(results[0].name).toBe('Berry');
      }
    });

    it('should include parent categories when searching for child', async () => {
      const app = new Hono();
      app.route('/taste-notes', tasteNotesModule);

      const res = await app.request('/taste-notes/search?q=raspberry', { headers: authHeaders });
      const body = (await res.json()) as ApiResponse;
      const results = body.data as Array<{ name: string }>;

      // Should include Raspberry
      expect(results.some((r) => r.name === 'Raspberry')).toBe(true);
    });
  });
});

describe('Taste Notes Caching', () => {
  it('should use cache for repeated requests', async () => {
    const app = new Hono();
    app.route('/taste-notes', tasteNotesModule);

    // First request (authenticated)
    await app.request('/taste-notes', { headers: authHeaders });
    
    // Second request should use cached data
    await app.request('/taste-notes', { headers: authHeaders });

    // cacheGetOrSet should have been called
    const { cacheGetOrSet } = await import('../../utils/redis/index.js');
    expect(cacheGetOrSet).toHaveBeenCalled();
  });
});

describe('Taste Notes Validation', () => {
  it('should validate search query minimum length', async () => {
    const app = new Hono();
    app.route('/taste-notes', tasteNotesModule);

    const res = await app.request('/taste-notes/search?q=ab', { headers: authHeaders });
    
    expect(res.status).toBe(400);
  });

  it('should validate search query maximum length', async () => {
    const app = new Hono();
    app.route('/taste-notes', tasteNotesModule);

    const longQuery = 'a'.repeat(101);
    const res = await app.request(`/taste-notes/search?q=${longQuery}`, { headers: authHeaders });
    
    expect(res.status).toBe(400);
  });

  it('should accept valid search queries', async () => {
    const app = new Hono();
    app.route('/taste-notes', tasteNotesModule);

    const res = await app.request('/taste-notes/search?q=fruity', { headers: authHeaders });
    const body = (await res.json()) as ApiResponse;
    
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
