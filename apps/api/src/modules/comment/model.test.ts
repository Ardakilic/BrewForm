import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { comments, recipes, recipeVersions, users } from '@brewform/db/schema';
import * as model from './model.ts';

/**
 * Helper: insert a user + recipe + recipe version with the circular-FK dance
 * (recipe -> version -> link currentVersionId). Returns the IDs.
 */
async function insertRecipeFixture(
  userId: string,
): Promise<{ recipeId: string; versionId: string }> {
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
 * findById — Find a single comment by ID with the author profile joined.
 * Returns null if the comment has been soft-deleted or does not exist.
 */
describe('findById', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeId: string;
  let versionId: string;
  let commentId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    commentId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    const fixture = await insertRecipeFixture(userId);
    recipeId = fixture.recipeId;
    versionId = fixture.versionId;
    await db.insert(comments).values({
      id: commentId,
      recipeId,
      authorId: userId,
      content: 'Test comment',
    });
  });

  afterEach(async () => {
    await db.delete(comments).where(eq(comments.id, commentId));
    await db.delete(recipeVersions).where(eq(recipeVersions.id, versionId));
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return an active comment with author joined', async () => {
    const result = await model.findById(commentId);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(commentId);
    expect(result!.content).toBe('Test comment');
    expect(result!.recipeId).toBe(recipeId);
    expect(result!.author).toBeDefined();
    expect(result!.author!.id).toBe(userId);
    expect(result!.author!.username).toBe(`testuser-${userId}`);
  });

  it('should return null for a soft-deleted comment', async () => {
    await db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, commentId));
    const result = await model.findById(commentId);
    expect(result).toBeNull();
  });

  it('should return null for a non-existent comment ID', async () => {
    const result = await model.findById('nonexistent-uuid');
    expect(result).toBeNull();
  });
});

/**
 * findByRecipe — List paginated top-level comments for a recipe with nested
 * replies joined. Returns `{ comments, total }` where each top-level comment
 * has a `replies` array (possibly empty). Excludes soft-deleted comments.
 */
describe('findByRecipe', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeId: string;
  let versionId: string;
  let topLevelId: string;
  let replyId: string;
  let deletedCommentId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    topLevelId = crypto.randomUUID();
    replyId = crypto.randomUUID();
    deletedCommentId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    const fixture = await insertRecipeFixture(userId);
    recipeId = fixture.recipeId;
    versionId = fixture.versionId;
    await db.insert(comments).values([
      {
        id: topLevelId,
        recipeId,
        authorId: userId,
        content: 'Top-level comment',
      },
      {
        id: replyId,
        recipeId,
        authorId: userId,
        content: 'Reply',
        parentCommentId: topLevelId,
      },
      {
        id: deletedCommentId,
        recipeId,
        authorId: userId,
        content: 'Deleted',
        deletedAt: new Date(),
      },
    ]);
  });

  afterEach(async () => {
    await db.delete(comments).where(eq(comments.id, replyId));
    await db.delete(comments).where(eq(comments.id, topLevelId));
    await db.delete(comments).where(eq(comments.id, deletedCommentId));
    await db.delete(recipeVersions).where(eq(recipeVersions.id, versionId));
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return top-level comments with nested replies', async () => {
    const result = await model.findByRecipe(recipeId, 1, 10);
    expect(result.comments.length).toBe(1);
    expect(result.comments[0].id).toBe(topLevelId);
    expect(result.comments[0].content).toBe('Top-level comment');
    expect(result.comments[0].replies.length).toBe(1);
    expect(result.comments[0].replies[0].id).toBe(replyId);
    expect(result.comments[0].replies[0].content).toBe('Reply');
  });

  it('should return { comments, total } shape', async () => {
    const result = await model.findByRecipe(recipeId, 1, 10);
    expect(Object.keys(result).sort()).toEqual(['comments', 'total'].sort());
  });

  it('should exclude soft-deleted comments', async () => {
    const result = await model.findByRecipe(recipeId, 1, 10);
    expect(result.comments.some((c) => c.id === deletedCommentId)).toBe(false);
  });

  it('should join the author profile on top-level comments and replies', async () => {
    const result = await model.findByRecipe(recipeId, 1, 10);
    expect(result.comments.length).toBe(1);
    expect(result.comments[0].author).toBeDefined();
    expect(result.comments[0].author!.id).toBe(userId);
    expect(result.comments[0].replies[0].author).toBeDefined();
    expect(result.comments[0].replies[0].author!.id).toBe(userId);
  });
});

/**
 * create — Insert a new comment and return the inserted row.
 */
describe('create', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeId: string;
  let versionId: string;
  let commentId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    commentId = crypto.randomUUID();
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
    await db.delete(comments).where(eq(comments.id, commentId));
    await db.delete(recipeVersions).where(eq(recipeVersions.id, versionId));
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should insert a comment row and return it', async () => {
    const result = await model.create({
      id: commentId,
      recipeId,
      authorId: userId,
      content: 'New comment',
    });
    expect(result).not.toBeNull();
    expect(result.id).toBe(commentId);
    expect(result.content).toBe('New comment');
    expect(result.recipeId).toBe(recipeId);
    expect(result.authorId).toBe(userId);
    expect(result.createdAt).toBeDefined();
    const [row] = await db.select().from(comments).where(eq(comments.id, commentId));
    expect(row.content).toBe('New comment');
  });
});

/**
 * softDelete — Soft-delete a comment by setting its deletedAt timestamp. Only
 * affects non-deleted comments (isNull(deletedAt) guard). Returns null if the
 * comment is already deleted or does not exist.
 */
describe('softDelete', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeId: string;
  let versionId: string;
  let commentId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
    commentId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    const fixture = await insertRecipeFixture(userId);
    recipeId = fixture.recipeId;
    versionId = fixture.versionId;
    await db.insert(comments).values({
      id: commentId,
      recipeId,
      authorId: userId,
      content: 'Test comment',
    });
  });

  afterEach(async () => {
    await db.delete(comments).where(eq(comments.id, commentId));
    await db.delete(recipeVersions).where(eq(recipeVersions.id, versionId));
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should soft-delete an active comment record', async () => {
    const result = await model.softDelete(commentId);
    expect(result).not.toBeNull();
    expect(result!.deletedAt).not.toBeNull();
  });

  it('should return null when deleting an already-deleted comment', async () => {
    await model.softDelete(commentId);
    const second = await model.softDelete(commentId);
    expect(second).toBeNull();
  });

  it('should not overwrite deletedAt on double-delete', async () => {
    const first = await model.softDelete(commentId);
    expect(first!.deletedAt).not.toBeNull();
    const firstDeletedAt = first!.deletedAt!.getTime();
    const second = await model.softDelete(commentId);
    expect(second).toBeNull();
    const [row] = await db.select().from(comments).where(eq(comments.id, commentId));
    expect(row.deletedAt!.getTime()).toBe(firstDeletedAt);
  });
});

/**
 * getRecipeAuthorId — Get the author ID of a recipe (used for permission
 * checks). Returns null if the recipe does not exist.
 */
describe('getRecipeAuthorId', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeId: string;
  let versionId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
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
    await db.delete(recipeVersions).where(eq(recipeVersions.id, versionId));
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return the author ID of the recipe', async () => {
    const result = await model.getRecipeAuthorId(recipeId);
    expect(result).toBe(userId);
  });

  it('should return null for a non-existent recipe', async () => {
    const result = await model.getRecipeAuthorId('nonexistent-uuid');
    expect(result).toBeNull();
  });
});

/**
 * getRecipeForAccessCheck — Returns `{ authorId, visibility }` for the comment
 * visibility gate (D99.9). Excludes soft-deleted recipes; returns null when
 * the recipe does not exist.
 */
describe('getRecipeForAccessCheck', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let recipeId: string;
  let versionId: string;

  beforeEach(async () => {
    userId = crypto.randomUUID();
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
    await db.delete(recipeVersions).where(eq(recipeVersions.id, versionId));
    await db.delete(recipes).where(eq(recipes.id, recipeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should return authorId and visibility of the recipe', async () => {
    const result = await model.getRecipeForAccessCheck(recipeId);
    expect(result).toEqual({ authorId: userId, visibility: 'public' });
  });

  it('should return null for a non-existent recipe', async () => {
    const result = await model.getRecipeForAccessCheck('nonexistent-uuid');
    expect(result).toBeNull();
  });

  it('should return null for a soft-deleted recipe', async () => {
    await db.update(recipes).set({ deletedAt: new Date() }).where(eq(recipes.id, recipeId));
    const result = await model.getRecipeForAccessCheck(recipeId);
    expect(result).toBeNull();
  });
});
