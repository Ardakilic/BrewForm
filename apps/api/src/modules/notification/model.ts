/**
 * Notification database operations for BrewForm (F04 — @mention notifications).
 *
 * Handles querying, creating, and read-state management of the per-user
 * notification feed. Joins the acting user via the users table (left join —
 * `actorId` is nullable, and the join is soft-delete aware so a self-deleted
 * actor surfaces as a null actor) and resolves mention targets (username →
 * user + preference row) for the mention-notification flow. All queries are
 * soft-delete aware (`isNull(deletedAt)`).
 */
import { db } from '@brewform/db';
import { notifications, userPreferences, users } from '@brewform/db/schema';
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';

/**
 * Shared select projection for notification rows: the wire-relevant columns
 * plus the acting user's username (left-joined; `actor` is null when there is
 * no actor, or the actor row is missing or soft-deleted — the join requires
 * `isNull(users.deletedAt)`).
 */
const notificationSelection = {
  id: notifications.id,
  userId: notifications.userId,
  type: notifications.type,
  actorId: notifications.actorId,
  referenceId: notifications.referenceId,
  referenceType: notifications.referenceType,
  metadata: notifications.metadata,
  readAt: notifications.readAt,
  createdAt: notifications.createdAt,
  actor: {
    username: users.username,
  },
};

/**
 * Insert a single notification row.
 *
 * @param data - Notification insert payload (recipient, type, actor, reference, metadata).
 * @returns The inserted notification row.
 */
export async function create(data: typeof notifications.$inferInsert) {
  const [result] = await db.insert(notifications).values(data).returning();
  return result;
}

/**
 * List paginated notifications for a user, newest first, with the actor's
 * username joined (the actor join is soft-delete aware, so a self-deleted
 * actor yields a null actor). Excludes soft-deleted rows; optionally restricts
 * to unread. Ordering is deterministic: rows sharing the same `createdAt`
 * are tie-broken by `id` descending, keeping pagination boundaries stable.
 *
 * @param userId - The recipient user's UUID.
 * @param page - 1-based page number.
 * @param perPage - Page size.
 * @param unreadOnly - When true, only rows with `readAt IS NULL` are returned.
 * @returns `{ notifications, total }` where total counts all matching rows.
 */
export async function findByUserId(
  userId: string,
  page: number,
  perPage: number,
  unreadOnly: boolean,
) {
  const conditions = [eq(notifications.userId, userId), isNull(notifications.deletedAt)];
  if (unreadOnly) conditions.push(isNull(notifications.readAt));
  const where = and(...conditions);

  const [data, totalResult] = await Promise.all([
    db.select(notificationSelection)
      .from(notifications)
      .leftJoin(users, and(eq(notifications.actorId, users.id), isNull(users.deletedAt)))
      .where(where)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ count: count() }).from(notifications).where(where),
  ]);

  return { notifications: data, total: totalResult[0].count };
}

/**
 * Mark a single notification as read. Only affects rows that are still unread
 * and not soft-deleted (`isNull(readAt)` + `isNull(deletedAt)` guards).
 *
 * @param id - The notification's UUID.
 * @returns The updated row, or `undefined` when the row is missing, deleted,
 *          or already read (idempotence is decided by the service layer).
 */
export async function markAsRead(id: string) {
  const result = await db.update(notifications)
    .set({ readAt: new Date() })
    .where(and(
      eq(notifications.id, id),
      isNull(notifications.readAt),
      isNull(notifications.deletedAt),
    ))
    .returning();
  return result.at(0);
}

/**
 * Bulk-mark all of a user's unread notifications as read. Soft-deleted rows
 * are untouched.
 *
 * @param userId - The recipient user's UUID.
 * @returns The number of rows that were marked read.
 */
export async function markAllAsRead(userId: string) {
  const result = await db.update(notifications)
    .set({ readAt: new Date() })
    .where(and(
      eq(notifications.userId, userId),
      isNull(notifications.readAt),
      isNull(notifications.deletedAt),
    ))
    .returning({ id: notifications.id });
  return result.length;
}

/**
 * Count a user's unread (and not soft-deleted) notifications.
 *
 * @param userId - The recipient user's UUID.
 * @returns The unread notification count.
 */
export async function getUnreadCount(userId: string) {
  const [result] = await db.select({ count: count() })
    .from(notifications)
    .where(and(
      eq(notifications.userId, userId),
      isNull(notifications.readAt),
      isNull(notifications.deletedAt),
    ));
  return result.count;
}

/**
 * Find a single notification by ID with the actor's username joined (the actor
 * join is soft-delete aware, so a self-deleted actor yields a null actor).
 * Soft-deleted rows are treated as missing.
 *
 * @param id - The notification's UUID.
 * @returns The notification row (with `actor`), or null if missing/deleted.
 */
export async function findById(id: string) {
  const result = await db.select(notificationSelection)
    .from(notifications)
    .leftJoin(users, and(eq(notifications.actorId, users.id), isNull(users.deletedAt)))
    .where(and(eq(notifications.id, id), isNull(notifications.deletedAt)))
    .limit(1);
  return result.at(0) ?? null;
}

/**
 * Resolve @mention usernames to active users with their preference row joined.
 *
 * Matching is exact (case-sensitive, mirroring registration usernames);
 * soft-deleted (`isNull(deletedAt)`) and banned (`isBanned = false`) users are
 * excluded so neither receives a mention notification or email. Users without a
 * preferences row get `prefs: null` (callers treat missing prefs as "enabled" —
 * the columns default to true).
 *
 * @param usernames - Usernames (without `@`) to resolve. An empty array
 *                    short-circuits to `[]` (Drizzle's `inArray` rejects
 *                    empty lists).
 * @returns Rows of `{ id, username, prefs }` for each resolved active user.
 */
export async function findMentionTargets(usernames: string[]) {
  if (usernames.length === 0) return [];
  return await db.select({
    id: users.id,
    username: users.username,
    prefs: {
      mentionedInComment: userPreferences.mentionedInComment,
    },
  })
    .from(users)
    .leftJoin(userPreferences, eq(users.id, userPreferences.userId))
    .where(and(
      inArray(users.username, usernames),
      isNull(users.deletedAt),
      eq(users.isBanned, false),
    ));
}
