import '../test-setup.ts';
import { db } from '@brewform/db';
import { users } from '@brewform/db/schema';
import { eq } from 'drizzle-orm';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';
import { app } from '../main.ts';
import { signAccessToken } from '../modules/auth/jwt.ts';
import { log } from './errorHandler.ts';

/**
 * Route-level test for the global error handler: mounts the real application
 * (`main.ts`, full middleware stack plus `app.onError(errorHandler)`) and sends
 * a malformed JSON body to an authenticated JSON route. Hono's validator throws
 * `HTTPException(400, 'Malformed JSON in request body')`, which must surface as
 * a 400 `BAD_REQUEST` envelope instead of a 500.
 */
describe('errorHandler — real app, malformed JSON body', () => {
  let userId: string;
  let token: string;

  beforeAll(async () => {
    userId = crypto.randomUUID();
    const [user] = await db
      .insert(users)
      .values({
        id: userId,
        email: `eh-route-${userId}@example.com`,
        username: `eh-route-${userId.slice(0, 8)}`,
        passwordHash: 'hash',
        emailVerifiedAt: new Date(),
      })
      .returning();
    token = await signAccessToken({
      id: user.id,
      email: user.email,
      username: user.username,
      isAdmin: false,
    });
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  let errorSpy: MockInstance;

  beforeEach(() => {
    errorSpy = vi.spyOn(log, 'error');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should answer POST /api/v1/collections with a truncated body as 400 BAD_REQUEST', async () => {
    const res = await app.request('/api/v1/collections', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-forwarded-for': `eh-route-${crypto.randomUUID()}`,
      },
      body: '{"name":',
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      success: boolean;
      error: { code: string; message: string; requestId?: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message).toBe('Malformed JSON in request body');
    expect(body.error.requestId).toBe(res.headers.get('x-request-id'));
    expect(errorSpy.mock.calls.map((call) => call[1])).not.toContain('Unhandled error');
  });
});
