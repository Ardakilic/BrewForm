import '../test-setup.ts';
import { db } from '@brewform/db';
import { userFollows, users } from '@brewform/db/schema';
import { inArray, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFollow } from '../modules/follow/model.ts';
import type { AppEnv } from '../types/hono.ts';
import { errorHandler, log } from './errorHandler.ts';

/**
 * DB-backed test (runs against `brewform_test`) for the global error handler:
 * a real `user_follow` unique violation, raised by postgres-js and wrapped by
 * drizzle-orm in a `DrizzleQueryError`, must reach the client as `409 CONFLICT`
 * and must not leak the query parameters into the response or the logs.
 */

/**
 * Flatten any value (including Error instances with non-enumerable
 * `message`/`stack`) into one searchable string.
 */
function deepText(value: unknown, seen = new Set<unknown>()): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object' && typeof value !== 'function') return String(value);
  if (seen.has(value)) return '';
  seen.add(value);
  return Object.getOwnPropertyNames(value)
    .map((key) => `${key} ${deepText((value as Record<string, unknown>)[key], seen)}`)
    .join(' ');
}

describe('errorHandler — real unique violation through follow/model.ts', () => {
  let followerId: string;
  let followingId: string;

  /**
   * Minimal app: request id, the production error handler, and one route that
   * inserts the (follower, following) pair through the model. The ids come from
   * the closure, so they never appear in the request path that gets logged.
   */
  function createApp() {
    const app = new Hono<AppEnv>();
    app.use('*', async (c, next) => {
      c.set('requestId', 'follow-race-req');
      await next();
    });
    app.onError(errorHandler);
    app.post('/follow', async (c) => {
      const row = await createFollow(followerId, followingId);
      return c.json({ success: true, data: { id: row.id } }, 201);
    });
    return app;
  }

  beforeAll(async () => {
    followerId = crypto.randomUUID();
    followingId = crypto.randomUUID();
    await db.insert(users).values([
      {
        id: followerId,
        email: `eh-db-follower-${followerId}@example.com`,
        username: `eh-db-a-${followerId.slice(0, 8)}`,
        passwordHash: 'hash',
      },
      {
        id: followingId,
        email: `eh-db-following-${followingId}@example.com`,
        username: `eh-db-b-${followingId.slice(0, 8)}`,
        passwordHash: 'hash',
      },
    ]);
  });

  afterAll(async () => {
    await db
      .delete(userFollows)
      .where(
        or(
          inArray(userFollows.followerId, [followerId, followingId]),
          inArray(userFollows.followingId, [followerId, followingId]),
        ),
      );
    await db.delete(users).where(inArray(users.id, [followerId, followingId]));
  });

  let spies: Array<ReturnType<typeof vi.spyOn>>;

  beforeEach(() => {
    spies = [vi.spyOn(log, 'debug'), vi.spyOn(log, 'warn'), vi.spyOn(log, 'error')];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should answer the second insert of the same pair with 409 CONFLICT and no leaked params', async () => {
    const app = createApp();

    const first = await app.request('/follow', { method: 'POST' });
    expect(first.status).toBe(201);

    const second = await app.request('/follow', { method: 'POST' });
    expect(second.status).toBe(409);
    const text = await second.text();
    const body = JSON.parse(text) as {
      success: boolean;
      error: { code: string; message: string; requestId: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toBe('A record with this value already exists');
    expect(body.error.requestId).toBe('follow-race-req');

    const logText = spies
      .flatMap((spy) => spy.mock.calls)
      .map((call) => deepText(call))
      .join('\n');
    expect(logText).toContain('Database constraint violation');
    expect(logText).toContain('user_follow_follower_id_following_id_unique');
    expect(logText).not.toContain('Unhandled error');
    for (const value of [followerId, followingId]) {
      expect(text).not.toContain(value);
      expect(logText).not.toContain(value);
    }
    expect(logText).not.toContain('params:');
  });
});
