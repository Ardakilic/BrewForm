import { afterEach, describe, expect, it, vi } from 'vitest';
import { SlugSchema } from '../schemas/common.ts';
import {
  generateSlug,
  isReservedRecipeSlug,
  RESERVED_RECIPE_SLUGS,
  randomSlugSuffix,
  slugCandidates,
} from './slug.ts';

/** Pattern of one random slug suffix (6 characters from the no-vowel alphabet). */
const SFX = /^[23456789bcdfghjkmnpqrstvwxz]{6}$/;

describe('Slug Utilities', () => {
  describe('generateSlug', () => {
    it('should convert a simple title to a slug', () => {
      expect(generateSlug('My Espresso Recipe')).toBe('my-espresso-recipe');
    });

    it('should remove special characters and collapse separators', () => {
      expect(generateSlug('Coffee & Tea #1!')).toBe('coffee-tea-1');
      expect(generateSlug('A --- B')).toBe('a-b');
      expect(generateSlug('  hello  ')).toBe('hello');
    });

    it('should transliterate Turkish titles', () => {
      expect(generateSlug('Türk Kahvesi')).toBe('turk-kahvesi');
    });

    it('should handle Turkish dotted and dotless I', () => {
      expect(generateSlug('İSTANBUL Şehir Rehberi')).toBe('istanbul-sehir-rehberi');
      expect(generateSlug('Iğdır Usulü')).toBe('igdir-usulu');
      expect(generateSlug('ŞEKERSİZ ÇAY')).toBe('sekersiz-cay');
    });

    it('should normalize underscores, apostrophes and compatibility characters', () => {
      expect(generateSlug("Bob's V60_Pour Over")).toBe('bobs-v60-pour-over');
      expect(generateSlug('Crème brûlée ﬁlter ①')).toBe('creme-brulee-filter-1');
      expect(generateSlug('Straße Æble')).toBe('strasse-aeble');
    });

    it('should return an empty base for titles without ASCII-mappable characters', () => {
      expect(generateSlug('東京コーヒー')).toBe('');
      expect(generateSlug('Кофе')).toBe('');
      expect(generateSlug('!!!')).toBe('');
      expect(generateSlug('')).toBe('');
    });

    it('should truncate a long title to at most 93 characters at a word boundary', () => {
      const words = ['espresso', 'ristretto', 'lungo', 'cortado', 'macchiato'];
      let title = '';
      for (let i = 0; title.length < 200; i++) {
        title += `${words[i % words.length]} `;
      }
      title = title.slice(0, 200);
      expect(title).toHaveLength(200);

      const slug = generateSlug(title);
      expect(slug.length).toBeLessThanOrEqual(93);
      expect(slug.endsWith('-')).toBe(false);
      // Every segment is a complete word, so the cut happened on a hyphen boundary.
      for (const segment of slug.split('-')) {
        expect(words).toContain(segment);
      }
    });

    it('should hard-cut a single over-long word with no hyphen boundary', () => {
      const slug = generateSlug('a'.repeat(150));
      expect(slug).toBe('a'.repeat(93));
    });

    it('should only produce SlugSchema-valid non-empty outputs', () => {
      const titles = [
        'Türk Kahvesi',
        'İSTANBUL Şehir Rehberi',
        'Iğdır Usulü',
        'ŞEKERSİZ ÇAY',
        "Bob's V60_Pour Over",
        'Crème brûlée ﬁlter ①',
        'Straße Æble',
        'Øresund Łódź Þór Đakovo Œuvre',
        `${'word '.repeat(60)}`,
      ];
      for (const title of titles) {
        const slug = generateSlug(title);
        expect(slug).not.toBe('');
        expect(SlugSchema.safeParse(slug).success).toBe(true);
      }
    });
  });

  describe('randomSlugSuffix', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return 6 characters from the alphabet, nearly always distinct', () => {
      const results = Array.from({ length: 1000 }, () => randomSlugSuffix());
      for (const sfx of results) {
        expect(sfx).toMatch(SFX);
      }
      expect(new Set(results).size).toBeGreaterThanOrEqual(995);
    });

    it('should reject biased bytes (>= 243) before mapping', () => {
      let call = 0;
      vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(
        <T extends ArrayBufferView | null>(array: T): T => {
          const fill = call === 0 ? 250 : 5;
          call++;
          if (array instanceof Uint8Array) array.fill(fill);
          return array;
        },
      );
      expect(randomSlugSuffix()).toBe('777777');
    });
  });

  describe('slugCandidates', () => {
    it('should try the bare base first, then suffixed candidates', () => {
      expect(slugCandidates('Morning V60', ['bbbbbb', 'cccccc'])).toEqual([
        'morning-v60',
        'morning-v60-bbbbbb',
        'morning-v60-cccccc',
      ]);
    });

    it('should always suffix reserved, UUID-shaped and empty bases', () => {
      expect(slugCandidates('New', ['bbbbbb'])).toEqual(['new-bbbbbb']);
      expect(slugCandidates('123e4567-e89b-12d3-a456-426614174000', ['bbbbbb'])).toEqual([
        '123e4567-e89b-12d3-a456-426614174000-bbbbbb',
      ]);
      expect(slugCandidates('東京コーヒー', ['bbbbbb'])).toEqual(['recipe-bbbbbb']);
    });

    it('should de-duplicate repeated suffixes', () => {
      expect(slugCandidates('Espresso', ['bbbbbb', 'bbbbbb'])).toEqual([
        'espresso',
        'espresso-bbbbbb',
      ]);
    });
  });

  describe('isReservedRecipeSlug', () => {
    it('should be true for every reserved word', () => {
      for (const word of RESERVED_RECIPE_SLUGS) {
        expect(isReservedRecipeSlug(word)).toBe(true);
      }
    });

    it('should be true for a UUID-shaped base', () => {
      expect(isReservedRecipeSlug('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    });

    it('should be false for an ordinary slug', () => {
      expect(isReservedRecipeSlug('morning-v60')).toBe(false);
    });
  });
});
