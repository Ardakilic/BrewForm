/**
 * DB-backed tests for the private recipe notes data-access layer
 * (`recipe-note/model.ts`): upsert create/replace, soft delete with scrubbing,
 * revival in the same row, live-only reads, per-user isolation and the
 * minimal recipe projection.
 */
import '../../test-setup.ts';
import { afterEach, describe, expect, it } from 'vitest';
import * as model from './model.ts';
import { NoteFixtures } from './test-helpers.ts';

describe('recipe-note model', () => {
  const fixtures = new NoteFixtures();

  afterEach(async () => {
    await fixtures.cleanup();
  });

  describe('upsertNote', () => {
    it('creates a row, then replaces the same row on a second save', async () => {
      const author = await fixtures.user('note-model-author');
      const user = await fixtures.user('note-model-user');
      const { recipe } = await fixtures.recipe(author.id);

      const first = await model.upsertNote(user.id, recipe.id, 'First take');
      expect(first.userId).toBe(user.id);
      expect(first.recipeId).toBe(recipe.id);
      expect(first.notes).toBe('First take');
      expect(first.deletedAt).toBeNull();

      const second = await model.upsertNote(user.id, recipe.id, 'Second take');
      expect(second.id).toBe(first.id);
      expect(second.notes).toBe('Second take');
      expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());

      const rows = await fixtures.noteRows(user.id, recipe.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].notes).toBe('Second take');
    });
  });

  describe('softDeleteNote', () => {
    it('sets deletedAt and scrubs the text', async () => {
      const author = await fixtures.user('note-model-author');
      const user = await fixtures.user('note-model-user');
      const { recipe } = await fixtures.recipe(author.id);
      await model.upsertNote(user.id, recipe.id, 'Secret ratio');

      expect(await model.softDeleteNote(user.id, recipe.id)).toBe(1);

      const [row] = await fixtures.noteRows(user.id, recipe.id);
      expect(row.deletedAt).toBeInstanceOf(Date);
      expect(row.notes).toBe('');
    });

    it('is a no-op (0 rows) when there is no live note', async () => {
      const author = await fixtures.user('note-model-author');
      const user = await fixtures.user('note-model-user');
      const { recipe } = await fixtures.recipe(author.id);

      expect(await model.softDeleteNote(user.id, recipe.id)).toBe(0);
      await model.upsertNote(user.id, recipe.id, 'x');
      expect(await model.softDeleteNote(user.id, recipe.id)).toBe(1);
      expect(await model.softDeleteNote(user.id, recipe.id)).toBe(0);
    });

    it('revives the same row id when the note is saved again', async () => {
      const author = await fixtures.user('note-model-author');
      const user = await fixtures.user('note-model-user');
      const { recipe } = await fixtures.recipe(author.id);
      const original = await model.upsertNote(user.id, recipe.id, 'before');
      await model.softDeleteNote(user.id, recipe.id);

      const revived = await model.upsertNote(user.id, recipe.id, 'again');

      expect(revived.id).toBe(original.id);
      expect(revived.notes).toBe('again');
      expect(revived.deletedAt).toBeNull();
      expect(await fixtures.noteRows(user.id, recipe.id)).toHaveLength(1);
    });
  });

  describe('findNote', () => {
    it('returns the live note and ignores soft-deleted rows', async () => {
      const author = await fixtures.user('note-model-author');
      const user = await fixtures.user('note-model-user');
      const { recipe } = await fixtures.recipe(author.id);

      expect(await model.findNote(user.id, recipe.id)).toBeUndefined();
      await model.upsertNote(user.id, recipe.id, 'live');
      expect((await model.findNote(user.id, recipe.id))?.notes).toBe('live');

      await model.softDeleteNote(user.id, recipe.id);
      expect(await model.findNote(user.id, recipe.id)).toBeUndefined();
    });
  });

  describe('per-user isolation', () => {
    it("never reads, replaces or deletes another user's note on the same recipe", async () => {
      const author = await fixtures.user('note-model-author');
      const userA = await fixtures.user('note-model-a');
      const userB = await fixtures.user('note-model-b');
      const { recipe } = await fixtures.recipe(author.id);
      await model.upsertNote(userA.id, recipe.id, 'A private');
      await model.upsertNote(userB.id, recipe.id, 'B private');

      expect((await model.findNote(userA.id, recipe.id))?.notes).toBe('A private');
      expect((await model.findNote(userB.id, recipe.id))?.notes).toBe('B private');

      await model.upsertNote(userB.id, recipe.id, 'B replaced');
      await model.softDeleteNote(userB.id, recipe.id);

      const [rowA] = await fixtures.noteRows(userA.id, recipe.id);
      expect(rowA.notes).toBe('A private');
      expect(rowA.deletedAt).toBeNull();
      expect(await model.findNote(userB.id, recipe.id)).toBeUndefined();
    });
  });

  describe('softDeleteAllNotesForUser', () => {
    it("soft-deletes and scrubs every live note of one user and leaves others' notes", async () => {
      const author = await fixtures.user('note-model-author');
      const user = await fixtures.user('note-model-user');
      const other = await fixtures.user('note-model-other');
      const { recipe: r1 } = await fixtures.recipe(author.id);
      const { recipe: r2 } = await fixtures.recipe(author.id);
      await model.upsertNote(user.id, r1.id, 'one');
      await model.upsertNote(user.id, r2.id, 'two');
      await model.upsertNote(other.id, r1.id, 'other');

      expect(await model.softDeleteAllNotesForUser(user.id)).toBe(2);

      for (const recipeId of [r1.id, r2.id]) {
        const [row] = await fixtures.noteRows(user.id, recipeId);
        expect(row.deletedAt).toBeInstanceOf(Date);
        expect(row.notes).toBe('');
      }
      expect((await model.findNote(other.id, r1.id))?.notes).toBe('other');
      expect(await model.softDeleteAllNotesForUser(user.id)).toBe(0);
    });
  });

  describe('findRecipeForNotes', () => {
    it('returns the minimal projection of a live recipe', async () => {
      const author = await fixtures.user('note-model-author');
      const { recipe } = await fixtures.recipe(author.id, { visibility: 'private' });

      expect(await model.findRecipeForNotes(recipe.id)).toEqual({
        id: recipe.id,
        authorId: author.id,
        visibility: 'private',
      });
    });

    it('returns undefined for a soft-deleted or unknown recipe', async () => {
      const author = await fixtures.user('note-model-author');
      const { recipe } = await fixtures.recipe(author.id, { deleted: true });

      expect(await model.findRecipeForNotes(recipe.id)).toBeUndefined();
      expect(await model.findRecipeForNotes(crypto.randomUUID())).toBeUndefined();
    });
  });
});
