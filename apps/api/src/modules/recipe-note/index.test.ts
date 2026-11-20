/**
 * Route-level tests for the caller-scoped private notes endpoints
 * (`GET|PUT|DELETE /api/v1/recipes/:id/notes`).
 *
 * Drives the composed `routes` app from `routes/index.ts` (real auth middleware,
 * real Bearer tokens, the recipe router mounted alongside) behind the global
 * `errorHandler`, against the test database. Covers the IDOR regression (B can
 * change neither A's brewer note nor A's private note), the status codes,
 * idempotent DELETE, the `Cache-Control` header, the unverified-email rule and
 * that private text never leaks into search or the recipe detail payload.
 */
import '../../test-setup.ts';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import { errorHandler } from '../../middleware/errorHandler.ts';
import routes from '../../routes/index.ts';
import type { AppEnv } from '../../types/hono.ts';
import { NOTES_CACHE_CONTROL } from './index.ts';
import { bearer, type FixtureUser, NoteFixtures } from './test-helpers.ts';

/** Build the composed API app behind the global error handler, as `main.ts` does. */
function buildApp() {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.route('/', routes);
  return app;
}

/**
 * Send a request to `/api/v1/recipes/:id/notes`.
 *
 * @param method - `GET`, `PUT` or `DELETE`.
 * @param recipeId - Recipe id placed in the path (may be malformed on purpose).
 * @param user - Caller to authenticate as, or `null` for an anonymous request.
 * @param body - Optional JSON body (PUT).
 */
async function notesRequest(
  method: 'GET' | 'PUT' | 'DELETE',
  recipeId: string,
  user: FixtureUser | null,
  body?: unknown,
) {
  const headers: Record<string, string> = {};
  if (user) headers.Authorization = await bearer(user);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return buildApp().request(`/api/v1/recipes/${recipeId}/notes`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Parsed JSON body of a notes response. */
interface NotesBody {
  success: boolean;
  data?: { recipeId: string; notes: string | null; updatedAt: string | null };
  error?: { code: string; details?: Array<{ field: string }> };
}

describe('Private notes routes', () => {
  const fixtures = new NoteFixtures();

  afterEach(async () => {
    await fixtures.cleanup();
  });

  describe('IDOR regression', () => {
    it("B's PUT on A's public recipe writes only B's note; A's brewer and private notes are untouched", async () => {
      const userA = await fixtures.user('notes-route-a');
      const userB = await fixtures.user('notes-route-b');
      const { recipe } = await fixtures.recipe(userA.id, {
        brewerNotes: ['A brewer v1', 'A brewer v2'],
      });
      await notesRequest('PUT', recipe.id, userA, { notes: 'A private' });
      const before = await fixtures.brewerNotes(recipe.id);

      const res = await notesRequest('PUT', recipe.id, userB, { notes: "B's take" });

      expect(res.status).toBe(200);
      const body = (await res.json()) as NotesBody;
      expect(body.data).toMatchObject({ recipeId: recipe.id, notes: "B's take" });
      expect(typeof body.data?.updatedAt).toBe('string');
      expect(await fixtures.brewerNotes(recipe.id)).toEqual(before);
      const [rowA] = await fixtures.noteRows(userA.id, recipe.id);
      expect(rowA.notes).toBe('A private');
      expect(rowA.deletedAt).toBeNull();
    });

    it("B cannot change A's private note on A's private recipe (404, nothing written)", async () => {
      const userA = await fixtures.user('notes-route-a');
      const userB = await fixtures.user('notes-route-b');
      const { recipe } = await fixtures.recipe(userA.id, {
        visibility: 'private',
        brewerNotes: ['A private brewer note'],
      });
      await notesRequest('PUT', recipe.id, userA, { notes: 'A own note' });
      const before = await fixtures.brewerNotes(recipe.id);

      const put = await notesRequest('PUT', recipe.id, userB, { notes: 'B overwrite' });
      const del = await notesRequest('DELETE', recipe.id, userB);

      expect(put.status).toBe(404);
      expect(del.status).toBe(404);
      expect(await fixtures.noteRows(userB.id, recipe.id)).toEqual([]);
      expect((await fixtures.noteRows(userA.id, recipe.id))[0].notes).toBe('A own note');
      expect(await fixtures.brewerNotes(recipe.id)).toEqual(before);
    });

    it('PUT and DELETE by the author and by another user never change any recipe_version.personal_notes', async () => {
      const userA = await fixtures.user('notes-route-a');
      const userB = await fixtures.user('notes-route-b');
      const { recipe } = await fixtures.recipe(userA.id, {
        brewerNotes: ['Brewer one', null, 'Brewer three'],
      });
      const before = await fixtures.brewerNotes(recipe.id);

      expect((await notesRequest('PUT', recipe.id, userA, { notes: 'A' })).status).toBe(200);
      expect((await notesRequest('PUT', recipe.id, userB, { notes: 'B' })).status).toBe(200);
      expect((await notesRequest('DELETE', recipe.id, userA)).status).toBe(200);
      expect((await notesRequest('DELETE', recipe.id, userB)).status).toBe(200);

      expect(await fixtures.brewerNotes(recipe.id)).toEqual(before);
    });

    it("ignores a userId in the body: only the caller's note is written", async () => {
      const userA = await fixtures.user('notes-route-a');
      const userB = await fixtures.user('notes-route-b');
      const { recipe } = await fixtures.recipe(userA.id);
      await notesRequest('PUT', recipe.id, userA, { notes: 'A untouched' });

      const res = await notesRequest('PUT', recipe.id, userB, { notes: 'x', userId: userA.id });

      expect(res.status).toBe(200);
      expect((await fixtures.noteRows(userB.id, recipe.id))[0].notes).toBe('x');
      expect((await fixtures.noteRows(userA.id, recipe.id))[0].notes).toBe('A untouched');
    });

    it("an admin's GET returns the admin's own (absent) note, not another user's", async () => {
      const author = await fixtures.user('notes-route-author');
      const userB = await fixtures.user('notes-route-b');
      const admin = await fixtures.user('notes-route-admin', { isAdmin: true });
      const { recipe } = await fixtures.recipe(author.id);
      await notesRequest('PUT', recipe.id, userB, { notes: 'B secret' });

      const res = await notesRequest('GET', recipe.id, admin);

      expect(res.status).toBe(200);
      expect(((await res.json()) as NotesBody).data).toEqual({
        recipeId: recipe.id,
        notes: null,
        updatedAt: null,
      });
    });
  });

  describe('GET', () => {
    it("returns the caller's note, and notes: null when there is none", async () => {
      const author = await fixtures.user('notes-route-author');
      const user = await fixtures.user('notes-route-user');
      const { recipe } = await fixtures.recipe(author.id);

      const empty = await notesRequest('GET', recipe.id, user);
      expect(empty.status).toBe(200);
      expect(((await empty.json()) as NotesBody).data).toEqual({
        recipeId: recipe.id,
        notes: null,
        updatedAt: null,
      });

      await notesRequest('PUT', recipe.id, user, { notes: 'Mine' });
      const saved = await notesRequest('GET', recipe.id, user);
      expect(((await saved.json()) as NotesBody).data?.notes).toBe('Mine');
    });
  });

  describe('status codes', () => {
    it('answers 401 to anonymous GET, PUT and DELETE', async () => {
      const author = await fixtures.user('notes-route-author');
      const { recipe } = await fixtures.recipe(author.id);

      for (const method of ['GET', 'PUT', 'DELETE'] as const) {
        const res = await notesRequest(
          method,
          recipe.id,
          null,
          method === 'PUT' ? { notes: 'x' } : undefined,
        );
        expect(res.status, method).toBe(401);
      }
    });

    it('answers 404 on private, draft, deleted and unknown recipes', async () => {
      const author = await fixtures.user('notes-route-author');
      const userB = await fixtures.user('notes-route-b');
      const { recipe: privateRecipe } = await fixtures.recipe(author.id, { visibility: 'private' });
      const { recipe: draftRecipe } = await fixtures.recipe(author.id, { visibility: 'draft' });
      const { recipe: deletedRecipe } = await fixtures.recipe(author.id, { deleted: true });
      const ids = [privateRecipe.id, draftRecipe.id, deletedRecipe.id, crypto.randomUUID()];

      for (const id of ids) {
        for (const method of ['GET', 'PUT', 'DELETE'] as const) {
          const res = await notesRequest(
            method,
            id,
            userB,
            method === 'PUT' ? { notes: 'x' } : undefined,
          );
          expect(res.status, `${method} ${id}`).toBe(404);
          expect(((await res.json()) as NotesBody).error?.code).toBe('NOT_FOUND');
        }
        expect(await fixtures.noteRows(userB.id, id)).toEqual([]);
      }
    });

    it('answers 400 on a malformed recipe id', async () => {
      const user = await fixtures.user('notes-route-user');

      for (const method of ['GET', 'PUT', 'DELETE'] as const) {
        const res = await notesRequest(
          method,
          'not-a-uuid',
          user,
          method === 'PUT' ? { notes: 'x' } : undefined,
        );
        expect(res.status, method).toBe(400);
        expect(((await res.json()) as NotesBody).error?.code).toBe('VALIDATION_ERROR');
      }
    });

    for (const [label, body] of [
      ['empty text', { notes: '' }],
      ['whitespace-only text', { notes: '   ' }],
      ['markup-only text (empty after sanitization)', { notes: '<b></b>' }],
      ['10,001 characters', { notes: 'a'.repeat(10_001) }],
      ['a missing notes field', {}],
    ] as const) {
      it(`answers 400 VALIDATION_ERROR on ${label} and writes nothing`, async () => {
        const author = await fixtures.user('notes-route-author');
        const user = await fixtures.user('notes-route-user');
        const { recipe } = await fixtures.recipe(author.id);

        const res = await notesRequest('PUT', recipe.id, user, body);

        expect(res.status).toBe(400);
        const json = (await res.json()) as NotesBody;
        expect(json.error?.code).toBe('VALIDATION_ERROR');
        expect(json.error?.details?.map((d) => d.field)).toContain('notes');
        expect(await fixtures.noteRows(user.id, recipe.id)).toEqual([]);
      });
    }

    it('stores sanitized text', async () => {
      const author = await fixtures.user('notes-route-author');
      const user = await fixtures.user('notes-route-user');
      const { recipe } = await fixtures.recipe(author.id);

      const res = await notesRequest('PUT', recipe.id, user, {
        notes: '<script>x</script>Bright​ acidity',
      });

      expect(((await res.json()) as NotesBody).data?.notes).toBe('xBright acidity');
    });
  });

  describe('DELETE', () => {
    it('is idempotent, returns the absent-note payload and a later PUT revives the same row', async () => {
      const author = await fixtures.user('notes-route-author');
      const user = await fixtures.user('notes-route-user');
      const { recipe } = await fixtures.recipe(author.id);
      const absent = { recipeId: recipe.id, notes: null, updatedAt: null };

      const none = await notesRequest('DELETE', recipe.id, user);
      expect(none.status).toBe(200);
      expect(((await none.json()) as NotesBody).data).toEqual(absent);

      await notesRequest('PUT', recipe.id, user, { notes: 'first' });
      const [original] = await fixtures.noteRows(user.id, recipe.id);
      for (let i = 0; i < 2; i++) {
        const res = await notesRequest('DELETE', recipe.id, user);
        expect(res.status).toBe(200);
        expect(((await res.json()) as NotesBody).data).toEqual(absent);
      }
      const [scrubbed] = await fixtures.noteRows(user.id, recipe.id);
      expect(scrubbed.notes).toBe('');
      expect(scrubbed.deletedAt).not.toBeNull();
      expect(
        ((await (await notesRequest('GET', recipe.id, user)).json()) as NotesBody).data,
      ).toEqual(absent);

      await notesRequest('PUT', recipe.id, user, { notes: 'again' });
      const rows = await fixtures.noteRows(user.id, recipe.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(original.id);
      expect(rows[0].notes).toBe('again');
      expect(rows[0].deletedAt).toBeNull();
    });
  });

  describe('Cache-Control', () => {
    it('sends private, no-store on 200, 400, 401 and 404 responses', async () => {
      const author = await fixtures.user('notes-route-author');
      const user = await fixtures.user('notes-route-user');
      const { recipe } = await fixtures.recipe(author.id);
      const { recipe: privateRecipe } = await fixtures.recipe(author.id, { visibility: 'private' });

      const responses = [
        await notesRequest('GET', recipe.id, user),
        await notesRequest('PUT', recipe.id, user, { notes: 'cached?' }),
        await notesRequest('DELETE', recipe.id, user),
        await notesRequest('PUT', recipe.id, user, { notes: '' }),
        await notesRequest('GET', 'not-a-uuid', user),
        await notesRequest('GET', recipe.id, null),
        await notesRequest('GET', privateRecipe.id, user),
      ];

      expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 400, 400, 401, 404]);
      for (const res of responses) {
        expect(res.headers.get('Cache-Control')).toBe(NOTES_CACHE_CONTROL);
      }
    });
  });

  describe('email verification', () => {
    it('lets a user with an unverified email save a private note', async () => {
      const author = await fixtures.user('notes-route-author');
      const unverified = await fixtures.user('notes-route-unverified', { emailVerified: false });
      const { recipe } = await fixtures.recipe(author.id);

      const res = await notesRequest('PUT', recipe.id, unverified, { notes: 'Personal state' });

      expect(res.status).toBe(200);
      expect(((await res.json()) as NotesBody).data?.notes).toBe('Personal state');
    });
  });

  describe('no leak to other surfaces', () => {
    it("search does not match B's private note token", async () => {
      const author = await fixtures.user('notes-route-author');
      const userB = await fixtures.user('notes-route-b');
      const { recipe } = await fixtures.recipe(author.id);
      const token = `zq7private${crypto.randomUUID().slice(0, 8)}`;
      await notesRequest('PUT', recipe.id, userB, { notes: `Secret ${token} ratio` });
      const titleToken = recipe.title.split(' ').at(-1) as string;

      const control = await buildApp().request(`/api/v1/recipes?search=${titleToken}`);
      const controlBody = (await control.json()) as { data: Array<{ id: string }> };
      expect(controlBody.data.map((r) => r.id)).toContain(recipe.id);

      for (const authorization of [await bearer(userB), null]) {
        const res = await buildApp().request(`/api/v1/recipes?search=${token}`, {
          headers: authorization ? { Authorization: authorization } : {},
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: unknown[] };
        expect(body.data).toEqual([]);
        expect(JSON.stringify(body)).not.toContain(token);
      }
    });

    it("the recipe detail payload never contains B's private note", async () => {
      const author = await fixtures.user('notes-route-author');
      const userB = await fixtures.user('notes-route-b');
      const { recipe } = await fixtures.recipe(author.id, { brewerNotes: ['Public brewer note'] });
      const secret = `zq7detail${crypto.randomUUID().slice(0, 8)}`;
      await notesRequest('PUT', recipe.id, userB, { notes: secret });

      for (const authorization of [await bearer(userB), null]) {
        for (const key of [recipe.slug, recipe.id]) {
          const res = await buildApp().request(`/api/v1/recipes/${key}`, {
            headers: authorization ? { Authorization: authorization } : {},
          });
          expect(res.status).toBe(200);
          const text = await res.text();
          expect(text).toContain('Public brewer note');
          expect(text).not.toContain(secret);
        }
      }
    });
  });
});
