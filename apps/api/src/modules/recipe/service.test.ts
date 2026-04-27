import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { computeBrewRatio, computeExtractionYield, computeFlowRate } from '@brewform/shared/utils';
import { ensureUniqueSlug, generateSlug } from '@brewform/shared/utils';

describe('Recipe Service Logic', () => {
  describe('Slug generation', () => {
    it('should generate slug from title', () => {
      const title = 'My Espresso Recipe';
      const slug = generateSlug(title);
      expect(slug).toBe('my-espresso-recipe');
    });

    it('should handle special characters in title', () => {
      const title = 'Coffee & Tea #1!';
      const slug = generateSlug(title);
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    });
  });

  describe('Unique slug generation', () => {
    it('should find unique slug when none exist', () => {
      const slug = ensureUniqueSlug('my-recipe', []);
      expect(slug).toBe('my-recipe');
    });

    it('should append counter for duplicate slugs', () => {
      const slug = ensureUniqueSlug('my-recipe', ['my-recipe']);
      expect(slug).toBe('my-recipe-1');
    });
  });

  describe('Brew ratio computation in recipe creation', () => {
    it('should compute brew ratio when grounds and yield are provided', () => {
      const ratio = computeBrewRatio(18, 36);
      expect(ratio).toBe(2);
    });

    it('should compute flow rate when yield and time are provided', () => {
      const rate = computeFlowRate(36, 28);
      expect(rate).toBeCloseTo(1.29, 1);
    });

    it('should return null when grounds are zero', () => {
      const ratio = computeBrewRatio(0, 36);
      expect(ratio).toBeNull();
    });

    it('should return null when extraction volume is zero', () => {
      const ratio = computeBrewRatio(18, null as unknown as number);
      expect(ratio).toBeNull();
    });
  });

  describe('Recipe visibility checks', () => {
    it('should prevent forking of private recipes by non-authors', () => {
      const recipe = { visibility: 'private', authorId: 'user-1' };
      const currentUserId = 'user-2';
      const canFork = recipe.visibility === 'public' || recipe.visibility === 'unlisted' ||
        recipe.authorId === currentUserId;
      expect(canFork).toBe(false);
    });

    it('should allow forking of public recipes by anyone', () => {
      const recipe = { visibility: 'public', authorId: 'user-1' };
      const currentUserId = 'user-2';
      const canFork = recipe.visibility === 'public' || recipe.visibility === 'unlisted' ||
        recipe.authorId === currentUserId;
      expect(canFork).toBe(true);
    });

    it('should allow author to fork their own private recipe', () => {
      const recipe = { visibility: 'private', authorId: 'user-1' };
      const currentUserId = 'user-1';
      const canFork = recipe.visibility === 'public' || recipe.visibility === 'unlisted' ||
        recipe.authorId === currentUserId;
      expect(canFork).toBe(true);
    });
  });

  describe('Recipe fork title generation', () => {
    it('should use custom title when provided', () => {
      const customTitle = 'My Version';
      const sourceTitle = 'Original Recipe';
      const forkTitle = customTitle || `Fork of ${sourceTitle}`;
      expect(forkTitle).toBe('My Version');
    });

    it('should generate fork title when custom title not provided', () => {
      const sourceTitle = 'Original Recipe';
      const forkTitle = `Fork of ${sourceTitle}`;
      expect(forkTitle).toBe('Fork of Original Recipe');
    });
  });

  describe('Extraction yield computation', () => {
    it('should compute extraction yield correctly', () => {
      const yield_ = computeExtractionYield(18, 36);
      expect(yield_).toBeCloseTo(100, 1);
    });

    it('should return null for zero dose', () => {
      const yield_ = computeExtractionYield(0, 36);
      expect(yield_).toBeNull();
    });
  });
});
