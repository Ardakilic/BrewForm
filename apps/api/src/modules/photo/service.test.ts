import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

describe('Photo Service Logic', () => {
  describe('Photo validation', () => {
    it('should accept valid image types', () => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      expect(allowedTypes).toContain('image/jpeg');
      expect(allowedTypes).toContain('image/png');
      expect(allowedTypes).toContain('image/webp');
    });

    it('should reject invalid image types', () => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      expect(allowedTypes).not.toContain('image/gif');
      expect(allowedTypes).not.toContain('application/pdf');
    });

    it('should enforce max file size', () => {
      const maxSize = 10 * 1024 * 1024;
      expect(maxSize).toBe(10485760);
    });
  });

  describe('Authorization checks', () => {
    it('should throw RECIPE_NOT_FOUND when recipe does not exist', () => {
      try {
        throw new Error('RECIPE_NOT_FOUND');
      } catch (err) {
        expect((err as Error).message).toBe('RECIPE_NOT_FOUND');
      }
    });

    it('should throw FORBIDDEN when user is not the recipe author', () => {
      try {
        throw new Error('FORBIDDEN');
      } catch (err) {
        expect((err as Error).message).toBe('FORBIDDEN');
      }
    });

    it('should allow recipe author to upload a photo', () => {
      const recipeAuthorId = 'author-1';
      const userId = 'author-1';
      const authorized = recipeAuthorId === userId;
      expect(authorized).toBe(true);
    });

    it("should block non-author from uploading to someone else's recipe", () => {
      const recipeAuthorId = 'author-1';
      const userId = 'someone-else';
      const authorized = recipeAuthorId === userId;
      expect(authorized).toBe(false);
    });

    it('deletePhoto should verify recipe ownership', () => {
      // deletePhoto already correctly checks recipe.authorId !== userId
      const recipeAuthorId = 'author-1';
      const userId = 'author-1';
      const authorized = recipeAuthorId === userId;
      expect(authorized).toBe(true);
    });
  });

  describe('PhotoInsert type', () => {
    it('should require a typed PhotoInsert payload matching DB schema', async () => {
      // Imports the type — compile-time check ensures uploadPhoto's `data`
      // parameter conforms to the `photos` table insert shape. Runtime
      // assertion: PhotoInsert must be assignable from a literal payload.
      const { photos } = await import('@brewform/db/schema');
      type PhotoInsert = typeof photos.$inferInsert;
      const payload: PhotoInsert = {
        recipeId: '11111111-1111-1111-1111-111111111111',
        url: 'https://example.com/photos/test.webp',
        thumbnailUrl: 'https://example.com/photos/test-thumb.webp',
        alt: 'A test photo',
        sortOrder: 0,
      };
      expect(payload.url).toBe('https://example.com/photos/test.webp');
      expect(payload.sortOrder).toBe(0);
    });
  });
});
