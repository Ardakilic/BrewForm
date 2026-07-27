import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@brewform/db';
import { photos, recipes, users } from '@brewform/db/schema';
import * as service from './service.ts';

describe('Photo Service', { sanitizeOps: false, sanitizeResources: false }, () => {
  let authorId: string;
  let otherUserId: string;
  let recipeId: string;
  let recipeIds: string[];

  beforeEach(async () => {
    authorId = crypto.randomUUID();
    otherUserId = crypto.randomUUID();
    recipeIds = [];
    await db.insert(users).values([
      {
        id: authorId,
        email: `test-${authorId}@example.com`,
        username: `testuser-${authorId}`,
        passwordHash: 'hash',
      },
      {
        id: otherUserId,
        email: `test-${otherUserId}@example.com`,
        username: `testuser-${otherUserId}`,
        passwordHash: 'hash',
      },
    ]);
    recipeId = await insertRecipeRow(authorId);
  });

  afterEach(async () => {
    if (recipeIds.length > 0) {
      await db.delete(photos).where(inArray(photos.recipeId, recipeIds));
      await db.delete(recipes).where(inArray(recipes.id, recipeIds));
    }
    await db.delete(users).where(inArray(users.id, [authorId, otherUserId]));
  });

  async function insertRecipeRow(author: string) {
    const id = crypto.randomUUID();
    recipeIds.push(id);
    await db.insert(recipes).values({
      id,
      slug: `test-recipe-${id}`,
      title: `Test Recipe ${id.slice(0, 8)}`,
      authorId: author,
      visibility: 'public',
    });
    return id;
  }

  async function insertPhotoRow(data: Partial<typeof photos.$inferInsert> = {}) {
    const id = crypto.randomUUID();
    const [row] = await db.insert(photos).values({
      id,
      recipeId,
      url: `https://example.com/${id}.jpg`,
      sortOrder: 0,
      ...data,
    }).returning();
    return row;
  }

  function makeFile(
    overrides: Partial<{ name: string; type: string; size: number; data: Uint8Array }> = {},
  ) {
    return {
      name: 'brew-photo.png',
      type: 'image/png',
      size: 3,
      data: new Uint8Array([1, 2, 3]),
      ...overrides,
    };
  }

  describe('uploadPhoto', () => {
    it('should throw RECIPE_NOT_FOUND when the recipe does not exist', async () => {
      await expect(
        service.uploadPhoto(authorId, crypto.randomUUID(), makeFile(), null),
      ).rejects.toThrow('RECIPE_NOT_FOUND');
    });

    it('should throw FORBIDDEN when the user is not the recipe author', async () => {
      await expect(
        service.uploadPhoto(otherUserId, recipeId, makeFile(), null),
      ).rejects.toThrow('FORBIDDEN');
    });

    it('should reject unsupported file types', async () => {
      for (const type of ['image/gif', 'application/pdf']) {
        await expect(
          service.uploadPhoto(authorId, recipeId, makeFile({ type }), null),
        ).rejects.toThrow(`Unsupported file type: ${type}`);
      }
    });

    it('should reject a file exceeding the maximum size', async () => {
      const tooLarge = makeFile({ size: 10 * 1024 * 1024 + 1 });

      await expect(
        service.uploadPhoto(authorId, recipeId, tooLarge, null),
      ).rejects.toThrow('File too large');
    });

    it('should accept every allowed image type', async () => {
      for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
        const ext = type.split('/')[1];
        const photo = await service.uploadPhoto(
          authorId,
          recipeId,
          makeFile({ name: `brew.${ext}`, type }),
          null,
        );
        expect(photo.recipeId).toBe(recipeId);
        expect(photo.url.endsWith(`.${ext}`)).toBe(true);
      }
    });

    it('should persist the photo record with a local URL and default fields', async () => {
      const photo = await service.uploadPhoto(authorId, recipeId, makeFile(), null);

      expect(photo.id).toBeDefined();
      expect(photo.recipeId).toBe(recipeId);
      expect(photo.url.startsWith('/uploads/')).toBe(true);
      expect(photo.url.endsWith('.png')).toBe(true);
      // No thumbnail bytes → thumbnailUrl falls back to the original URL.
      expect(photo.thumbnailUrl).toBe(photo.url);
      expect(photo.alt).toBeNull();
      expect(photo.sortOrder).toBe(0);
      const [row] = await db.select().from(photos).where(eq(photos.id, photo.id));
      expect(row.url).toBe(photo.url);
    });

    it('should store a provided thumbnail and link its derived URL', async () => {
      const photo = await service.uploadPhoto(
        authorId,
        recipeId,
        makeFile(),
        new Uint8Array([9, 9, 9]),
      );

      expect(photo.thumbnailUrl).not.toBeNull();
      expect(photo.thumbnailUrl).not.toBe(photo.url);
      expect(photo.thumbnailUrl!.startsWith('/uploads/')).toBe(true);
      expect(photo.thumbnailUrl).toContain('_medium');
    });

    it('should persist alt text and sortOrder when provided', async () => {
      const photo = await service.uploadPhoto(
        authorId,
        recipeId,
        makeFile(),
        null,
        'A tasty brew',
        3,
      );

      expect(photo.alt).toBe('A tasty brew');
      expect(photo.sortOrder).toBe(3);
    });

    it('should accept a file at exactly the maximum size', async () => {
      const atMax = makeFile({ size: 10 * 1024 * 1024 });

      const photo = await service.uploadPhoto(authorId, recipeId, atMax, null);

      expect(photo.recipeId).toBe(recipeId);
    });
  });

  describe('listPhotos', () => {
    it('should list non-deleted photos ordered by sortOrder', async () => {
      await insertPhotoRow({ url: 'https://example.com/c.jpg', sortOrder: 2 });
      await insertPhotoRow({ url: 'https://example.com/a.jpg', sortOrder: 0 });
      await insertPhotoRow({
        url: 'https://example.com/b.jpg',
        sortOrder: 1,
        deletedAt: new Date(),
      });

      const result = await service.listPhotos(recipeId);

      expect(result.length).toBe(2);
      expect(result[0].url).toBe('https://example.com/a.jpg');
      expect(result[1].url).toBe('https://example.com/c.jpg');
    });

    it('should return an empty array when the recipe has no photos', async () => {
      const emptyRecipeId = await insertRecipeRow(authorId);

      const result = await service.listPhotos(emptyRecipeId);

      expect(result).toEqual([]);
    });
  });

  describe('deletePhoto', () => {
    it('should soft-delete the photo when the user is the recipe author', async () => {
      const photo = await insertPhotoRow();

      await service.deletePhoto(authorId, photo.id);

      const [row] = await db.select().from(photos).where(eq(photos.id, photo.id));
      expect(row.deletedAt).not.toBeNull();
      const remaining = await service.listPhotos(recipeId);
      expect(remaining.some((p) => p.id === photo.id)).toBe(false);
    });

    it('should throw PHOTO_NOT_FOUND when the photo does not exist', async () => {
      await expect(service.deletePhoto(authorId, crypto.randomUUID())).rejects.toThrow(
        'PHOTO_NOT_FOUND',
      );
    });

    it('should throw FORBIDDEN when the user is not the recipe author', async () => {
      const photo = await insertPhotoRow();

      await expect(service.deletePhoto(otherUserId, photo.id)).rejects.toThrow('FORBIDDEN');

      const [row] = await db.select().from(photos).where(eq(photos.id, photo.id));
      expect(row.deletedAt).toBeNull();
    });

    it('should throw FORBIDDEN when the recipe has been soft-deleted', async () => {
      const photo = await insertPhotoRow();
      await db.update(recipes).set({ deletedAt: new Date() }).where(eq(recipes.id, recipeId));

      await expect(service.deletePhoto(authorId, photo.id)).rejects.toThrow('FORBIDDEN');
    });
  });
});
