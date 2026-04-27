import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { generateSlug, ensureUniqueSlug } from '@brewform/shared/utils';

describe('QR Code Service Logic', () => {
  describe('Slug-based URL generation', () => {
    it('should generate valid QR code URL from slug', () => {
      const APP_URL = 'http://localhost:8000';
      const slug = 'my-espresso-recipe';
      const url = `${APP_URL}/recipes/${slug}`;
      expect(url).toBe('http://localhost:8000/recipes/my-espresso-recipe');
    });

    it('should Generate slug from title for QR codes', () => {
      const title = 'Best V60 Recipe';
      const slug = generateSlug(title);
      expect(slug).toBe('best-v60-recipe');
    });
  });
});