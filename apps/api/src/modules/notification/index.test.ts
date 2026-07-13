/**
 * Router wiring tests for the notification endpoints.
 *
 * Mirrors the coffee-variety router test strategy: the REAL router is mounted
 * with its `deps` proxy stubbed (auth middleware pass-through + in-memory
 * service), verifying auth enforcement, query validation, route→service
 * wiring, and service-error → HTTP mapping (404/403).
 */
import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { AppEnv } from '../../types/hono.ts';
import notificationRouter, { deps } from './index.ts';

const wireRow = {
  id: 'n-1',
  userId: 'test-user-id',
  type: 'mention',
  actorId: 'actor-1',
  actorUsername: 'actor',
  referenceId: 'comment-1',
  referenceType: 'comment',
  metadata: JSON.stringify({ recipeSlug: 'slug-1', recipeTitle: 'Title 1' }),
  readAt: null,
  createdAt: '2026-07-01T10:00:00.000Z',
};

let listCalls: Array<{ userId: string; page: number; perPage: number; unreadOnly: boolean }>;
let markAllCalls: string[];

const mockService = {
  listNotifications: (userId: string, page: number, perPage: number, unreadOnly: boolean) => {
    listCalls.push({ userId, page, perPage, unreadOnly });
    return Promise.resolve({ notifications: [wireRow], total: 1 });
  },
  getUnreadCount: (_userId: string) => Promise.resolve(5),
  markAllAsRead: (userId: string) => {
    markAllCalls.push(userId);
    return Promise.resolve(2);
  },
  markAsRead: (_userId: string, id: string) => {
    if (id === 'missing') return Promise.reject(new Error('NOTIFICATION_NOT_FOUND'));
    if (id === 'foreign') return Promise.reject(new Error('FORBIDDEN'));
    return Promise.resolve({ ...wireRow, id, readAt: '2026-07-03T12:00:00.000Z' });
  },
};

const originalDeps = {
  authMiddleware: deps.authMiddleware,
  service: deps.service,
};

beforeEach(() => {
  listCalls = [];
  markAllCalls = [];
  deps.authMiddleware = async (_c: Context, next: Next) => {
    await next();
  };
  deps.service = mockService as unknown as typeof deps.service;
});

afterEach(() => {
  deps.authMiddleware = originalDeps.authMiddleware;
  deps.service = originalDeps.service;
});

function createTestApp() {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    c.set('userId', 'test-user-id');
    // deno-lint-ignore no-explicit-any
    c.set('user', { id: 'test-user-id', isAdmin: false } as any);
    await next();
  });

  app.route('/notifications', notificationRouter);

  return app;
}

describe('Notification Routes — auth enforcement', () => {
  it('returns 401 on every route when unauthenticated (real authMiddleware)', async () => {
    deps.authMiddleware = originalDeps.authMiddleware;
    const app = createTestApp();
    const requests: Array<[string, string]> = [
      ['GET', '/notifications'],
      ['GET', '/notifications/unread-count'],
      ['PATCH', '/notifications/read-all'],
      ['PATCH', '/notifications/n-1/read'],
    ];
    for (const [method, path] of requests) {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    }
  });
});

describe('Notification Routes — GET /notifications', () => {
  it('returns a paginated envelope and forwards defaults to the service', async () => {
    const app = createTestApp();
    const res = await app.request('/notifications');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([wireRow]);
    expect(body.meta.pagination).toEqual({ page: 1, perPage: 20, total: 1, totalPages: 1 });
    expect(listCalls).toEqual([
      { userId: 'test-user-id', page: 1, perPage: 20, unreadOnly: false },
    ]);
  });

  it('forwards page/perPage/unreadOnly query params', async () => {
    const app = createTestApp();
    const res = await app.request('/notifications?page=2&perPage=10&unreadOnly=true');
    expect(res.status).toBe(200);
    expect(listCalls).toEqual([
      { userId: 'test-user-id', page: 2, perPage: 10, unreadOnly: true },
    ]);
  });

  it('rejects an invalid page with a 400 validation envelope', async () => {
    const app = createTestApp();
    const res = await app.request('/notifications?page=0');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a non-boolean unreadOnly with 400', async () => {
    const app = createTestApp();
    const res = await app.request('/notifications?unreadOnly=banana');
    expect(res.status).toBe(400);
  });

  it('rejects perPage above 100 with 400', async () => {
    const app = createTestApp();
    const res = await app.request('/notifications?perPage=101');
    expect(res.status).toBe(400);
  });
});

describe('Notification Routes — GET /notifications/unread-count', () => {
  it('returns the unread count in a success envelope', async () => {
    const app = createTestApp();
    const res = await app.request('/notifications/unread-count');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ count: 5 });
  });
});

describe('Notification Routes — PATCH /notifications/read-all', () => {
  it('marks all as read and returns a message envelope', async () => {
    const app = createTestApp();
    const res = await app.request('/notifications/read-all', { method: 'PATCH' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('All notifications marked as read');
    expect(markAllCalls).toEqual(['test-user-id']);
  });
});

describe('Notification Routes — PATCH /notifications/:id/read', () => {
  it('returns the updated notification in a success envelope', async () => {
    const app = createTestApp();
    const res = await app.request('/notifications/n-1/read', { method: 'PATCH' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('n-1');
    expect(body.data.readAt).toBe('2026-07-03T12:00:00.000Z');
  });

  it('maps NOTIFICATION_NOT_FOUND to a 404 NOT_FOUND envelope', async () => {
    const app = createTestApp();
    const res = await app.request('/notifications/missing/read', { method: 'PATCH' });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('maps FORBIDDEN to a 403 FORBIDDEN envelope', async () => {
    const app = createTestApp();
    const res = await app.request('/notifications/foreign/read', { method: 'PATCH' });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });
});
