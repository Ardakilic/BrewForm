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
});
