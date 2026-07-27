import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { recipes, recipeVersions, users } from '@brewform/db/schema';
import * as model from './model.ts';

/**
 * toggleFeature — atomic featured-flag toggle. Inserts a user + recipe + version
 * (the circular-FK dance: recipe -> version -> link currentVersionId), then flips
 * the flag true -> false -> true, asserting both the returned value and the
 * persisted column after each toggle.
 */
describe('toggleFeature', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeId: string;
  let versionId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    recipeId = crypto.randomUUID();
    versionId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
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
  });

  afterEach(async () => {
    await db.delete(recipeVersions).where(eq(recipeVersions.id, versionId));
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  async function persistedFeatured(): Promise<boolean> {
    const [row] = await db.select({ featured: recipes.featured }).from(recipes)
      .where(eq(recipes.id, recipeId));
    return row.featured;
  }

  it('should flip featured false -> true -> false -> true and persist each flip', async () => {
    expect(await persistedFeatured()).toBe(false);

    const first = await model.toggleFeature(recipeId);
    expect(first.featured).toBe(true);
    expect(await persistedFeatured()).toBe(true);

    const second = await model.toggleFeature(recipeId);
    expect(second.featured).toBe(false);
    expect(await persistedFeatured()).toBe(false);

    const third = await model.toggleFeature(recipeId);
    expect(third.featured).toBe(true);
    expect(await persistedFeatured()).toBe(true);
  });

  it('should throw RECIPE_NOT_FOUND for a missing recipe', async () => {
    await expect(model.toggleFeature(crypto.randomUUID())).rejects.toThrow('RECIPE_NOT_FOUND');
  });
});
