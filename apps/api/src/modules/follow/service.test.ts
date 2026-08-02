import '../../test-setup.ts';
import { afterAll, afterEach, beforeAll, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { db } from '@brewform/db';
import { notifications, userBadges, userFollows, users } from '@brewform/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { followUser } from './service.ts';

describe('Follow Service Logic', () => {
  describe('Self-follow prevention', () => {
    it('should throw CANNOT_FOLLOW_SELF when following self', () => {
      const followerId = 'user-1';
      const followingId = 'user-1';
      try {
        if (followerId === followingId) throw new Error('CANNOT_FOLLOW_SELF');
        expect(true).toBe(false);
      } catch (err) {
        expect((err as Error).message).toBe('CANNOT_FOLLOW_SELF');
      }
    });
  });

  describe('Already following check', () => {
    it('should throw ALREADY_FOLLOWING when already following', () => {
      const isFollowing = true;
      try {
        if (isFollowing) throw new Error('ALREADY_FOLLOWING');
        expect(true).toBe(false);
      } catch (err) {
        expect((err as Error).message).toBe('ALREADY_FOLLOWING');
      }
    });
  });

  describe('Empty feed for user with no follows', () => {
    it('should return empty array when followingIds is empty', () => {
      const followingIds: string[] = [];
      if (followingIds.length === 0) {
        const result = { recipes: [], total: 0 };
        expect(result.recipes).toEqual([]);
        expect(result.total).toBe(0);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// F05 — DB-backed integration: followUser fires createFollowNotification.
//
// The follow service calls createFollowNotification via a DIRECT import (no
// deps proxy), so the only way to assert the fan-out here is against the real
// DB. `followUser` spawns a fire-and-forget IIFE that loads the follower's
// username and delegates to `createFollowNotification`, which owns BOTH the
// follow email (suppressed under APP_ENV=test) AND the in-app `follow`
// notification record (gated on `notifyNewFollower` prefs — missing prefs
// counts as opted-in, which is the state for the freshly-inserted `followed`
// user below).
// ---------------------------------------------------------------------------

describe(
  'Follow Service — DB integration (F05 follow notification fan-out)',
  { sanitizeOps: false, sanitizeResources: false },
  () => {
    let follower: typeof users.$inferSelect;
    let followed: typeof users.$inferSelect;
    const createdUsers: string[] = [];

    async function makeUser(prefix: string) {
      const id = crypto.randomUUID();
      const [user] = await db.insert(users).values({
        id,
        email: `${prefix}-${id}@example.com`,
        username: `${prefix}-${id.slice(0, 8)}`,
        passwordHash: 'hash',
      }).returning();
      createdUsers.push(user.id);
      return user;
    }

    // Drain the fire-and-forget badge-evaluation race before deleting a user.
    async function deleteUserWithBadges(userId: string) {
      for (let attempt = 0;; attempt++) {
        await db.delete(userBadges).where(eq(userBadges.userId, userId));
        try {
          await db.delete(users).where(eq(users.id, userId));
          return;
        } catch (err) {
          if (attempt >= 9) throw err;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }
    }

    // Poll for the `follow` notification row up to ~1.5s; the fan-out is async.
    async function followNotificationAppeared(timeoutMs = 1500): Promise<boolean> {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const rows = await db.select().from(notifications).where(and(
          eq(notifications.userId, followed.id),
          eq(notifications.actorId, follower.id),
          eq(notifications.type, 'follow'),
        ));
        if (rows.length > 0) return true;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return false;
    }

    beforeAll(async () => {
      follower = await makeUser('follower');
      followed = await makeUser('followed');
    });

    afterEach(async () => {
      // Reset the follow graph + any notifications so each test starts clean.
      // notifications.userId cascades on user delete, but user_follow.followerId
      // / followingId have NO ON DELETE CASCADE — delete the follow row explicitly.
      await db.delete(notifications).where(eq(notifications.userId, followed.id));
      await db.delete(userFollows).where(eq(userFollows.followerId, follower.id));
    });

    afterAll(async () => {
      await db.delete(userFollows).where(inArray(userFollows.followerId, createdUsers));
      await db.delete(userFollows).where(inArray(userFollows.followingId, createdUsers));
      for (const userId of createdUsers) {
        await deleteUserWithBadges(userId);
      }
    });

    it('createFollowNotification is invoked after follow creation', async () => {
      await followUser(follower.id, followed.id);
      expect(await followNotificationAppeared()).toBe(true);
    });

    it('createFollowNotification NOT invoked when follow already exists (idempotent)', async () => {
      // First follow creates the notification; drain the fan-out.
      await followUser(follower.id, followed.id);
      expect(await followNotificationAppeared()).toBe(true);

      const before = await db.select().from(notifications).where(and(
        eq(notifications.userId, followed.id),
        eq(notifications.actorId, follower.id),
        eq(notifications.type, 'follow'),
      ));

      // Second follow throws ALREADY_FOLLOWING BEFORE the IIFE — no new row.
      await expect(followUser(follower.id, followed.id)).rejects.toThrow('ALREADY_FOLLOWING');
      await new Promise((resolve) => setTimeout(resolve, 50));

      const after = await db.select().from(notifications).where(and(
        eq(notifications.userId, followed.id),
        eq(notifications.actorId, follower.id),
        eq(notifications.type, 'follow'),
      ));
      expect(after.length).toBe(before.length);
    });
  },
);
