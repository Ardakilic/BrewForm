import '../../test-setup.ts';
import { db } from '@brewform/db';
import { recipes, users } from '@brewform/db/schema';
import { generateSlug } from '@brewform/shared/utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRecipeQRCode, log } from './service.ts';

describe('QR Code Service Logic', () => {
  let userId: string;
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    userId = crypto.randomUUID();

    debugSpy = vi.spyOn(log, 'debug');
    errorSpy = vi.spyOn(log, 'error');
    warnSpy = vi.spyOn(log, 'warn');

    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    debugSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();

    await db.delete(recipes).where(eq(recipes.authorId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

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

  describe('getRecipeQRCode', () => {
    it('should log entry/exit and return a PNG for a public recipe', async () => {
      const slug = generateSlug('Public Recipe');
      await db.insert(recipes).values({
        slug,
        title: 'Public Recipe',
        authorId: userId,
        visibility: 'public',
      });

      const result = await getRecipeQRCode(slug, 'png', 'http://localhost:8000');

      expect(result.contentType).toBe('image/png');
      expect(result.data).toBeDefined();
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(
        1,
        { slug, format: 'png' },
        'getRecipeQRCode started',
      );
      expect(debugSpy).toHaveBeenNthCalledWith(
        2,
        { slug, format: 'png' },
        'getRecipeQRCode completed',
      );
    });

    it('should log entry/exit and return an SVG for a public recipe', async () => {
      const slug = generateSlug('Public SVG Recipe');
      await db.insert(recipes).values({
        slug,
        title: 'Public SVG Recipe',
        authorId: userId,
        visibility: 'public',
      });

      const result = await getRecipeQRCode(slug, 'svg', 'http://localhost:8000');

      expect(result.contentType).toBe('image/svg+xml');
      expect(typeof result.data).toBe('string');
      expect(debugSpy).toHaveBeenCalledTimes(2);
      expect(debugSpy).toHaveBeenNthCalledWith(
        1,
        { slug, format: 'svg' },
        'getRecipeQRCode started',
      );
      expect(debugSpy).toHaveBeenNthCalledWith(
        2,
        { slug, format: 'svg' },
        'getRecipeQRCode completed',
      );
    });

    it('should log error and throw RECIPE_NOT_FOUND for missing recipe', async () => {
      const slug = 'missing-recipe';

      await expect(getRecipeQRCode(slug, 'png', 'http://localhost:8000')).rejects.toThrow(
        'RECIPE_NOT_FOUND',
      );

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const errArg = errorSpy.mock.calls[0][0] as { err: Error; slug: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('RECIPE_NOT_FOUND');
      expect(errArg.slug).toBe(slug);
      expect(errorSpy.mock.calls[0][1]).toBe('getRecipeQRCode failed: recipe not found');
      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(debugSpy).toHaveBeenNthCalledWith(
        1,
        { slug, format: 'png' },
        'getRecipeQRCode started',
      );
    });

    it.each(['draft', 'private'] as const)(
      'should log warn and throw RECIPE_NOT_FOUND for a %s recipe',
      async (visibility) => {
        const slug = generateSlug(`${visibility} recipe ${crypto.randomUUID().slice(0, 8)}`);
        await db
          .insert(recipes)
          .values({ slug, title: 'Hidden Recipe', authorId: userId, visibility });

        await expect(getRecipeQRCode(slug, 'png', 'http://localhost:8000')).rejects.toThrow(
          'RECIPE_NOT_FOUND',
        );

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenNthCalledWith(
          1,
          { slug, visibility },
          'getRecipeQRCode failed: recipe not viewable',
        );
        expect(debugSpy).toHaveBeenCalledTimes(1);
      },
    );

    it('should return a PNG for an unlisted recipe', async () => {
      const slug = generateSlug(`Unlisted Recipe ${crypto.randomUUID().slice(0, 8)}`);
      await db.insert(recipes).values({
        slug,
        title: 'Unlisted Recipe',
        authorId: userId,
        visibility: 'unlisted',
      });

      const result = await getRecipeQRCode(slug, 'png', 'http://localhost:8000');

      expect(result.contentType).toBe('image/png');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
