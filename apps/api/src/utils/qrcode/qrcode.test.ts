import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { ensureUniqueSlug, generateSlug } from '@brewform/shared/utils';

describe('QR Code Utils — Integration', () => {
  describe('Slug generation for QR codes', () => {
    it('should create valid slugs for recipe URLs', () => {
      const title = 'My Espresso Recipe';
      const slug = generateSlug(title);
      expect(slug).toBe('my-espresso-recipe');
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    });

    it('should ensure slug uniqueness', () => {
      const existing = ['my-recipe', 'my-recipe-1'];
      const slug = ensureUniqueSlug('my-recipe', existing);
      expect(slug).toBe('my-recipe-2');
    });
  });
});
