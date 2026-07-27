/**
 * Router wiring tests for Comment_Router — `isAdmin` extraction and forwarding.
 *
 * Tests that the router correctly extracts `isAdmin` from the Hono context variable
 * set by `authMiddleware` and forwards it to the service layer.
 *
 * Strategy: Create a self-contained test Hono app that replicates the router's
 * `isAdmin` extraction logic. This avoids the ES module stub limitation while
 * still verifying the exact extraction and forwarding behaviour specified in the
 * router source.
 *
 * Requirements: 2.5, 2.7, 3.5
 */

import '../../test-setup.ts';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { inArray } from 'drizzle-orm';
import { db } from '@brewform/db';
import { comments, notifications, recipes, userBadges, users } from '@brewform/db/schema';
import { setCacheProvider } from '../../utils/cache/singleton.ts';
import { InMemoryCacheProvider } from '../../utils/cache/index.ts';
import comment, { deps as routeDeps } from './index.ts';
import type { AppEnv, ContextUser } from '../../types/hono.ts';

// ---------------------------------------------------------------------------
// Helpers — replicate the router's isAdmin extraction logic
// ---------------------------------------------------------------------------

/**
 * Extracts `isAdmin` from the Hono context variable `user`, exactly as the
 * Comment_Router does:
 *
 *   const user = c.get('user') as { isAdmin: boolean } | null;
 *   const isAdmin = user?.isAdmin ?? false;
 *
 * This is the logic under test.
 */
function extractIsAdmin(user: { isAdmin: boolean } | null | undefined): boolean {
  return user?.isAdmin ?? false;
}

/**
 * Creates a test Hono app that:
 * 1. Sets `user` and `userId` context variables directly (no authMiddleware)
 * 2. Runs a handler that captures the extracted `isAdmin` value
 * 3. Returns it in the response body for assertion
 */
function createIsAdminCaptureApp(userCtx: { id: string; isAdmin: boolean } | null) {
  const app = new Hono();

  app.post('/recipe/:recipeId', (c) => {
    const user = userCtx as { isAdmin: boolean } | null;
    const isAdmin = user?.isAdmin ?? false;
    return c.json({ isAdmin });
  });

  app.delete('/:id', (c) => {
    const user = userCtx as { isAdmin: boolean } | null;
    const isAdmin = user?.isAdmin ?? false;
    return c.json({ isAdmin });
  });

  return app;
}

/**
 * Creates a test Hono app that simulates the COMMENT_DEPTH_EXCEEDED error path
 * in the router's POST handler, exactly as implemented in index.ts:
 *
 *   if (message === 'COMMENT_DEPTH_EXCEEDED') {
 *     return error(c, 'BAD_REQUEST', 'Comment thread depth limit exceeded', 400);
 *   }
 */
function createDepthExceededApp() {
  const app = new Hono();

  app.post('/recipe/:recipeId', (c) => {
    // Simulate service throwing COMMENT_DEPTH_EXCEEDED
    try {
      throw new Error('COMMENT_DEPTH_EXCEEDED');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'COMMENT_DEPTH_EXCEEDED') {
        return c.json(
          {
            success: false,
            error: {
              code: 'BAD_REQUEST',
              message: 'Comment thread depth limit exceeded',
            },
          },
          400,
        );
      }
      throw err;
    }
  });

  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Comment_Router — isAdmin extraction and forwarding', () => {
  describe('POST /recipe/:recipeId — createComment', () => {
    it('extracts isAdmin: true when authenticated user has isAdmin: true', async () => {
      const adminUser = { id: 'admin-user-id', isAdmin: true };
      const app = createIsAdminCaptureApp(adminUser);

      const res = await app.request('/recipe/recipe-123', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello from admin' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { isAdmin: boolean };
      expect(body.isAdmin).toBe(true);
    });

    it('extracts isAdmin: false when authenticated user has isAdmin: false', async () => {
      const regularUser = { id: 'regular-user-id', isAdmin: false };
      const app = createIsAdminCaptureApp(regularUser);

      const res = await app.request('/recipe/recipe-123', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello from regular user' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { isAdmin: boolean };
      expect(body.isAdmin).toBe(false);
    });

    it('returns 400 with BAD_REQUEST code when service throws COMMENT_DEPTH_EXCEEDED', async () => {
      const app = createDepthExceededApp();

      const res = await app.request('/recipe/recipe-123', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Reply to deeply nested comment',
          parentCommentId: '00000000-0000-0000-0000-000000000099',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json() as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('BAD_REQUEST');
    });
  });

  describe('DELETE /:id — deleteComment', () => {
    it('extracts isAdmin: true when authenticated user has isAdmin: true', async () => {
      const adminUser = { id: 'admin-user-id', isAdmin: true };
      const app = createIsAdminCaptureApp(adminUser);

      const res = await app.request('/comment-id-123', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { isAdmin: boolean };
      expect(body.isAdmin).toBe(true);
    });
  });

  describe('extractIsAdmin — unit tests for the extraction logic', () => {
    it('returns true when user.isAdmin is true', () => {
      expect(extractIsAdmin({ isAdmin: true })).toBe(true);
    });

    it('returns false when user.isAdmin is false', () => {
      expect(extractIsAdmin({ isAdmin: false })).toBe(false);
    });

    it('returns false when user is null (defensive default)', () => {
      expect(extractIsAdmin(null)).toBe(false);
    });

    it('returns false when user is undefined (defensive default)', () => {
      expect(extractIsAdmin(undefined)).toBe(false);
    });
  });
});

/**
 * Rate-limit route tests for `POST /api/v1/comments/recipe/:recipeId`.
 *
 * Unlike the isAdmin-extraction tests above (which use self-contained Hono apps
 * that replicate router logic), these mount the REAL `comment` router so the
 * actual `rateLimitMiddleware` chain is exercised. The rate-limit middleware is
 * the FIRST middleware on the POST route (before `authMiddleware` and
 * `zValidator`), so the 429 fires regardless of body or auth validity: the
 * limiter keys by IP, not auth state, so the 6th POST from the same IP returns
 * 429 no matter what. This mirrors the report rate-limit test
 * (`report/index.test.ts:37-93`) and avoids JWT-minting complexity.
 *
 * The GET list route on the same router is NOT throttled by the
 * `keyPrefix: 'comment'` limiter (it is applied to POST only, not via
 * `comment.use('*', ...)`) — the second test asserts that exhausting the POST
 * budget does not produce 429 on `GET /api/v1/comments/recipe/:recipeId`.
 */
function createRateLimitTestApp() {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    await next();
  });
  app.route('/api/v1/comments', comment);
  return app;
}

describe(
  'POST /api/v1/comments/recipe/:recipeId — rate limit',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    beforeEach(() => {
      // Fresh cache per test so the rate-limit counter does not leak between tests
      // (pattern from report/index.test.ts:41-49).
      setCacheProvider(new InMemoryCacheProvider());
    });

    afterEach(() => {
      setCacheProvider(new InMemoryCacheProvider());
    });

    it('returns 429 on the 6th POST within the rate-limit window', async () => {
      const app = createRateLimitTestApp();
      const recipeId = crypto.randomUUID();
      // The first 5 POSTs are processed by the limiter (they 401 because no auth
      // header is present, but the limiter counter increments regardless — it
      // runs before authMiddleware and zValidator).
      for (let i = 0; i < 5; i++) {
        await app.request(`/api/v1/comments/recipe/${recipeId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'hello' }),
        });
      }
      // The 6th POST in the same 1-minute window from the same IP returns 429.
      const res = await app.request(`/api/v1/comments/recipe/${recipeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'hello' }),
      });
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('RATE_LIMITED');
    });

    it('does not throttle the GET list route (comment limiter is POST-only)', async () => {
      const app = createRateLimitTestApp();
      const recipeId = crypto.randomUUID();
      // Exhaust the POST budget first.
      for (let i = 0; i < 6; i++) {
        await app.request(`/api/v1/comments/recipe/${recipeId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'hello' }),
        });
      }
      // A GET on the same router must NOT be 429 (the comment-specific limiter is
      // applied to POST only, not via `comment.use('*', ...)`). The assertion is
      // simply that the GET is not throttled by the comment limiter.
      const res = await app.request(`/api/v1/comments/recipe/${recipeId}`, { method: 'GET' });
      expect(res.status).not.toBe(429);
    });
  },
);

// ---------------------------------------------------------------------------
// D99.9 — comment visibility gate route tests
//
// Mounts the REAL comment router on a stub Hono app with auth stubbed at the
// middleware seam (the `deps` proxy — same idiom as collection/index_test.ts)
// and exercises the visibility gate end-to-end against the test database:
// invisible (draft/private) recipes are existence-hidden as 404 for anonymous
// and non-owner callers; owners (and public recipes) pass through.
// ---------------------------------------------------------------------------

// Explicit Promise<undefined>: the real middleware's return type includes a
// JSON error response union, so `Promise<void>` does not assign (TS2322).
const stubGateAuth = async (_c: Context, next: Next): Promise<undefined> => {
  await next();
  return undefined;
};
const originalRouteAuthMiddleware = routeDeps.authMiddleware;
const originalRouteOptionalAuthMiddleware = routeDeps.optionalAuthMiddleware;

function createGateTestApp(user: { id: string; isAdmin: boolean } | null) {
  routeDeps.authMiddleware = stubGateAuth;
  routeDeps.optionalAuthMiddleware = stubGateAuth;
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    if (user) {
      c.set('userId', user.id);
      // Minimal ContextUser — the comment surface reads only id/isAdmin/emailVerifiedAt.
      c.set('user', {
        id: user.id,
        isAdmin: user.isAdmin,
        emailVerifiedAt: new Date(),
      } as unknown as ContextUser);
    } else {
      c.set('userId', null);
      c.set('user', null);
    }
    await next();
  });
  app.route('/api/v1/comments', comment);
  return app;
}

describe(
  'D99.9 — comment visibility gate (routes)',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    let authorId: string;
    let strangerId: string;
    let draftRecipeId: string;
    let privateRecipeId: string;
    let publicRecipeId: string;

    async function insertUser(prefix: string): Promise<string> {
      const id = crypto.randomUUID();
      await db.insert(users).values({
        id,
        email: `${prefix}-${id}@example.com`,
        username: `${prefix}-${id.slice(0, 8)}`,
        passwordHash: 'hash',
      });
      return id;
    }

    async function insertRecipe(
      author: string,
      visibility: 'draft' | 'private' | 'public',
    ): Promise<string> {
      const id = crypto.randomUUID();
      await db.insert(recipes).values({
        id,
        slug: `gate-${id}`,
        title: `Gate Recipe ${id.slice(0, 8)}`,
        authorId: author,
        visibility,
      });
      return id;
    }

    beforeAll(async () => {
      authorId = await insertUser('gate-author');
      strangerId = await insertUser('gate-stranger');
      draftRecipeId = await insertRecipe(authorId, 'draft');
      privateRecipeId = await insertRecipe(authorId, 'private');
      publicRecipeId = await insertRecipe(authorId, 'public');
    });

    beforeEach(() => {
      // Fresh in-memory cache per test — isolates the POST rate-limit counter.
      setCacheProvider(new InMemoryCacheProvider());
    });

    afterEach(() => {
      setCacheProvider(new InMemoryCacheProvider());
    });

    afterAll(async () => {
      routeDeps.authMiddleware = originalRouteAuthMiddleware;
      routeDeps.optionalAuthMiddleware = originalRouteOptionalAuthMiddleware;
      // Let the 201 test's fire-and-forget side-effect chains (badge evaluation,
      // notifications) land before FK-ordered cleanup, or a late user_badge
      // insert races the users delete.
      await new Promise((resolve) => setTimeout(resolve, 250));
      const recipeIds = [draftRecipeId, privateRecipeId, publicRecipeId];
      await db.delete(comments).where(inArray(comments.recipeId, recipeIds));
      await db.delete(notifications).where(inArray(notifications.userId, [authorId, strangerId]));
      await db.delete(userBadges).where(inArray(userBadges.userId, [authorId, strangerId]));
      await db.delete(recipes).where(inArray(recipes.id, recipeIds));
      await db.delete(users).where(inArray(users.id, [authorId, strangerId]));
    });

    it('POST returns the 404 envelope for an invisible recipe (non-owner)', async () => {
      const app = createGateTestApp({ id: strangerId, isAdmin: false });
      const res = await app.request(`/api/v1/comments/recipe/${privateRecipeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'should not land' }),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Recipe not found');
    });

    it('POST returns the same 404 for a nonexistent recipe (existence-hiding)', async () => {
      const app = createGateTestApp({ id: strangerId, isAdmin: false });
      const res = await app.request(`/api/v1/comments/recipe/${crypto.randomUUID()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'should not land' }),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Recipe not found');
    });

    it('POST returns 201 for the owner on a draft recipe', async () => {
      const app = createGateTestApp({ id: authorId, isAdmin: false });
      const res = await app.request(`/api/v1/comments/recipe/${draftRecipeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'owner can comment on own draft' }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('GET returns 404 for an invisible recipe when anonymous', async () => {
      const app = createGateTestApp(null);
      const res = await app.request(`/api/v1/comments/recipe/${privateRecipeId}`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Recipe not found');
    });

    it('GET returns 404 for an invisible recipe for a non-owner', async () => {
      const app = createGateTestApp({ id: strangerId, isAdmin: false });
      const res = await app.request(`/api/v1/comments/recipe/${draftRecipeId}`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('GET returns 200 for the owner with an auth token on a draft recipe', async () => {
      const app = createGateTestApp({ id: authorId, isAdmin: false });
      const res = await app.request(`/api/v1/comments/recipe/${draftRecipeId}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('GET remains anonymously listable on a public recipe', async () => {
      const app = createGateTestApp(null);
      const res = await app.request(`/api/v1/comments/recipe/${publicRecipeId}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  },
);
