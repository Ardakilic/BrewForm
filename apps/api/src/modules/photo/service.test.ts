import '../../test-setup.ts';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { db } from '@brewform/db';
import { photos, recipes, users } from '@brewform/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../config/index.ts';
import {
  GIF89A_1x1,
  HTML_BYTES,
  JPEG_1x1,
  PNG_1x1,
  PNG_BOMB_HEADER,
  WEBP_LOSSY_1x1,
} from '../../test-fixtures/images.ts';
import type { StorageDriver } from '../../utils/storage/types.ts';
import { UploadValidationError } from '../../utils/upload/errors.ts';
import { storageDeps } from '../../utils/upload/index.ts';
import * as service from './service.ts';

describe('Photo Service', () => {
  let uploadDir: string;
  let originalUploadDir: string;
  let authorId: string;
  let otherUserId: string;
  let recipeId: string;
  let recipeIds: string[];

  beforeAll(async () => {
    uploadDir = await mkdtemp(path.join(tmpdir(), 'brewform-photo-service-'));
    originalUploadDir = config.UPLOAD_DIR;
    // The local storage driver reads config.UPLOAD_DIR at call time, so these
    // tests write to a throwaway directory and can assert what was stored.
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    (config as any).UPLOAD_DIR = uploadDir;
  });

  afterAll(async () => {
    // Restore the shared config singleton for the next test file.
    // biome-ignore lint/suspicious/noExplicitAny: test config mutation
    (config as any).UPLOAD_DIR = originalUploadDir;
    await rm(uploadDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await rm(uploadDir, { recursive: true, force: true });
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
    const [row] = await db
      .insert(photos)
      .values({
        id,
        recipeId,
        url: `https://example.com/${id}.jpg`,
        sortOrder: 0,
        ...data,
      })
      .returning();
    return row;
  }

  /** An upload part whose bytes match the declared type (a 1x1 PNG unless overridden). */
  function makeFile(
    overrides: Partial<{ declaredType: string; size: number; data: Uint8Array }> = {},
  ) {
    const data = overrides.data ?? PNG_1x1;
    return {
      declaredType: 'image/png',
      size: data.byteLength,
      data,
      ...overrides,
    };
  }

  /** Files currently stored in the test UPLOAD_DIR (empty when it does not exist). */
  function storedFiles(): Promise<string[]> {
    return readdir(uploadDir).catch(() => []);
  }

  /** Photo rows currently linked to the seeded recipe. */
  function photoRows() {
    return db.select().from(photos).where(eq(photos.recipeId, recipeId));
  }

  describe('uploadPhoto', () => {
    it('should throw RECIPE_NOT_FOUND when the recipe does not exist', async () => {
      await expect(
        service.uploadPhoto(authorId, crypto.randomUUID(), makeFile(), null),
      ).rejects.toThrow('RECIPE_NOT_FOUND');
    });

    it('should throw FORBIDDEN when the user is not the recipe author', async () => {
      await expect(service.uploadPhoto(otherUserId, recipeId, makeFile(), null)).rejects.toThrow(
        'FORBIDDEN',
      );
    });

    it('should reject unsupported file types', async () => {
      const unsupported = [
        makeFile({ declaredType: 'image/gif', data: GIF89A_1x1 }),
        makeFile({ declaredType: 'application/pdf' }),
      ];
      for (const file of unsupported) {
        await expect(service.uploadPhoto(authorId, recipeId, file, null)).rejects.toMatchObject({
          code: 'UNSUPPORTED_MEDIA_TYPE',
          status: 415,
          field: 'file',
        });
      }
    });

    it('should reject a file exceeding the maximum size', async () => {
      const tooLarge = makeFile({ size: 10 * 1024 * 1024 + 1 });

      await expect(service.uploadPhoto(authorId, recipeId, tooLarge, null)).rejects.toMatchObject({
        code: 'FILE_TOO_LARGE',
        status: 400,
        field: 'file',
      });
    });

    it('should reject HTML bytes declared as image/jpeg and create no photo row', async () => {
      const disguised = makeFile({ declaredType: 'image/jpeg', data: HTML_BYTES });

      const err = await service.uploadPhoto(authorId, recipeId, disguised, null).catch((e) => e);

      expect(err).toBeInstanceOf(UploadValidationError);
      expect(err).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE', field: 'file' });
      expect(await photoRows()).toHaveLength(0);
    });

    it('should reject an HTML thumbnail with a valid original and store nothing', async () => {
      const thumbnail = {
        declaredType: 'image/jpeg',
        size: HTML_BYTES.byteLength,
        data: HTML_BYTES,
      };

      const err = await service
        .uploadPhoto(authorId, recipeId, makeFile(), thumbnail)
        .catch((e) => e);

      expect(err).toBeInstanceOf(UploadValidationError);
      expect(err).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE', field: 'thumbnail' });
      expect(await photoRows()).toHaveLength(0);
      expect(await storedFiles()).toEqual([]);
    });

    it('should reject a PNG decompression-bomb header with INVALID_IMAGE', async () => {
      const bomb = makeFile({ declaredType: 'image/png', data: PNG_BOMB_HEADER });

      await expect(service.uploadPhoto(authorId, recipeId, bomb, null)).rejects.toMatchObject({
        code: 'INVALID_IMAGE',
        status: 400,
        field: 'file',
      });
      expect(await storedFiles()).toEqual([]);
    });

    it('should store PNG bytes declared as image/jpeg under a .png key', async () => {
      const mislabelled = makeFile({ declaredType: 'image/jpeg', data: PNG_1x1 });

      const photo = await service.uploadPhoto(authorId, recipeId, mislabelled, null);

      expect(photo.url).toMatch(/\.png$/);
      expect(await storedFiles()).toEqual([path.basename(photo.url)]);
    });

    it('should accept every allowed image type', async () => {
      const cases = [
        { declaredType: 'image/jpeg', data: JPEG_1x1, ext: 'jpg' },
        { declaredType: 'image/png', data: PNG_1x1, ext: 'png' },
        { declaredType: 'image/webp', data: WEBP_LOSSY_1x1, ext: 'webp' },
      ];
      for (const { declaredType, data, ext } of cases) {
        const photo = await service.uploadPhoto(
          authorId,
          recipeId,
          makeFile({ declaredType, data }),
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
      const thumbnail = { declaredType: 'image/jpeg', size: JPEG_1x1.byteLength, data: JPEG_1x1 };

      const photo = await service.uploadPhoto(authorId, recipeId, makeFile(), thumbnail);

      expect(photo.thumbnailUrl).not.toBeNull();
      expect(photo.thumbnailUrl).not.toBe(photo.url);
      expect(photo.thumbnailUrl!.startsWith('/uploads/')).toBe(true);
      // The thumbnail reuses the original's UUID and takes its own detected type.
      const id = path.basename(photo.url, '.png');
      expect(photo.thumbnailUrl).toBe(`/uploads/${id}_medium.jpg`);
      expect((await storedFiles()).sort()).toEqual([`${id}.png`, `${id}_medium.jpg`].sort());
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

  describe('uploadPhoto partial-write cleanup', () => {
    let originalDriver: StorageDriver;
    let attempted: string[];
    let deleted: string[];

    beforeEach(() => {
      originalDriver = storageDeps.driver;
      attempted = [];
      deleted = [];
    });

    afterEach(() => {
      storageDeps.driver = originalDriver;
    });

    /**
     * A fake driver that records every key it is asked to write and rejects the `failOn`-th
     * `save` (1 = the original, 2 = the thumbnail) with `error`; `delete` records the key and
     * fails too when `failDelete` is set.
     */
    function installFailingDriver(options: {
      failOn: 1 | 2;
      error?: Error;
      failDelete?: boolean;
    }): void {
      const { failOn, error = new Error('thumbnail write failed'), failDelete = false } = options;
      storageDeps.driver = {
        save: (_data, key) => {
          attempted.push(key);
          if (attempted.length === failOn) return Promise.reject(error);
          return Promise.resolve(`/uploads/${key}`);
        },
        delete: (key) => {
          deleted.push(key);
          return failDelete ? Promise.reject(new Error('cleanup failed')) : Promise.resolve();
        },
      };
    }

    const thumbnail = { declaredType: 'image/jpeg', size: JPEG_1x1.byteLength, data: JPEG_1x1 };

    it('deletes the key of a failed original write, and creates no row', async () => {
      installFailingDriver({ failOn: 1, error: new Error('ENOSPC') });

      await expect(service.uploadPhoto(authorId, recipeId, makeFile(), thumbnail)).rejects.toThrow(
        'ENOSPC',
      );

      expect(attempted).toHaveLength(1);
      expect(deleted).toEqual([attempted[0]]);
      expect(await photoRows()).toHaveLength(0);
    });

    it('deletes the original and the thumbnail key when the thumbnail write fails, and creates no row', async () => {
      installFailingDriver({ failOn: 2 });

      await expect(service.uploadPhoto(authorId, recipeId, makeFile(), thumbnail)).rejects.toThrow(
        'thumbnail write failed',
      );

      expect(attempted).toHaveLength(2);
      expect(attempted[1]).toMatch(/_medium\.jpg$/);
      expect(deleted).toEqual([attempted[0], attempted[1]]);
      expect(await photoRows()).toHaveLength(0);
    });

    it('never deletes a key whose write failed with EEXIST, and rethrows', async () => {
      installFailingDriver({
        failOn: 1,
        error: Object.assign(new Error('exists'), { code: 'EEXIST' }),
      });

      await expect(service.uploadPhoto(authorId, recipeId, makeFile(), thumbnail)).rejects.toThrow(
        'exists',
      );

      expect(attempted).toHaveLength(1);
      expect(deleted).toEqual([]);
      expect(await photoRows()).toHaveLength(0);
    });

    it('still surfaces the original error when the cleanup delete also fails', async () => {
      installFailingDriver({ failOn: 2, failDelete: true });

      await expect(service.uploadPhoto(authorId, recipeId, makeFile(), thumbnail)).rejects.toThrow(
        'thumbnail write failed',
      );

      expect(attempted).toHaveLength(2);
      expect(deleted).toEqual([attempted[0], attempted[1]]);
      expect(await photoRows()).toHaveLength(0);
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
