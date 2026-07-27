import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { and, eq } from 'drizzle-orm';
import { db } from '@brewform/db';
import { userFollows, users } from '@brewform/db/schema';
import * as model from './model.ts';

/**
 * findFollow — Find a follow relationship between two users. Returns the
 * user_follows row if one exists, or null if the follower is not following
 * the target user.
 */
describe('findFollow', { sanitizeOps: false, sanitizeResources: false }, () => {
  let followerId: string;
  let followingId: string;
  let followId: string;

  beforeEach(async () => {
    followerId = crypto.randomUUID();
    followingId = crypto.randomUUID();
    followId = crypto.randomUUID();
    await db.insert(users).values([
      {
        id: followerId,
        email: `follower-${followerId}@example.com`,
        username: `follower-${followerId}`,
        passwordHash: 'hash',
      },
      {
        id: followingId,
        email: `following-${followingId}@example.com`,
        username: `following-${followingId}`,
        passwordHash: 'hash',
      },
    ]);
    await db.insert(userFollows).values({
      id: followId,
      followerId,
      followingId,
    });
  });

  afterEach(async () => {
    await db.delete(userFollows).where(eq(userFollows.id, followId));
    await db.delete(users).where(eq(users.id, followerId));
    await db.delete(users).where(eq(users.id, followingId));
  });

  it('should return the follow row when a relationship exists', async () => {
    const result = await model.findFollow(followerId, followingId);
    expect(result).not.toBeNull();
    expect(result!.followerId).toBe(followerId);
    expect(result!.followingId).toBe(followingId);
  });

  it('should return null when no relationship exists', async () => {
    const result = await model.findFollow(followingId, followerId);
    expect(result).toBeNull();
  });
});

/**
 * createFollow — Insert a new follow relationship between two users and return
 * the inserted row.
 */
describe('createFollow', { sanitizeOps: false, sanitizeResources: false }, () => {
  let followerId: string;
  let followingId: string;

  beforeEach(async () => {
    followerId = crypto.randomUUID();
    followingId = crypto.randomUUID();
    await db.insert(users).values([
      {
        id: followerId,
        email: `follower-${followerId}@example.com`,
        username: `follower-${followerId}`,
        passwordHash: 'hash',
      },
      {
        id: followingId,
        email: `following-${followingId}@example.com`,
        username: `following-${followingId}`,
        passwordHash: 'hash',
      },
    ]);
  });

  afterEach(async () => {
    await db.delete(userFollows).where(
      and(eq(userFollows.followerId, followerId), eq(userFollows.followingId, followingId)),
    );
    await db.delete(users).where(eq(users.id, followerId));
    await db.delete(users).where(eq(users.id, followingId));
  });

  it('should insert a follow relationship and return it', async () => {
    const result = await model.createFollow(followerId, followingId);
    expect(result).not.toBeNull();
    expect(result.followerId).toBe(followerId);
    expect(result.followingId).toBe(followingId);
    expect(result.createdAt).toBeDefined();
    const [row] = await db.select().from(userFollows).where(
      and(eq(userFollows.followerId, followerId), eq(userFollows.followingId, followingId)),
    );
    expect(row).toBeDefined();
  });
});

/**
 * deleteFollow — Delete a follow relationship. Throws FOLLOW_NOT_FOUND if the
 * follower is not following the target user.
 */
describe('deleteFollow', { sanitizeOps: false, sanitizeResources: false }, () => {
  let followerId: string;
  let followingId: string;

  beforeEach(async () => {
    followerId = crypto.randomUUID();
    followingId = crypto.randomUUID();
    await db.insert(users).values([
      {
        id: followerId,
        email: `follower-${followerId}@example.com`,
        username: `follower-${followerId}`,
        passwordHash: 'hash',
      },
      {
        id: followingId,
        email: `following-${followingId}@example.com`,
        username: `following-${followingId}`,
        passwordHash: 'hash',
      },
    ]);
    await db.insert(userFollows).values({ followerId, followingId });
  });

  afterEach(async () => {
    await db.delete(userFollows).where(
      and(eq(userFollows.followerId, followerId), eq(userFollows.followingId, followingId)),
    );
    await db.delete(users).where(eq(users.id, followerId));
    await db.delete(users).where(eq(users.id, followingId));
  });

  it('should delete an existing follow relationship', async () => {
    await model.deleteFollow(followerId, followingId);
    const [row] = await db.select().from(userFollows).where(
      and(eq(userFollows.followerId, followerId), eq(userFollows.followingId, followingId)),
    );
    expect(row).toBeUndefined();
  });

  it('should throw FOLLOW_NOT_FOUND when no relationship exists', async () => {
    // Reverse direction has no follow row.
    await expect(model.deleteFollow(followingId, followerId)).rejects.toThrow(
      'FOLLOW_NOT_FOUND',
    );
  });
});

/**
 * getFollowers — List paginated followers of a user with joined profile data.
 * Returns `{ followers, total }`. Only counts followers whose user profile has
 * not been soft-deleted (inner join on users with isNull(deletedAt)).
 */
describe('getFollowers', { sanitizeOps: false, sanitizeResources: false }, () => {
  let followingId: string;
  let followerIds: string[];
  let followIds: string[];

  beforeEach(async () => {
    followingId = crypto.randomUUID();
    followerIds = [crypto.randomUUID(), crypto.randomUUID()];
    followIds = [crypto.randomUUID(), crypto.randomUUID()];
    await db.insert(users).values([
      {
        id: followingId,
        email: `following-${followingId}@example.com`,
        username: `following-${followingId}`,
        passwordHash: 'hash',
      },
      {
        id: followerIds[0],
        email: `follower0-${followerIds[0]}@example.com`,
        username: `follower0-${followerIds[0]}`,
        passwordHash: 'hash',
      },
      {
        id: followerIds[1],
        email: `follower1-${followerIds[1]}@example.com`,
        username: `follower1-${followerIds[1]}`,
        passwordHash: 'hash',
      },
    ]);
    await db.insert(userFollows).values([
      { id: followIds[0], followerId: followerIds[0], followingId },
      { id: followIds[1], followerId: followerIds[1], followingId },
    ]);
  });

  afterEach(async () => {
    for (const id of followIds) {
      await db.delete(userFollows).where(eq(userFollows.id, id));
    }
    for (const id of followerIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await db.delete(users).where(eq(users.id, followingId));
  });

  it('should return paginated followers with total count', async () => {
    const result = await model.getFollowers(followingId, 1, 10);
    expect(result.followers.length).toBe(2);
    expect(result.total).toBe(2);
  });

  it('should join the follower profile data', async () => {
    const result = await model.getFollowers(followingId, 1, 10);
    expect(result.followers.length).toBe(2);
    for (const f of result.followers) {
      expect(f.follower).toBeDefined();
      expect(f.follower.id).toBeDefined();
      expect(f.follower.username).toBeDefined();
    }
    const usernames = result.followers.map((f) => f.follower.username).sort();
    expect(usernames).toEqual([
      `follower0-${followerIds[0]}`,
      `follower1-${followerIds[1]}`,
    ].sort());
  });

  it('should return { followers, total } shape', async () => {
    const result = await model.getFollowers(followingId, 1, 10);
    expect(Object.keys(result).sort()).toEqual(['followers', 'total'].sort());
  });
});

/**
 * getFollowing — List paginated users that a given user follows, with joined
 * profile data. Returns `{ following, total }`. Only counts followed users
 * whose profile has not been soft-deleted.
 */
describe('getFollowing', { sanitizeOps: false, sanitizeResources: false }, () => {
  let followerId: string;
  let followingIds: string[];
  let followIds: string[];

  beforeEach(async () => {
    followerId = crypto.randomUUID();
    followingIds = [crypto.randomUUID(), crypto.randomUUID()];
    followIds = [crypto.randomUUID(), crypto.randomUUID()];
    await db.insert(users).values([
      {
        id: followerId,
        email: `follower-${followerId}@example.com`,
        username: `follower-${followerId}`,
        passwordHash: 'hash',
      },
      {
        id: followingIds[0],
        email: `following0-${followingIds[0]}@example.com`,
        username: `following0-${followingIds[0]}`,
        passwordHash: 'hash',
      },
      {
        id: followingIds[1],
        email: `following1-${followingIds[1]}@example.com`,
        username: `following1-${followingIds[1]}`,
        passwordHash: 'hash',
      },
    ]);
    await db.insert(userFollows).values([
      { id: followIds[0], followerId, followingId: followingIds[0] },
      { id: followIds[1], followerId, followingId: followingIds[1] },
    ]);
  });

  afterEach(async () => {
    for (const id of followIds) {
      await db.delete(userFollows).where(eq(userFollows.id, id));
    }
    await db.delete(users).where(eq(users.id, followerId));
    for (const id of followingIds) {
      await db.delete(users).where(eq(users.id, id));
    }
  });

  it('should return paginated following with total count', async () => {
    const result = await model.getFollowing(followerId, 1, 10);
    expect(result.following.length).toBe(2);
    expect(result.total).toBe(2);
  });

  it('should join the following profile data', async () => {
    const result = await model.getFollowing(followerId, 1, 10);
    expect(result.following.length).toBe(2);
    for (const f of result.following) {
      expect(f.following).toBeDefined();
      expect(f.following.id).toBeDefined();
      expect(f.following.username).toBeDefined();
    }
  });

  it('should return { following, total } shape', async () => {
    const result = await model.getFollowing(followerId, 1, 10);
    expect(Object.keys(result).sort()).toEqual(['following', 'total'].sort());
  });
});

/**
 * isFollowing — Check whether a follow relationship exists between two users.
 * Returns a boolean.
 */
describe('isFollowing', { sanitizeOps: false, sanitizeResources: false }, () => {
  let followerId: string;
  let followingId: string;
  let followId: string;

  beforeEach(async () => {
    followerId = crypto.randomUUID();
    followingId = crypto.randomUUID();
    followId = crypto.randomUUID();
    await db.insert(users).values([
      {
        id: followerId,
        email: `follower-${followerId}@example.com`,
        username: `follower-${followerId}`,
        passwordHash: 'hash',
      },
      {
        id: followingId,
        email: `following-${followingId}@example.com`,
        username: `following-${followingId}`,
        passwordHash: 'hash',
      },
    ]);
    await db.insert(userFollows).values({
      id: followId,
      followerId,
      followingId,
    });
  });

  afterEach(async () => {
    await db.delete(userFollows).where(eq(userFollows.id, followId));
    await db.delete(users).where(eq(users.id, followerId));
    await db.delete(users).where(eq(users.id, followingId));
  });

  it('should return true when the follower is following the target', async () => {
    const result = await model.isFollowing(followerId, followingId);
    expect(result).toBe(true);
  });

  it('should return false when no relationship exists', async () => {
    const result = await model.isFollowing(followingId, followerId);
    expect(result).toBe(false);
  });
});
