import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { generateSlug, ensureUniqueSlug } from './slug.ts';

describe('Slug Utilities', () => {
  describe('generateSlug', () => {
    it('should convert a simple title to a slug', () => {
      expect(generateSlug('My Espresso Recipe')).toBe('my-espresso-recipe');
    });

    it('should lowercase the title', () => {
      expect(generateSlug('ESPRESSO RECIPE')).toBe('espresso-recipe');
    });

    it('should remove special characters', () => {
      const result = generateSlug('Coffee & Tea #1!');
      expect(result).toMatch(/^[a-z0-9-]+$/);
      expect(result).toBe('coffee-tea-1');
    });

    it('should replace spaces with hyphens', () => {
      expect(generateSlug('v60 pour over')).toBe('v60-pour-over');
    });

    it('should collapse multiple hyphens', () => {
      const result = generateSlug('A --- B');
      expect(result).toBe('a-b');
    });

    it('should trim leading and trailing hyphens', () => {
      expect(generateSlug('  hello  ')).toBe('hello');
    });

    it('should truncate to 100 characters', () => {
      const longTitle = 'a'.repeat(150);
      expect(generateSlug(longTitle).length).toBeLessThanOrEqual(100);
    });

    it('should handle empty string', () => {
      expect(generateSlug('')).toBe('');
    });
  });

  describe('ensureUniqueSlug', () => {
    it('should return the slug if not in existing list', () => {
      expect(ensureUniqueSlug('my-recipe', ['other-recipe'])).toBe('my-recipe');
    });

    it('should append counter if slug exists', () => {
      expect(ensureUniqueSlug('my-recipe', ['my-recipe'])).toBe('my-recipe-1');
    });

    it('should increment counter until unique', () => {
      expect(ensureUniqueSlug('my-recipe', ['my-recipe', 'my-recipe-1'])).toBe('my-recipe-2');
    });

    it('should handle empty existing array', () => {
      expect(ensureUniqueSlug('my-recipe', [])).toBe('my-recipe');
    });
  });
});