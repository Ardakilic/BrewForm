import '../../test-setup.ts';
import { db } from '@brewform/db';
import { comments, recipes, recipeVersions, users } from '@brewform/db/schema';
import { eq } from 'drizzle-orm';
import { afterEach, assert, beforeEach, describe, expect, it } from 'vitest';
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
  const [version] = await db
    .insert(recipeVersions)
    .values({
      id: versionId,
      recipeId,
      versionNumber: 1,
      brewMethod: 'v60',
      drinkType: 'pour_over',
      preparationNotes: '',
    })
    .returning();
  await db.update(recipes).set({ currentVersionId: version.id }).where(eq(recipes.id, recipeId));
  return { recipeId, versionId };
}

/**
 * findById — Find a single comment by ID with the author profile joined.
 * Returns null if the comment has been soft-deleted or does not exist.
 */
describe('findById', () => {
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
describe('findByRecipe', () => {
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

  it('leaves out a reply stored under another recipe (#5)', async () => {
    const other = await insertRecipeFixture(userId);
    const parent = await model.create({ recipeId, authorId: userId, content: 'Lonely parent' });
    const foreign = await model.create({
      recipeId: other.recipeId,
      authorId: userId,
      content: 'Cross-recipe reply',
      parentCommentId: parent.id,
    });
    try {
      const result = await model.findByRecipe(recipeId, 1, 20);
      const listed = result.comments.find((c) => c.id === parent.id);
      assert.exists(listed);
      expect(listed.replies).toEqual([]);
    } finally {
      await db.delete(comments).where(eq(comments.id, foreign.id));
      await db.delete(comments).where(eq(comments.id, parent.id));
      await db.delete(recipeVersions).where(eq(recipeVersions.id, other.versionId));
      await db.delete(recipes).where(eq(recipes.id, other.recipeId));
    }
  });

  describe('per-thread reply cap (E10)', () => {
    const created: string[] = [];
    const base = Date.parse('2026-03-01T10:00:00.000Z');

    /** Insert a comment through the model with an explicit `createdAt` offset (seconds). */
    async function insertAt(
      offsetSeconds: number,
      data: { parentCommentId?: string; id?: string; deletedAt?: Date; content?: string } = {},
    ) {
      const row = await model.create({
        recipeId,
        authorId: userId,
        content: data.content ?? `comment at ${offsetSeconds}`,
        createdAt: new Date(base + offsetSeconds * 1000),
        ...(data.id ? { id: data.id } : {}),
        ...(data.parentCommentId ? { parentCommentId: data.parentCommentId } : {}),
        ...(data.deletedAt ? { deletedAt: data.deletedAt } : {}),
      });
      created.push(row.id);
      return row;
    }

    afterEach(async () => {
      // Children were inserted after their parents: delete newest first.
      for (const id of created.reverse()) {
        await db.delete(comments).where(eq(comments.id, id));
      }
      created.length = 0;
    });

    it('gives each parent its 20 oldest live replies, oldest first, with hasMoreReplies', async () => {
      const p1 = await insertAt(0, { content: 'P1' });
      const p2 = await insertAt(1, { content: 'P2' });
      // The oldest P1 reply is soft-deleted, so it must not take one of the 20 slots.
      await insertAt(10, { parentCommentId: p1.id, deletedAt: new Date() });
      const p1Replies = [];
      for (let i = 0; i < 25; i++) {
        p1Replies.push(await insertAt(11 + i, { parentCommentId: p1.id }));
      }
      const p2Replies = [
        await insertAt(50, { parentCommentId: p2.id }),
        await insertAt(51, { parentCommentId: p2.id }),
      ];

      const result = await model.findByRecipe(recipeId, 1, 20);
      const listed1 = result.comments.find((c) => c.id === p1.id);
      const listed2 = result.comments.find((c) => c.id === p2.id);
      assert.exists(listed1);
      assert.exists(listed2);

      expect(listed1.replies.map((r) => r.id)).toEqual(p1Replies.slice(0, 20).map((r) => r.id));
      expect(listed1.hasMoreReplies).toBe(true);
      expect(listed1.replies[0].createdAt).toBeInstanceOf(Date);
      expect(listed2.replies.map((r) => r.id)).toEqual(p2Replies.map((r) => r.id));
      expect(listed2.hasMoreReplies).toBe(false);
      // The fixture's own top-level comment has one reply and no more.
      const fixtureParent = result.comments.find((c) => c.id === topLevelId);
      expect(fixtureParent?.hasMoreReplies).toBe(false);
    });

    it('a parent with exactly 20 replies gets all 20 and hasMoreReplies false', async () => {
      const parent = await insertAt(0, { content: 'exactly twenty' });
      for (let i = 0; i < 20; i++) await insertAt(1 + i, { parentCommentId: parent.id });

      const result = await model.findByRecipe(recipeId, 1, 20);
      const listed = result.comments.find((c) => c.id === parent.id);
      assert.exists(listed);
      expect(listed.replies).toHaveLength(20);
      expect(listed.hasMoreReplies).toBe(false);
    });

    it('breaks a createdAt tie between replies by id', async () => {
      const parent = await insertAt(0, { content: 'tie parent' });
      const ids = [crypto.randomUUID(), crypto.randomUUID()].sort();
      // Insert the larger id first so insertion order cannot explain the result.
      await insertAt(5, { parentCommentId: parent.id, id: ids[1] });
      await insertAt(5, { parentCommentId: parent.id, id: ids[0] });

      const result = await model.findByRecipe(recipeId, 1, 20);
      const listed = result.comments.find((c) => c.id === parent.id);
      assert.exists(listed);
      expect(listed.replies.map((r) => r.id)).toEqual(ids);
    });
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
 * Deleted accounts (E11): comments of a soft-deleted user stay listed with their content and
 * `authorId`, but `author` is `null` on every read; a live author is still joined.
 */
describe('deleted comment authors (E11)', () => {
  let deletedUserId: string;
  let liveUserId: string;
  let fixture: { recipeId: string; versionId: string };
  const created: string[] = [];

  async function insertUser(prefix: string): Promise<string> {
    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      email: `${prefix}-${id}@example.com`,
      username: `${prefix}-${id.slice(0, 8)}`,
      passwordHash: 'hash',
    });
    return id;
  }

  beforeEach(async () => {
    deletedUserId = await insertUser('gone');
    liveUserId = await insertUser('live');
    fixture = await insertRecipeFixture(liveUserId);
  });

  afterEach(async () => {
    for (const id of created.reverse()) {
      await db.delete(comments).where(eq(comments.id, id));
    }
    created.length = 0;
    await db.delete(recipeVersions).where(eq(recipeVersions.id, fixture.versionId));
    await db.delete(recipes).where(eq(recipes.id, fixture.recipeId));
    await db.delete(users).where(eq(users.id, deletedUserId));
    await db.delete(users).where(eq(users.id, liveUserId));
  });

  it('lists the comment and reply of a deleted account with content, authorId and author: null', async () => {
    const top = await model.create({
      recipeId: fixture.recipeId,
      authorId: deletedUserId,
      content: 'Written before leaving',
    });
    created.push(top.id);
    const reply = await model.create({
      recipeId: fixture.recipeId,
      authorId: deletedUserId,
      content: 'A reply before leaving',
      parentCommentId: top.id,
    });
    created.push(reply.id);
    const liveReply = await model.create({
      recipeId: fixture.recipeId,
      authorId: liveUserId,
      content: 'Still here',
      parentCommentId: top.id,
    });
    created.push(liveReply.id);
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, deletedUserId));

    const result = await model.findByRecipe(fixture.recipeId, 1, 20);
    const listed = result.comments.find((c) => c.id === top.id);
    assert.exists(listed);
    expect(listed.content).toBe('Written before leaving');
    expect(listed.authorId).toBe(deletedUserId);
    expect(listed.author).toBeNull();
    const listedReply = listed.replies.find((r) => r.id === reply.id);
    assert.exists(listedReply);
    expect(listedReply.content).toBe('A reply before leaving');
    expect(listedReply.authorId).toBe(deletedUserId);
    expect(listedReply.author).toBeNull();
    const listedLive = listed.replies.find((r) => r.id === liveReply.id);
    expect(listedLive?.author).toEqual({
      id: liveUserId,
      username: `live-${liveUserId.slice(0, 8)}`,
      displayName: null,
      avatarUrl: null,
    });

    expect((await model.findById(reply.id))?.author).toBeNull();
    expect((await model.findById(liveReply.id))?.author?.id).toBe(liveUserId);
  });
});

/**
 * create — Insert a new comment and return the inserted row.
 */
describe('create', () => {
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
describe('softDelete', () => {
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
 * softDeleteReplies — Soft-delete the live replies of a top-level comment on the
 * same recipe and return the ids it changed (E1 thread delete).
 */
describe('softDeleteReplies', () => {
  let userId: string;
  let recipeA: { recipeId: string; versionId: string };
  let recipeB: { recipeId: string; versionId: string };
  const createdIds: string[] = [];

  beforeEach(async () => {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `test-${userId}@example.com`,
      username: `testuser-${userId}`,
      passwordHash: 'hash',
    });
    recipeA = await insertRecipeFixture(userId);
    recipeB = await insertRecipeFixture(userId);
  });

  afterEach(async () => {
    for (const id of createdIds.reverse()) {
      await db.delete(comments).where(eq(comments.id, id));
    }
    createdIds.length = 0;
    for (const fixture of [recipeA, recipeB]) {
      await db.delete(recipeVersions).where(eq(recipeVersions.id, fixture.versionId));
      await db.delete(recipes).where(eq(recipes.id, fixture.recipeId));
    }
    await db.delete(users).where(eq(users.id, userId));
  });

  /** Insert a comment through the model and track it for cleanup. */
  async function insert(data: Omit<typeof comments.$inferInsert, 'authorId'>) {
    const row = await model.create({ ...data, authorId: userId });
    createdIds.push(row.id);
    return row;
  }

  it('deletes exactly the live same-recipe replies and returns their ids', async () => {
    const parent = await insert({ recipeId: recipeA.recipeId, content: 'P' });
    const r1 = await insert({
      recipeId: recipeA.recipeId,
      content: 'r1',
      parentCommentId: parent.id,
    });
    const r2 = await insert({
      recipeId: recipeA.recipeId,
      content: 'r2',
      parentCommentId: parent.id,
    });
    const oldDeletedAt = new Date('2026-01-02T03:04:05.000Z');
    const r3 = await insert({
      recipeId: recipeA.recipeId,
      content: 'r3',
      parentCommentId: parent.id,
      deletedAt: oldDeletedAt,
    });
    const x = await insert({
      recipeId: recipeB.recipeId,
      content: 'x',
      parentCommentId: parent.id,
    });

    const ids = await model.softDeleteReplies(parent.id, recipeA.recipeId);

    expect([...ids].sort()).toEqual([r1.id, r2.id].sort());
    const rows = await db.select().from(comments).where(eq(comments.parentCommentId, parent.id));
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(r1.id)?.deletedAt).toBeInstanceOf(Date);
    expect(byId.get(r2.id)?.deletedAt).toBeInstanceOf(Date);
    expect(byId.get(r3.id)?.deletedAt?.getTime()).toBe(oldDeletedAt.getTime());
    expect(byId.get(x.id)?.deletedAt).toBeNull();
    const [parentRow] = await db.select().from(comments).where(eq(comments.id, parent.id));
    expect(parentRow.deletedAt).toBeNull();
  });

  it('returns an empty list when the comment has no live replies', async () => {
    const parent = await insert({ recipeId: recipeA.recipeId, content: 'P' });
    expect(await model.softDeleteReplies(parent.id, recipeA.recipeId)).toEqual([]);
  });
});

/**
 * getRecipeForAccessCheck — Returns `{ authorId, visibility }` for the comment
 * visibility gate (D99.9). Excludes soft-deleted recipes; returns null when
 * the recipe does not exist.
 */
describe('getRecipeForAccessCheck', () => {
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
