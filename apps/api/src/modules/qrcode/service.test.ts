import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { assertSpyCallArgs, assertSpyCalls, spy } from 'jsr:@std/testing/mock';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { recipes, users } from '@brewform/db/schema';
import { generateSlug } from '@brewform/shared/utils';
import { getRecipeQRCode, log } from './service.ts';

describe('QR Code Service Logic', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let debugSpy: ReturnType<typeof spy>;
  let errorSpy: ReturnType<typeof spy>;
  let warnSpy: ReturnType<typeof spy>;

  beforeEach(async () => {
    userId = crypto.randomUUID();

    debugSpy = spy(log, 'debug');
    errorSpy = spy(log, 'error');
    warnSpy = spy(log, 'warn');

    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
  });

  afterEach(async () => {
    debugSpy.restore();
    errorSpy.restore();
    warnSpy.restore();

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
      assertSpyCalls(debugSpy, 2);
      assertSpyCallArgs(debugSpy, 0, [{ slug, format: 'png' }, 'getRecipeQRCode started']);
      assertSpyCallArgs(debugSpy, 1, [{ slug, format: 'png' }, 'getRecipeQRCode completed']);
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
      assertSpyCalls(debugSpy, 2);
      assertSpyCallArgs(debugSpy, 0, [{ slug, format: 'svg' }, 'getRecipeQRCode started']);
      assertSpyCallArgs(debugSpy, 1, [{ slug, format: 'svg' }, 'getRecipeQRCode completed']);
    });

    it('should log error and throw RECIPE_NOT_FOUND for missing recipe', async () => {
      const slug = 'missing-recipe';

      await expect(getRecipeQRCode(slug, 'png', 'http://localhost:8000')).rejects.toThrow(
        'RECIPE_NOT_FOUND',
      );

      assertSpyCalls(errorSpy, 1);
      const errArg = errorSpy.calls[0].args[0] as { err: Error; slug: string };
      expect(errArg.err).toBeInstanceOf(Error);
      expect(errArg.err.message).toBe('RECIPE_NOT_FOUND');
      expect(errArg.slug).toBe(slug);
      expect(errorSpy.calls[0].args[1]).toBe('getRecipeQRCode failed: recipe not found');
      assertSpyCalls(debugSpy, 1);
      assertSpyCallArgs(debugSpy, 0, [{ slug, format: 'png' }, 'getRecipeQRCode started']);
    });

    it('should log warn and throw RECIPE_NOT_AVAILABLE for a draft recipe', async () => {
      const slug = generateSlug('Draft Recipe');
      await db.insert(recipes).values({
        slug,
        title: 'Draft Recipe',
        authorId: userId,
        visibility: 'draft',
      });

      await expect(getRecipeQRCode(slug, 'png', 'http://localhost:8000')).rejects.toThrow(
        'RECIPE_NOT_AVAILABLE',
      );

      assertSpyCalls(warnSpy, 1);
      assertSpyCallArgs(warnSpy, 0, [
        { slug, visibility: 'draft' },
        'getRecipeQRCode failed: recipe not available',
      ]);
      assertSpyCalls(debugSpy, 1);
    });

    it('should log warn and throw RECIPE_NOT_AVAILABLE for a private recipe', async () => {
      const slug = generateSlug('Private Recipe');
      await db.insert(recipes).values({
        slug,
        title: 'Private Recipe',
        authorId: userId,
        visibility: 'private',
      });

      await expect(getRecipeQRCode(slug, 'png', 'http://localhost:8000')).rejects.toThrow(
        'RECIPE_NOT_AVAILABLE',
      );

      assertSpyCalls(warnSpy, 1);
      assertSpyCallArgs(warnSpy, 0, [
        { slug, visibility: 'private' },
        'getRecipeQRCode failed: recipe not available',
      ]);
    });
  });
});
