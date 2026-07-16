import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@brewform/db';
import { notifications, userPreferences, users } from '@brewform/db/schema';
import * as model from './model.ts';

/** Helper: insert a user and return its ID (email/username unique via UUID). */
async function insertUser(overrides: Partial<typeof users.$inferInsert> = {}): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: `test-${id}@example.com`,
    username: `testuser-${id}`,
    passwordHash: 'hash',
    ...overrides,
  });
  return id;
}

/** Helper: insert a notification row and return its ID. */
async function insertNotification(
  data: Partial<typeof notifications.$inferInsert> & { userId: string },
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(notifications).values({
    id,
    type: 'mention',
    referenceType: 'comment',
    ...data,
  });
  return id;
}

/**
 * create — Insert a single notification row and return it.
 */
describe('create', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let actorId: string;
  let createdId: string | null = null;

  beforeEach(async () => {
    userId = await insertUser();
    actorId = await insertUser();
  });

  afterEach(async () => {
    if (createdId) await db.delete(notifications).where(eq(notifications.id, createdId));
    createdId = null;
    await db.delete(users).where(inArray(users.id, [userId, actorId]));
  });

  it('should insert a notification row and return it', async () => {
    const result = await model.create({
      userId,
      type: 'mention',
      actorId,
      referenceId: 'comment-ref-1',
      referenceType: 'comment',
      metadata: JSON.stringify({ recipeSlug: 'slug-1', recipeTitle: 'Title 1' }),
    });
    createdId = result.id;
    expect(result.id).toBeDefined();
    expect(result.userId).toBe(userId);
    expect(result.type).toBe('mention');
    expect(result.actorId).toBe(actorId);
    expect(result.referenceId).toBe('comment-ref-1');
    expect(result.referenceType).toBe('comment');
    expect(JSON.parse(result.metadata!)).toEqual({ recipeSlug: 'slug-1', recipeTitle: 'Title 1' });
    expect(result.readAt).toBeNull();
    expect(result.createdAt).toBeDefined();
    expect(result.deletedAt).toBeNull();
  });
});

/**
 * findByUserId — Paginated per-user feed, newest first, actor username joined.
 * Supports the unreadOnly filter and excludes soft-deleted rows.
 */
describe('findByUserId', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let actorId: string;
  let otherUserId: string;
  let oldestId: string;
  let middleId: string; // read
  let newestId: string;
  let deletedId: string;
  let otherUsersId: string;

  beforeEach(async () => {
    userId = await insertUser();
    actorId = await insertUser();
    otherUserId = await insertUser();
    const base = Date.now() - 60_000;
    oldestId = await insertNotification({
      userId,
      actorId,
      createdAt: new Date(base),
    });
    middleId = await insertNotification({
      userId,
      actorId,
      createdAt: new Date(base + 1000),
      readAt: new Date(base + 2000),
    });
    newestId = await insertNotification({
      userId,
      createdAt: new Date(base + 3000),
    });
    deletedId = await insertNotification({
      userId,
      createdAt: new Date(base + 4000),
      deletedAt: new Date(base + 5000),
    });
    otherUsersId = await insertNotification({
      userId: otherUserId,
      createdAt: new Date(base + 6000),
    });
  });

  afterEach(async () => {
    await db.delete(notifications).where(
      inArray(notifications.id, [oldestId, middleId, newestId, deletedId, otherUsersId]),
    );
    await db.delete(users).where(inArray(users.id, [userId, actorId, otherUserId]));
  });

  it('should return the user notifications newest first with total', async () => {
    const result = await model.findByUserId(userId, 1, 10, false);
    expect(result.total).toBe(3);
    expect(result.notifications.map((n) => n.id)).toEqual([newestId, middleId, oldestId]);
  });

  it('should paginate with a stable total', async () => {
    const page1 = await model.findByUserId(userId, 1, 2, false);
    expect(page1.notifications.map((n) => n.id)).toEqual([newestId, middleId]);
    expect(page1.total).toBe(3);
    const page2 = await model.findByUserId(userId, 2, 2, false);
    expect(page2.notifications.map((n) => n.id)).toEqual([oldestId]);
    expect(page2.total).toBe(3);
  });

  it('should return only unread rows when unreadOnly is true', async () => {
    const result = await model.findByUserId(userId, 1, 10, true);
    expect(result.total).toBe(2);
    expect(result.notifications.map((n) => n.id)).toEqual([newestId, oldestId]);
  });

  it('should exclude soft-deleted rows', async () => {
    const result = await model.findByUserId(userId, 1, 10, false);
    expect(result.notifications.some((n) => n.id === deletedId)).toBe(false);
  });

  it('should not include other users notifications', async () => {
    const result = await model.findByUserId(userId, 1, 10, false);
    expect(result.notifications.some((n) => n.id === otherUsersId)).toBe(false);
  });

  it('should join the actor username and yield null actor when actorId is null', async () => {
    const result = await model.findByUserId(userId, 1, 10, false);
    const withActor = result.notifications.find((n) => n.id === oldestId);
    expect(withActor!.actor).not.toBeNull();
    expect(withActor!.actor!.username).toBe(`testuser-${actorId}`);
    const withoutActor = result.notifications.find((n) => n.id === newestId);
    expect(withoutActor!.actor).toBeNull();
  });
});

/**
 * findByUserId ordering tie-breaker — rows sharing the same `createdAt` are
 * ordered by `id` descending so pagination stays deterministic.
 */
describe('findByUserId tie-breaker', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  const lowerId = 'tie-break-aaa';
  const higherId = 'tie-break-bbb';

  beforeEach(async () => {
    userId = await insertUser();
    const sameTime = new Date('2026-01-01T00:00:00.000Z');
    await db.insert(notifications).values([
      { id: lowerId, userId, type: 'mention', referenceType: 'comment', createdAt: sameTime },
      { id: higherId, userId, type: 'mention', referenceType: 'comment', createdAt: sameTime },
    ]);
  });

  afterEach(async () => {
    await db.delete(notifications).where(inArray(notifications.id, [lowerId, higherId]));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('orders rows with identical createdAt by id descending', async () => {
    const result = await model.findByUserId(userId, 1, 10, false);
    expect(result.notifications.map((n) => n.id)).toEqual([higherId, lowerId]);
  });
});

/**
 * markAsRead — Sets readAt on an unread, non-deleted row; returns undefined
 * when the row is missing, already read, or soft-deleted.
 */
describe('markAsRead', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let notificationId: string;
  let deletedId: string;

  beforeEach(async () => {
    userId = await insertUser();
    notificationId = await insertNotification({ userId });
    deletedId = await insertNotification({ userId, deletedAt: new Date() });
  });

  afterEach(async () => {
    await db.delete(notifications).where(inArray(notifications.id, [notificationId, deletedId]));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should set readAt and return the updated row', async () => {
    const result = await model.markAsRead(notificationId);
    expect(result).toBeDefined();
    expect(result!.id).toBe(notificationId);
    expect(result!.readAt).not.toBeNull();
  });

  it('should return undefined for an already-read row without overwriting readAt', async () => {
    const first = await model.markAsRead(notificationId);
    const firstReadAt = first!.readAt!.getTime();
    const second = await model.markAsRead(notificationId);
    expect(second).toBeUndefined();
    const [row] = await db.select().from(notifications)
      .where(eq(notifications.id, notificationId));
    expect(row.readAt!.getTime()).toBe(firstReadAt);
  });

  it('should return undefined for a non-existent ID', async () => {
    const result = await model.markAsRead('nonexistent-uuid');
    expect(result).toBeUndefined();
  });

  it('should return undefined for a soft-deleted row', async () => {
    const result = await model.markAsRead(deletedId);
    expect(result).toBeUndefined();
  });
});

/**
 * markAllAsRead — Bulk-marks a user's unread, non-deleted rows as read.
 * Returns the number of rows updated; other users' rows are untouched.
 */
describe('markAllAsRead', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let otherUserId: string;
  let unreadA: string;
  let unreadB: string;
  let alreadyReadId: string;
  let deletedId: string;
  let otherUsersId: string;

  beforeEach(async () => {
    userId = await insertUser();
    otherUserId = await insertUser();
    unreadA = await insertNotification({ userId });
    unreadB = await insertNotification({ userId });
    alreadyReadId = await insertNotification({ userId, readAt: new Date() });
    deletedId = await insertNotification({ userId, deletedAt: new Date() });
    otherUsersId = await insertNotification({ userId: otherUserId });
  });

  afterEach(async () => {
    await db.delete(notifications).where(
      inArray(notifications.id, [unreadA, unreadB, alreadyReadId, deletedId, otherUsersId]),
    );
    await db.delete(users).where(inArray(users.id, [userId, otherUserId]));
  });

  it('should mark only the user unread rows and return the count', async () => {
    const marked = await model.markAllAsRead(userId);
    expect(marked).toBe(2);
    const rows = await db.select().from(notifications)
      .where(inArray(notifications.id, [unreadA, unreadB]));
    expect(rows.every((r) => r.readAt !== null)).toBe(true);
  });

  it('should not touch soft-deleted rows or other users rows', async () => {
    await model.markAllAsRead(userId);
    const [deletedRow] = await db.select().from(notifications)
      .where(eq(notifications.id, deletedId));
    expect(deletedRow.readAt).toBeNull();
    const [otherRow] = await db.select().from(notifications)
      .where(eq(notifications.id, otherUsersId));
    expect(otherRow.readAt).toBeNull();
  });

  it('should return 0 when there is nothing unread', async () => {
    await model.markAllAsRead(userId);
    const again = await model.markAllAsRead(userId);
    expect(again).toBe(0);
  });
});

/**
 * getUnreadCount — Counts unread, non-deleted rows for a user.
 */
describe('getUnreadCount', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let unreadId: string;
  let readId: string;
  let deletedId: string;

  beforeEach(async () => {
    userId = await insertUser();
    unreadId = await insertNotification({ userId });
    readId = await insertNotification({ userId, readAt: new Date() });
    deletedId = await insertNotification({ userId, deletedAt: new Date() });
  });

  afterEach(async () => {
    await db.delete(notifications).where(
      inArray(notifications.id, [unreadId, readId, deletedId]),
    );
    await db.delete(users).where(eq(users.id, userId));
  });

  it('should count only unread, non-deleted rows', async () => {
    const unreadCount = await model.getUnreadCount(userId);
    expect(unreadCount).toBe(1);
  });

  it('should return 0 for a user with no notifications', async () => {
    const unreadCount = await model.getUnreadCount('nonexistent-user');
    expect(unreadCount).toBe(0);
  });
});

/**
 * findById — Single row with actor joined; soft-deleted rows are missing.
 */
describe('findById', { sanitizeOps: false, sanitizeResources: false }, () => {
  let userId: string;
  let actorId: string;
  let deletedActorId: string;
  let notificationId: string;
  let deletedId: string;
  let deletedActorNotificationId: string;

  beforeEach(async () => {
    userId = await insertUser();
    actorId = await insertUser();
    deletedActorId = await insertUser({ deletedAt: new Date() });
    notificationId = await insertNotification({ userId, actorId });
    deletedId = await insertNotification({ userId, deletedAt: new Date() });
    deletedActorNotificationId = await insertNotification({ userId, actorId: deletedActorId });
  });

  afterEach(async () => {
    await db.delete(notifications).where(
      inArray(notifications.id, [notificationId, deletedId, deletedActorNotificationId]),
    );
    await db.delete(users).where(inArray(users.id, [userId, actorId, deletedActorId]));
  });

  it('should return an active row with the actor joined', async () => {
    const result = await model.findById(notificationId);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(notificationId);
    expect(result!.userId).toBe(userId);
    expect(result!.actor!.username).toBe(`testuser-${actorId}`);
  });

  it('should return null for a soft-deleted row', async () => {
    const result = await model.findById(deletedId);
    expect(result).toBeNull();
  });

  it('should return null actor for a notification from a soft-deleted actor', async () => {
    const result = await model.findById(deletedActorNotificationId);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(deletedActorNotificationId);
    // The actor join requires `isNull(users.deletedAt)`, so a self-deleted
    // mentioner's username is no longer surfaced (actor collapses to null).
    expect(result!.actor).toBeNull();
  });

  it('should return null for a non-existent ID', async () => {
    const result = await model.findById('nonexistent-uuid');
    expect(result).toBeNull();
  });
});

/**
 * findMentionTargets — Resolves usernames to active users with the
 * preferences row left-joined; empty input short-circuits.
 */
describe('findMentionTargets', { sanitizeOps: false, sanitizeResources: false }, () => {
  let optedOutUserId: string;
  let noPrefsUserId: string;
  let deletedUserId: string;
  let bannedUserId: string;
  let prefsId: string;

  beforeEach(async () => {
    optedOutUserId = await insertUser();
    noPrefsUserId = await insertUser();
    deletedUserId = await insertUser({ deletedAt: new Date() });
    bannedUserId = await insertUser({ isBanned: true });
    prefsId = crypto.randomUUID();
    await db.insert(userPreferences).values({
      id: prefsId,
      userId: optedOutUserId,
      mentionedInComment: false,
    });
  });

  afterEach(async () => {
    await db.delete(userPreferences).where(eq(userPreferences.id, prefsId));
    await db.delete(users).where(
      inArray(users.id, [optedOutUserId, noPrefsUserId, deletedUserId, bannedUserId]),
    );
  });

  it('should resolve existing usernames with prefs joined', async () => {
    const result = await model.findMentionTargets([
      `testuser-${optedOutUserId}`,
      `testuser-${noPrefsUserId}`,
    ]);
    expect(result.length).toBe(2);
    const optedOut = result.find((r) => r.id === optedOutUserId);
    expect(optedOut!.username).toBe(`testuser-${optedOutUserId}`);
    expect(optedOut!.prefs).not.toBeNull();
    expect(optedOut!.prefs!.mentionedInComment).toBe(false);
  });

  it('should return prefs null for a user without a preferences row', async () => {
    const result = await model.findMentionTargets([`testuser-${noPrefsUserId}`]);
    expect(result.length).toBe(1);
    expect(result[0].prefs).toBeNull();
  });

  it('should exclude soft-deleted users', async () => {
    const result = await model.findMentionTargets([`testuser-${deletedUserId}`]);
    expect(result).toEqual([]);
  });

  it('should exclude banned users', async () => {
    const result = await model.findMentionTargets([`testuser-${bannedUserId}`]);
    expect(result).toEqual([]);
  });

  it('should return [] for an empty username array without querying', async () => {
    const result = await model.findMentionTargets([]);
    expect(result).toEqual([]);
  });

  it('should return [] for unknown usernames', async () => {
    const result = await model.findMentionTargets(['no-such-user-abc', 'no-such-user-def']);
    expect(result).toEqual([]);
  });
});
