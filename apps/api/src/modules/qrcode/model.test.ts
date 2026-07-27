import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { recipes, recipeVersions, users } from '@brewform/db/schema';
import * as model from './model.ts';

/**
 * Helper: insert a user + recipe + recipe version with the circular-FK dance
 * (recipe -> version -> link currentVersionId). Returns the IDs.
 */
async function insertRecipeFixture(
  userId: string,
  slug: string,
  visibility: 'public' | 'draft' | 'private' | 'unlisted' = 'public',
): Promise<{ recipeId: string; versionId: string }> {
  const recipeId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  await db.insert(recipes).values({
    id: recipeId,
    slug,
    title: `Test Recipe ${recipeId.slice(0, 8)}`,
    authorId: userId,
    visibility,
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
 * findBySlug — Look up a recipe by slug, returning only the ID and visibility
 * fields needed to gate QR-code-driven public access. Returns null if the
 * recipe has been soft-deleted or no recipe with the slug exists.
 */
describe('findBySlug', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeId: string;
  let versionId: string;
  const slug = `qr-test-${crypto.randomUUID()}`;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    const fixture = await insertRecipeFixture(userId, slug, 'public');
    recipeId = fixture.recipeId;
    versionId = fixture.versionId;
  });

  afterEach(async () => {
    await db.delete(recipeVersions).where(eq(recipeVersions.id, versionId));
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return { id, visibility } for an active recipe', async () => {
    const result = await model.findBySlug(slug);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(recipeId);
    expect(result!.visibility).toBe('public');
  });

  it('should return only id and visibility keys', async () => {
    const result = await model.findBySlug(slug);
    expect(result).not.toBeNull();
    expect(Object.keys(result!).sort()).toEqual(['id', 'visibility'].sort());
  });

  it('should return null for a soft-deleted recipe', async () => {
    await db.update(recipes).set({ deletedAt: new Date() }).where(eq(recipes.id, recipeId));
    const result = await model.findBySlug(slug);
    expect(result).toBeNull();
  });

  it('should return null for a non-existent slug', async () => {
    const result = await model.findBySlug('non-existent-slug');
    expect(result).toBeNull();
  });
});
