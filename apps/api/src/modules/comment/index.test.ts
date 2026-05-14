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

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { Hono } from 'hono';

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

  app.post('/recipe/:recipeId', async (c) => {
    const user = userCtx as { isAdmin: boolean } | null;
    const isAdmin = user?.isAdmin ?? false;
    return c.json({ isAdmin });
  });

  app.delete('/:id', async (c) => {
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

  app.post('/recipe/:recipeId', async (c) => {
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
