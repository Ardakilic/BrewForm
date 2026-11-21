/**
 * Regression test for the removed legacy `POST /api/v1/recipes/:id/notes`
 * (wave-6 t1, user decision OQ3).
 *
 * That endpoint was an IDOR: any signed-in caller overwrote the author's public
 * `recipe_version.personal_notes`. It is deleted outright. The `recipe-note`
 * router registers only GET, PUT and DELETE on `/:id/notes`, so Hono answers a
 * POST with its default 404 (the app does not use `methodNotAllowed`), before
 * any auth guard, validator or service runs.
 *
 * The test drives the composed `routes` app from `routes/index.ts` (every module,
 * real auth middleware, real Bearer tokens) behind the global `errorHandler`.
 */
import '../test-setup.ts';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import { errorHandler } from '../middleware/errorHandler.ts';
import { bearer, NoteFixtures } from '../modules/recipe-note/test-helpers.ts';
import type { AppEnv } from '../types/hono.ts';
import routes from './index.ts';

/** Build the composed API app behind the global error handler, as `main.ts` does. */
function buildApp() {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.route('/', routes);
  return app;
}

/**
 * Send `POST /api/v1/recipes/:id/notes` with `{ notes }`.
 *
 * @param recipeId - Target recipe id.
 * @param authorization - `Bearer …` header value, or `null` for an anonymous request.
 */
function postNotes(recipeId: string, authorization: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authorization) headers.Authorization = authorization;
  return buildApp().request(`/api/v1/recipes/${recipeId}/notes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ notes: 'x' }),
  });
}

describe('POST /api/v1/recipes/:id/notes is removed', () => {
  const fixtures = new NoteFixtures();

  afterEach(async () => {
    await fixtures.cleanup();
  });

  it("returns 404 for another user's public recipe and changes no brewer note or private note", async () => {
    const userA = await fixtures.user('post-removed-a');
    const userB = await fixtures.user('post-removed-b');
    const { recipe } = await fixtures.recipe(userA.id, {
      brewerNotes: ['A v1 brewer note', 'A v2 brewer note'],
    });
    const before = await fixtures.brewerNotes(recipe.id);

    const res = await postNotes(recipe.id, await bearer(userB));

    expect(res.status).toBe(404);
    expect(await fixtures.brewerNotes(recipe.id)).toEqual(before);
    expect(before.map((v) => v.personalNotes)).toEqual(['A v1 brewer note', 'A v2 brewer note']);
    expect(await fixtures.noteRows(userB.id, recipe.id)).toEqual([]);
    expect(await fixtures.noteRows(userA.id, recipe.id)).toEqual([]);
  });

  it("returns 404 for another user's private recipe and writes nothing", async () => {
    const userA = await fixtures.user('post-removed-a');
    const userB = await fixtures.user('post-removed-b');
    const { recipe } = await fixtures.recipe(userA.id, {
      visibility: 'private',
      brewerNotes: ['A private brewer note'],
    });
    const before = await fixtures.brewerNotes(recipe.id);

    const res = await postNotes(recipe.id, await bearer(userB));

    expect(res.status).toBe(404);
    expect(await fixtures.brewerNotes(recipe.id)).toEqual(before);
    expect(await fixtures.noteRows(userB.id, recipe.id)).toEqual([]);
  });

  it('returns 404 (not 401) for an anonymous request and writes nothing', async () => {
    const userA = await fixtures.user('post-removed-a');
    const { recipe } = await fixtures.recipe(userA.id, { brewerNotes: ['A brewer note'] });
    const before = await fixtures.brewerNotes(recipe.id);

    const res = await postNotes(recipe.id, null);

    expect(res.status).toBe(404);
    expect(await fixtures.brewerNotes(recipe.id)).toEqual(before);
  });
});
