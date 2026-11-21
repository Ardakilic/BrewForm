/**
 * DB-backed tests for the private recipe notes service (`recipe-note/service.ts`):
 * cross-user isolation, the existence-hiding 404 rules, sanitization, the
 * empty-after-sanitize rejection, admin limits, idempotent delete, account
 * cleanup, and a log spy proving that note text never reaches a log line.
 */
import '../../test-setup.ts';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { NotFoundError, ValidationError } from '../../utils/errors.ts';
import * as service from './service.ts';
import { NoteFixtures } from './test-helpers.ts';

describe('recipe-note service', () => {
  const fixtures = new NoteFixtures();

  afterEach(async () => {
    await fixtures.cleanup();
  });

  describe('cross-user isolation', () => {
    it("returns only the caller's own note", async () => {
      const author = await fixtures.user('note-svc-author');
      const userA = await fixtures.user('note-svc-a');
      const userB = await fixtures.user('note-svc-b');
      const { recipe } = await fixtures.recipe(author.id);
      await service.saveMyNote(userA.id, recipe.id, 'A only', false);
      await service.saveMyNote(userB.id, recipe.id, 'B only', false);

      const forB = await service.getMyNote(userB.id, recipe.id, false);
      expect(forB.notes).toBe('B only');
      expect(JSON.stringify(forB)).not.toContain('A only');
      expect((await service.getMyNote(userA.id, recipe.id, false)).notes).toBe('A only');
    });

    it("saving and deleting never change another user's note or the brewer notes", async () => {
      const author = await fixtures.user('note-svc-author');
      const userB = await fixtures.user('note-svc-b');
      const { recipe } = await fixtures.recipe(author.id, {
        brewerNotes: ['Brewer v1', 'Brewer v2'],
      });
      await service.saveMyNote(author.id, recipe.id, 'Author private', false);
      const before = await fixtures.brewerNotes(recipe.id);

      await service.saveMyNote(userB.id, recipe.id, 'B take', false);
      await service.deleteMyNote(userB.id, recipe.id, false);

      expect(await fixtures.brewerNotes(recipe.id)).toEqual(before);
      expect((await service.getMyNote(author.id, recipe.id, false)).notes).toBe('Author private');
    });

    it('returns notes: null and updatedAt: null when the caller has no note', async () => {
      const author = await fixtures.user('note-svc-author');
      const userB = await fixtures.user('note-svc-b');
      const { recipe } = await fixtures.recipe(author.id);

      expect(await service.getMyNote(userB.id, recipe.id, false)).toEqual({
        recipeId: recipe.id,
        notes: null,
        updatedAt: null,
      });
    });
  });

  describe('404 rules (existence hiding)', () => {
    for (const visibility of ['private', 'draft'] as const) {
      it(`rejects get/save/delete by a non-author on a ${visibility} recipe and writes nothing`, async () => {
        const author = await fixtures.user('note-svc-author');
        const userB = await fixtures.user('note-svc-b');
        const { recipe } = await fixtures.recipe(author.id, { visibility });

        await expect(service.getMyNote(userB.id, recipe.id, false)).rejects.toBeInstanceOf(
          NotFoundError,
        );
        await expect(service.saveMyNote(userB.id, recipe.id, 'x', false)).rejects.toBeInstanceOf(
          NotFoundError,
        );
        await expect(service.deleteMyNote(userB.id, recipe.id, false)).rejects.toBeInstanceOf(
          NotFoundError,
        );
        expect(await fixtures.noteRows(userB.id, recipe.id)).toEqual([]);
      });

      it(`lets the author keep a private note on their own ${visibility} recipe`, async () => {
        const author = await fixtures.user('note-svc-author');
        const { recipe } = await fixtures.recipe(author.id, { visibility });

        const saved = await service.saveMyNote(author.id, recipe.id, 'Mine', false);
        expect(saved.notes).toBe('Mine');
      });
    }

    it('allows unlisted recipes (viewable by link)', async () => {
      const author = await fixtures.user('note-svc-author');
      const userB = await fixtures.user('note-svc-b');
      const { recipe } = await fixtures.recipe(author.id, { visibility: 'unlisted' });

      expect((await service.saveMyNote(userB.id, recipe.id, 'Link find', false)).notes).toBe(
        'Link find',
      );
    });

    it('rejects a soft-deleted recipe, even for its author', async () => {
      const author = await fixtures.user('note-svc-author');
      const { recipe } = await fixtures.recipe(author.id, { deleted: true });

      await expect(service.getMyNote(author.id, recipe.id, false)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(service.saveMyNote(author.id, recipe.id, 'x', false)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(await fixtures.noteRows(author.id, recipe.id)).toEqual([]);
    });

    it('rejects an unknown recipe id with a 404 NOT_FOUND error', async () => {
      const user = await fixtures.user('note-svc-user');
      const err = await service.getMyNote(user.id, crypto.randomUUID(), false).catch((e) => e);

      expect(err).toBeInstanceOf(NotFoundError);
      expect(err.status).toBe(404);
      expect(err.code).toBe('NOT_FOUND');
      expect(err.message).toBe('Recipe not found');
    });
  });

  describe('sanitization', () => {
    it('strips markup and zero-width characters before storing', async () => {
      const author = await fixtures.user('note-svc-author');
      const user = await fixtures.user('note-svc-user');
      const { recipe } = await fixtures.recipe(author.id);

      const saved = await service.saveMyNote(
        user.id,
        recipe.id,
        '<script>x</script>Bright​ acidity',
        false,
      );

      expect(saved.notes).toBe('xBright acidity');
      const [row] = await fixtures.noteRows(user.id, recipe.id);
      expect(row.notes).toBe('xBright acidity');
    });

    for (const input of ['<b></b>', '   ', '​​']) {
      it(`rejects ${JSON.stringify(input)} (empty after sanitization) and writes nothing`, async () => {
        const author = await fixtures.user('note-svc-author');
        const user = await fixtures.user('note-svc-user');
        const { recipe } = await fixtures.recipe(author.id);

        const err = await service.saveMyNote(user.id, recipe.id, input, false).catch((e) => e);

        expect(err).toBeInstanceOf(ValidationError);
        expect(err.status).toBe(400);
        expect(err.code).toBe('VALIDATION_ERROR');
        expect(err.details).toEqual([expect.objectContaining({ field: 'notes' })]);
        expect(await fixtures.noteRows(user.id, recipe.id)).toEqual([]);
      });
    }
  });

  describe('admin', () => {
    it("cannot read another user's note (gets their own, absent, note)", async () => {
      const author = await fixtures.user('note-svc-author');
      const userB = await fixtures.user('note-svc-b');
      const admin = await fixtures.user('note-svc-admin', { isAdmin: true });
      const { recipe } = await fixtures.recipe(author.id);
      await service.saveMyNote(userB.id, recipe.id, 'B secret', false);

      const forAdmin = await service.getMyNote(admin.id, recipe.id, true);

      expect(forAdmin).toEqual({ recipeId: recipe.id, notes: null, updatedAt: null });
    });

    it('may keep their own note on a private recipe they can view', async () => {
      const author = await fixtures.user('note-svc-author');
      const admin = await fixtures.user('note-svc-admin', { isAdmin: true });
      const { recipe } = await fixtures.recipe(author.id, { visibility: 'private' });

      expect((await service.saveMyNote(admin.id, recipe.id, 'Admin own', true)).notes).toBe(
        'Admin own',
      );
      expect((await service.getMyNote(author.id, recipe.id, false)).notes).toBeNull();
    });
  });

  describe('deleteMyNote', () => {
    it('is idempotent and returns the absent-note payload', async () => {
      const author = await fixtures.user('note-svc-author');
      const user = await fixtures.user('note-svc-user');
      const { recipe } = await fixtures.recipe(author.id);
      const absent = { recipeId: recipe.id, notes: null, updatedAt: null };

      expect(await service.deleteMyNote(user.id, recipe.id, false)).toEqual(absent);
      await service.saveMyNote(user.id, recipe.id, 'temp', false);
      expect(await service.deleteMyNote(user.id, recipe.id, false)).toEqual(absent);
      expect(await service.deleteMyNote(user.id, recipe.id, false)).toEqual(absent);
      expect(await service.getMyNote(user.id, recipe.id, false)).toEqual(absent);
    });
  });

  describe('deleteAllNotesForUser', () => {
    it("soft-deletes and scrubs every note of the user, including on recipes they can't view now", async () => {
      const author = await fixtures.user('note-svc-author');
      const user = await fixtures.user('note-svc-user');
      const { recipe: r1 } = await fixtures.recipe(author.id);
      const { recipe: r2 } = await fixtures.recipe(author.id);
      await service.saveMyNote(user.id, r1.id, 'one', false);
      await service.saveMyNote(user.id, r2.id, 'two', false);

      expect(await service.deleteAllNotesForUser(user.id)).toBe(2);

      for (const recipeId of [r1.id, r2.id]) {
        const [row] = await fixtures.noteRows(user.id, recipeId);
        expect(row.deletedAt).toBeInstanceOf(Date);
        expect(row.notes).toBe('');
      }
    });
  });

  describe('logging', () => {
    const SECRET = 'zq7secret-ratio';
    let debugSpy: MockInstance;
    let errorSpy: MockInstance;

    beforeEach(() => {
      debugSpy = vi.spyOn(service.log, 'debug');
      errorSpy = vi.spyOn(service.log, 'error');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** Every argument passed to the spied log methods, serialized. */
    function loggedText(): string {
      return JSON.stringify([...debugSpy.mock.calls, ...errorSpy.mock.calls]);
    }

    it('logs entry/exit with ids only and never the note text', async () => {
      const author = await fixtures.user('note-svc-author');
      const user = await fixtures.user('note-svc-user');
      const { recipe } = await fixtures.recipe(author.id);

      await service.saveMyNote(user.id, recipe.id, SECRET, false);
      await service.getMyNote(user.id, recipe.id, false);
      await service.deleteMyNote(user.id, recipe.id, false);
      await service.deleteAllNotesForUser(user.id);

      const messages = debugSpy.mock.calls.map((call) => call[1]);
      expect(messages).toEqual([
        'saveMyNote started',
        'saveMyNote completed',
        'getMyNote started',
        'getMyNote completed',
        'deleteMyNote started',
        'deleteMyNote completed',
        'deleteAllNotesForUser started',
        'deleteAllNotesForUser completed',
      ]);
      expect(debugSpy).toHaveBeenNthCalledWith(
        1,
        { userId: user.id, recipeId: recipe.id },
        'saveMyNote started',
      );
      for (const [context] of debugSpy.mock.calls) {
        expect(context).not.toHaveProperty('notes');
      }
      expect(loggedText()).not.toContain(SECRET);
    });

    it('logs failures with the error and ids but without the note text', async () => {
      const author = await fixtures.user('note-svc-author');
      const userB = await fixtures.user('note-svc-b');
      const { recipe } = await fixtures.recipe(author.id, { visibility: 'private' });

      await expect(service.saveMyNote(userB.id, recipe.id, SECRET, false)).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const [context, message] = errorSpy.mock.calls[0];
      expect(message).toBe('saveMyNote failed');
      expect(context).toMatchObject({ userId: userB.id, recipeId: recipe.id });
      expect(context.err).toMatchObject({ type: 'NotFoundError', message: 'Recipe not found' });
      expect(loggedText()).not.toContain(SECRET);
    });

    it('keeps the note text out of the log when the database rejects the write', async () => {
      const author = await fixtures.user('note-svc-author');
      const user = await fixtures.user('note-svc-user');
      const { recipe } = await fixtures.recipe(author.id);
      // Bypasses RecipeNotesSchema on purpose: the CHECK constraint fails and
      // Drizzle's error message embeds the bound parameters (the note text).
      const tooLong = `${SECRET} ${'a'.repeat(10_001)}`;

      await expect(service.saveMyNote(user.id, recipe.id, tooLong, false)).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0][1]).toBe('saveMyNote failed');
      expect(loggedText()).not.toContain(SECRET);
    });
  });
});
