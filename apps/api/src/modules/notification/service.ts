/**
 * Notification business logic for BrewForm (F04 — @mention notifications).
 *
 * Orchestrates mention-notification fan-out (resolve mentioned usernames,
 * drop self-mentions, respect the `mentionedInComment` preference, persist
 * records, and send mention emails) plus the read-state operations behind the
 * notification endpoints (list, unread count, mark read, mark all read).
 */
import * as model from './model.ts';
import { notifyMentioned } from '../../utils/notify/index.ts';
import { createLogger } from '../../utils/logger/index.ts';

const logger = createLogger('notification-service');

/**
 * Dependency-injection proxy for test stubbing (data access + email
 * side-effect). Mirrors the `deps` idiom used by router modules
 * (e.g. `coffee-variety/index.ts`), applied at the service layer so unit
 * tests can exercise the real service functions without a database or SMTP.
 */
export const deps = { model, notifyMentioned };

/** A notification row as returned by the model layer (actor username joined). */
type NotificationRow = NonNullable<Awaited<ReturnType<typeof model.findById>>>;

/**
 * Map a model notification row to the NotificationOutput wire shape:
 * timestamps become ISO strings and the joined actor relation is flattened
 * to a nullable `actorUsername`.
 */
function toOutput(row: NotificationRow) {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    actorId: row.actorId,
    actorUsername: row.actor?.username ?? null,
    referenceId: row.referenceId,
    referenceType: row.referenceType,
    metadata: row.metadata,
    readAt: row.readAt instanceof Date ? row.readAt.toISOString() : row.readAt,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

/**
 * Create mention notifications (and mention emails) for a new comment.
 *
 * Flow per validated F04 design:
 *   1. Empty mention list → no-op.
 *   2. Resolve usernames to active users (+ preference row) via the model.
 *   3. Drop self-mentions (`target.id === mentionerUserId`).
 *   4. The `mentionedInComment` preference gates BOTH the DB record and the
 *      email: an opted-out target is skipped entirely (missing prefs row
 *      counts as enabled — the column defaults to true).
 *   5. Each remaining target gets a `mention` notification row referencing
 *      the comment, with `{ recipeSlug, recipeTitle }` JSON metadata.
 *   6. A mention email is sent EXCEPT when the target is the recipe author,
 *      who already receives the recipe-commented email for the same comment.
 *
 * Per-target failures are isolated: a failed insert or email is logged and
 * skipped without aborting the remaining targets.
 *
 * Designed to be fire-and-forget from the comment service: callers attach a
 * `.catch(...)` and failures never block comment creation.
 *
 * @param params - Mention context: parsed usernames, comment/recipe identity,
 *                 mentioner identity, and the recipe author for email gating.
 */
export async function createMentionNotifications(params: {
  mentions: string[];
  commentId: string;
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
  mentionerUserId: string;
  mentionerUsername: string;
  recipeAuthorId: string;
}): Promise<void> {
  const {
    mentions,
    commentId,
    recipeId,
    recipeSlug,
    recipeTitle,
    mentionerUserId,
    mentionerUsername,
    recipeAuthorId,
  } = params;
  logger.debug(
    { commentId, recipeId, mentionCount: mentions.length },
    'createMentionNotifications started',
  );
  if (mentions.length === 0) {
    logger.debug({ commentId, recipeId, created: 0 }, 'createMentionNotifications completed');
    return;
  }

  try {
    const targets = await deps.model.findMentionTargets(mentions);
    let created = 0;
    for (const target of targets) {
      if (target.id === mentionerUserId) continue;
      if (target.prefs?.mentionedInComment === false) continue;

      try {
        await deps.model.create({
          userId: target.id,
          type: 'mention',
          actorId: mentionerUserId,
          referenceId: commentId,
          referenceType: 'comment',
          metadata: JSON.stringify({ recipeSlug, recipeTitle }),
        });
        created++;
      } catch (err) {
        logger.error({ err, commentId, recipeId }, 'mention notification create failed');
        continue;
      }

      if (target.id !== recipeAuthorId) {
        try {
          await deps.notifyMentioned({
            mentionedUserId: target.id,
            mentionerUsername,
            recipeTitle,
            recipeSlug,
          });
        } catch (err) {
          logger.error({ err, commentId, recipeId }, 'mention email failed');
        }
      }
    }
    logger.debug({ commentId, recipeId, created }, 'createMentionNotifications completed');
  } catch (err) {
    logger.error({ err, commentId, recipeId }, 'createMentionNotifications failed');
    throw err;
  }
}

/**
 * List a user's notifications (paginated, newest first).
 *
 * @param userId - The authenticated user's UUID.
 * @param page - 1-based page number.
 * @param perPage - Page size.
 * @param unreadOnly - When true, only unread notifications are returned.
 * @returns `{ notifications, total }` with wire-shaped notification items.
 */
export async function listNotifications(
  userId: string,
  page: number,
  perPage: number,
  unreadOnly: boolean,
) {
  logger.debug({ page, perPage, unreadOnly }, 'listNotifications started');
  try {
    const result = await deps.model.findByUserId(userId, page, perPage, unreadOnly);
    logger.debug({ total: result.total }, 'listNotifications completed');
    return { notifications: result.notifications.map(toOutput), total: result.total };
  } catch (err) {
    logger.error({ err, page, perPage, unreadOnly }, 'listNotifications failed');
    throw err;
  }
}

/**
 * Mark a single notification as read. Only the recipient may mark it.
 * Idempotent: marking an already-read notification returns it unchanged
 * (original `readAt` preserved).
 *
 * @param userId - The authenticated user's UUID.
 * @param notificationId - The notification's UUID.
 * @throws 'NOTIFICATION_NOT_FOUND' if the row is missing or soft-deleted.
 * @throws 'FORBIDDEN' if the row belongs to another user.
 * @returns The wire-shaped notification with its read timestamp set.
 */
export async function markAsRead(userId: string, notificationId: string) {
  logger.debug({ notificationId }, 'markAsRead started');
  try {
    const row = await deps.model.findById(notificationId);
    if (!row) throw new Error('NOTIFICATION_NOT_FOUND');
    if (row.userId !== userId) throw new Error('FORBIDDEN');
    const updated = await deps.model.markAsRead(notificationId);
    logger.debug({ notificationId }, 'markAsRead completed');
    return toOutput({ ...row, readAt: updated ? updated.readAt : row.readAt });
  } catch (err) {
    logger.error({ err, notificationId }, 'markAsRead failed');
    throw err;
  }
}

/**
 * Mark all of a user's unread notifications as read.
 *
 * @param userId - The authenticated user's UUID.
 * @returns The number of notifications that were marked read.
 */
export async function markAllAsRead(userId: string) {
  logger.debug({}, 'markAllAsRead started');
  try {
    const marked = await deps.model.markAllAsRead(userId);
    logger.debug({ marked }, 'markAllAsRead completed');
    return marked;
  } catch (err) {
    logger.error({ err }, 'markAllAsRead failed');
    throw err;
  }
}

/**
 * Get a user's unread notification count.
 *
 * @param userId - The authenticated user's UUID.
 * @returns The number of unread notifications.
 */
export async function getUnreadCount(userId: string) {
  logger.debug({}, 'getUnreadCount started');
  try {
    const unreadCount = await deps.model.getUnreadCount(userId);
    logger.debug({ unreadCount }, 'getUnreadCount completed');
    return unreadCount;
  } catch (err) {
    logger.error({ err }, 'getUnreadCount failed');
    throw err;
  }
}
