/**
 * Slug Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import {
  createSlug,
  createUniqueSlug,
  createNumberedSlug,
  isValidSlug,
  sanitizeSlug,
  createRecipeSlug,
  createEquipmentSlug,
  createVendorSlug,
  createCoffeeSlug,
  extractBaseSlug,
  createComparisonToken,
} from './index.js';

describe('Slug Utilities', () => {
  describe('createSlug', () => {
    it('should convert text to lowercase slug', () => {
      expect(createSlug('Hello World')).toBe('hello-world');
    });

    it('should remove special characters', () => {
      expect(createSlug('Coffee & Tea!')).toBe('coffee-and-tea');
    });

    it('should trim whitespace', () => {
      expect(createSlug('  Espresso Recipe  ')).toBe('espresso-recipe');
    });

    it('should handle multiple spaces', () => {
      expect(createSlug('My   Great   Recipe')).toBe('my-great-recipe');
    });

    it('should handle unicode characters', () => {
      expect(createSlug('Café Latte')).toBe('cafe-latte');
    });

    it('should handle numbers', () => {
      expect(createSlug('Recipe 123')).toBe('recipe-123');
    });
  });

  describe('createUniqueSlug', () => {
    it('should create slug with unique suffix', () => {
      const slug = createUniqueSlug('My Recipe');
      expect(slug).toMatch(/^my-recipe-[a-zA-Z0-9_-]+$/);
    });

    it('should generate different slugs for same input', () => {
      const slug1 = createUniqueSlug('Test');
      const slug2 = createUniqueSlug('Test');
      expect(slug1).not.toBe(slug2);
    });
  });

  describe('createNumberedSlug', () => {
    it('should create slug without number when counter is 0', () => {
      expect(createNumberedSlug('My Recipe', 0)).toBe('my-recipe');
    });

    it('should append number when counter > 0', () => {
      expect(createNumberedSlug('My Recipe', 1)).toBe('my-recipe-1');
      expect(createNumberedSlug('My Recipe', 5)).toBe('my-recipe-5');
    });
  });

  describe('isValidSlug', () => {
    it('should return true for valid slugs', () => {
      expect(isValidSlug('hello-world')).toBe(true);
      expect(isValidSlug('recipe-123')).toBe(true);
      expect(isValidSlug('a')).toBe(true);
      expect(isValidSlug('test')).toBe(true);
    });

    it('should return false for invalid slugs', () => {
      expect(isValidSlug('Hello-World')).toBe(false);
      expect(isValidSlug('hello_world')).toBe(false);
      expect(isValidSlug('hello--world')).toBe(false);
      expect(isValidSlug('-hello')).toBe(false);
      expect(isValidSlug('hello-')).toBe(false);
      expect(isValidSlug('')).toBe(false);
    });
  });

  describe('sanitizeSlug', () => {
    it('should sanitize invalid slugs', () => {
      expect(sanitizeSlug('Hello World!')).toBe('hello-world');
      expect(sanitizeSlug('TEST SLUG')).toBe('test-slug');
    });
  });

  describe('createRecipeSlug', () => {
    it('should create unique recipe slug', () => {
      const slug = createRecipeSlug('Perfect Espresso');
      expect(slug).toMatch(/^perfect-espresso-[a-zA-Z0-9_-]+$/);
    });
  });

  describe('createEquipmentSlug', () => {
    it('should combine brand and model', () => {
      expect(createEquipmentSlug('Niche', 'Zero')).toBe('niche-zero');
      expect(createEquipmentSlug('La Marzocco', 'Linea Mini')).toBe('la-marzocco-linea-mini');
    });
  });

  describe('createVendorSlug', () => {
    it('should create vendor slug', () => {
      expect(createVendorSlug('Blue Bottle Coffee')).toBe('blue-bottle-coffee');
    });
  });

  describe('createCoffeeSlug', () => {
    it('should create unique coffee slug with name only', () => {
      const slug = createCoffeeSlug('Ethiopia Yirgacheffe');
      expect(slug).toMatch(/^ethiopia-yirgacheffe-[a-zA-Z0-9_-]+$/);
    });

    it('should include vendor name when provided', () => {
      const slug = createCoffeeSlug('Ethiopia Yirgacheffe', 'Blue Bottle');
      // Slug includes vendor prefix with separator
      expect(slug).toMatch(/^blue-bottle-ethiopia-yirgacheffe-/);
    });
  });

  describe('extractBaseSlug', () => {
    it('should remove 8-character nanoid suffix', () => {
      expect(extractBaseSlug('my-recipe-aBcD1234')).toBe('my-recipe');
      expect(extractBaseSlug('test-slug-12345678')).toBe('test-slug');
    });

    it('should return original if no valid suffix', () => {
      expect(extractBaseSlug('my-recipe')).toBe('my-recipe');
      expect(extractBaseSlug('my-recipe-123')).toBe('my-recipe-123');
    });
  });

  describe('createComparisonToken', () => {
    it('should create 16-character token', () => {
      const token = createComparisonToken();
      expect(token).toHaveLength(16);
    });

    it('should generate unique tokens', () => {
      const token1 = createComparisonToken();
      const token2 = createComparisonToken();
      expect(token1).not.toBe(token2);
    });
  });
});
