// deno-lint-ignore-file no-explicit-any require-await

import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { photos, recipes, recipeVersions, users } from '@brewform/db/schema';
import * as model from './model.ts';

/**
 * Helper: insert a user + recipe + recipe version with the circular-FK dance
 * (recipe -> version -> link currentVersionId). Returns the IDs.
 */
async function insertRecipeFixture(userId: string): Promise<{
  recipeId: string;
  versionId: string;
}> {
  const recipeId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  await db.insert(recipes).values({
    id: recipeId,
    slug: `test-recipe-${recipeId}`,
    title: `Test Recipe ${recipeId.slice(0, 8)}`,
    authorId: userId,
    visibility: 'public',
  });
  const [version] = await db.insert(recipeVersions).values({
    id: versionId,
    recipeId,
    versionNumber: 1,
    brewMethod: 'v60',
    drinkType: 'pour_over',
    preparationNotes: '',
  }).returning();
  await db.update(recipes).set({ currentVersionId: version.id }).where(eq(recipes.id, recipeId));
  return { recipeId, versionId };
}

/**
 * findById — Find a photo by ID. Returns null if the photo has been soft-deleted
 * (deletedAt set) or if no photo with the given ID exists.
 */
describe('findById', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeId: string;
  let versionId: string;
  let photoId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    photoId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    const fixture = await insertRecipeFixture(userId);
    recipeId = fixture.recipeId;
    versionId = fixture.versionId;
    await db.insert(photos).values({
      id: photoId,
      recipeId,
      url: 'https://example.com/photo.jpg',
      sortOrder: 0,
    });
  });

  afterEach(async () => {
    await db.delete(photos).where(eq(photos.id, photoId));
    await db.delete(recipeVersions).where(eq(recipeVersions.id, versionId));
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return an active photo record', async () => {
    const result = await model.findById(photoId);
    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://example.com/photo.jpg');
    expect(result!.recipeId).toBe(recipeId);
  });

  it('should return null for a soft-deleted photo', async () => {
    await db.update(photos).set({ deletedAt: new Date() }).where(eq(photos.id, photoId));
    const result = await model.findById(photoId);
    expect(result).toBeNull();
  });

  it('should return null for a non-existent photo ID', async () => {
    const result = await model.findById('nonexistent-uuid');
    expect(result).toBeNull();
  });
});

/**
 * findByRecipe — List all non-deleted photos for a recipe, ordered by sortOrder
 * ascending.
 */
describe('findByRecipe', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeId: string;
  let versionId: string;
  let photoIds: string[];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    photoIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    const fixture = await insertRecipeFixture(userId);
    recipeId = fixture.recipeId;
    versionId = fixture.versionId;
    await db.insert(photos).values([
      { id: photoIds[0], recipeId, url: 'https://example.com/a.jpg', sortOrder: 2 },
      { id: photoIds[1], recipeId, url: 'https://example.com/b.jpg', sortOrder: 0 },
      {
        id: photoIds[2],
        recipeId,
        url: 'https://example.com/c.jpg',
        sortOrder: 1,
        deletedAt: new Date(),
      },
    ]);
  });

  afterEach(async () => {
    for (const id of photoIds) {
      await db.delete(photos).where(eq(photos.id, id));
    }
    await db.delete(recipeVersions).where(eq(recipeVersions.id, versionId));
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return photos ordered by sortOrder ascending', async () => {
    const result = await model.findByRecipe(recipeId);
    expect(result.length).toBe(2);
    expect(result[0].url).toBe('https://example.com/b.jpg');
    expect(result[1].url).toBe('https://example.com/a.jpg');
  });

  it('should exclude soft-deleted photos', async () => {
    const result = await model.findByRecipe(recipeId);
    expect(result.some((p) => p.id === photoIds[2])).toBe(false);
  });
});

/**
 * create — Insert a new photo record and return it.
 */
describe('create', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeId: string;
  let versionId: string;
  let photoId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    photoId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    const fixture = await insertRecipeFixture(userId);
    recipeId = fixture.recipeId;
    versionId = fixture.versionId;
  });

  afterEach(async () => {
    await db.delete(photos).where(eq(photos.id, photoId));
    await db.delete(recipeVersions).where(eq(recipeVersions.id, versionId));
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should insert a photo row and return it', async () => {
    const result = await model.create({
      id: photoId,
      recipeId,
      url: 'https://example.com/new.jpg',
      sortOrder: 0,
    });
    expect(result).not.toBeNull();
    expect(result.id).toBe(photoId);
    expect(result.url).toBe('https://example.com/new.jpg');
    expect(result.recipeId).toBe(recipeId);
    expect(result.createdAt).toBeDefined();
    const [row] = await db.select().from(photos).where(eq(photos.id, photoId));
    expect(row.url).toBe('https://example.com/new.jpg');
  });
});

/**
 * softDelete — Soft-delete a photo by setting its deletedAt timestamp. Only
 * affects non-deleted photos (isNull(deletedAt) guard). Returns null if the
 * photo is already deleted or does not exist.
 */
describe('softDelete', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeId: string;
  let versionId: string;
  let photoId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    photoId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    const fixture = await insertRecipeFixture(userId);
    recipeId = fixture.recipeId;
    versionId = fixture.versionId;
    await db.insert(photos).values({
      id: photoId,
      recipeId,
      url: 'https://example.com/photo.jpg',
      sortOrder: 0,
    });
  });

  afterEach(async () => {
    await db.delete(photos).where(eq(photos.id, photoId));
    await db.delete(recipeVersions).where(eq(recipeVersions.id, versionId));
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should soft-delete an active photo record', async () => {
    const result = await model.softDelete(photoId);
    expect(result).not.toBeNull();
    expect(result!.deletedAt).not.toBeNull();
  });

  it('should return null when deleting an already-deleted photo', async () => {
    await model.softDelete(photoId);
    const second = await model.softDelete(photoId);
    expect(second).toBeNull();
  });

  it('should not overwrite deletedAt on double-delete', async () => {
    const first = await model.softDelete(photoId);
    expect(first!.deletedAt).not.toBeNull();
    const firstDeletedAt = first!.deletedAt!.getTime();
    const second = await model.softDelete(photoId);
    expect(second).toBeNull();
    const [row] = await db.select().from(photos).where(eq(photos.id, photoId));
    expect(row.deletedAt!.getTime()).toBe(firstDeletedAt);
  });
});
