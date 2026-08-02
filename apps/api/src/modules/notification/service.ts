/**
 * Notification business logic for BrewForm (F04 + F05 — `mention`, `follow`,
 * `like`, `comment` notification types).
 *
 * Orchestrates mention-notification fan-out (resolve mentioned usernames,
 * drop self-mentions, respect the `notifyMentionedInComment` preference,
 * persist records, and send mention emails) plus single-recipient fan-out
 * for `follow` / `like` / `comment` (mirror pattern: load prefs, skip
 * self-action and opted-out recipients, persist record, send email via the
 * matching `notify*` helper), plus the read-state operations behind the
 * notification endpoints (list, unread count, mark read, mark all read).
 */
import * as model from './model.ts';
import {
  notifyMentioned,
  notifyNewFollower,
  notifyRecipeCommented,
  notifyRecipeLiked,
} from '../../utils/notify/index.ts';
import { createLogger } from '../../utils/logger/index.ts';

const logger = createLogger('notification-service');

/**
 * Dependency-injection proxy for test stubbing (data access + email
 * side-effects). Mirrors the `deps` idiom used by router modules
 * (e.g. `coffee-variety/index.ts`), applied at the service layer so unit
 * tests can exercise the real service functions without a database or SMTP.
 * F05 extends: `notifyNewFollower` / `notifyRecipeLiked` / `notifyRecipeCommented`
 * joined for the three new fan-out creators.
 */
export const deps = {
  model,
  notifyMentioned,
  notifyNewFollower,
  notifyRecipeLiked,
  notifyRecipeCommented,
};

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
      if (target.prefs?.notifyMentionedInComment === false) continue;

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
 * Create a follow notification (and follow email) when a user follows another.
 *
 * Flow per F05 D1/D2/D4:
 *   1. Resolve the followed user + their preferences row via the model.
 *   2. Drop self-follow (should never happen at the call-site, belt-and-braces).
 *   3. The `notifyNewFollower` preference gates BOTH the DB record and the
 *      email: an opted-out target is skipped entirely (missing prefs row
 *      counts as enabled — the column defaults to true).
 *   4. Insert a `follow` notification row with `actorId = followerId`,
 *      `referenceType = 'actor'`, `metadata = { followerUsername }`.
 *   5. Send the follow email (`notifyNewFollower`).
 *
 * Per-target failures are isolated: a failed insert or email is logged and
 * skipped without aborting. Designed fire-and-forget from the follow service.
 *
 * @param params - `{ followerId, followerUsername, followingId }`.
 */
export async function createFollowNotification(params: {
  followerId: string;
  followerUsername: string;
  followingId: string;
}): Promise<void> {
  const { followerId, followerUsername, followingId } = params;
  logger.debug({ followerId, followingId }, 'createFollowNotification started');
  if (followerId === followingId) {
    logger.debug(
      { followerId, followingId, created: 0 },
      'createFollowNotification completed (self-follow skipped)',
    );
    return;
  }

  try {
    const target = await deps.model.findNotifyTarget(followingId);
    if (!target) {
      logger.debug(
        { followingId, created: 0 },
        'createFollowNotification completed (target not found)',
      );
      return;
    }
    if (target.prefs?.notifyNewFollower === false) {
      logger.debug(
        { followingId, created: 0 },
        'createFollowNotification completed (opted out)',
      );
      return;
    }

    let created = 0;
    try {
      await deps.model.create({
        userId: followingId,
        type: 'follow',
        actorId: followerId,
        referenceId: null,
        referenceType: 'actor',
        metadata: JSON.stringify({ followerUsername }),
      });
      created++;
    } catch (err) {
      logger.error({ err, followerId, followingId }, 'follow notification create failed');
    }

    try {
      await deps.notifyNewFollower({ followingId, followerUsername });
    } catch (err) {
      logger.error({ err, followerId, followingId }, 'follow email failed');
    }

    logger.debug({ followingId, created }, 'createFollowNotification completed');
  } catch (err) {
    logger.error({ err, followerId, followingId }, 'createFollowNotification failed');
    throw err;
  }
}

/**
 * Create a like notification (and recipe-liked email) when a user likes
 * someone else's recipe. Skips self-likes. Single-recipient: targets the
 * recipe author only. Flow mirrors `createFollowNotification`.
 *
 * @param params - `{ likerId, likerUsername, recipeAuthorId, recipeId, recipeSlug, recipeTitle }`.
 */
export async function createLikeNotification(params: {
  likerId: string;
  likerUsername: string;
  recipeAuthorId: string;
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
}): Promise<void> {
  const { likerId, likerUsername, recipeAuthorId, recipeId, recipeSlug, recipeTitle } = params;
  logger.debug({ likerId, recipeId, recipeAuthorId }, 'createLikeNotification started');
  if (likerId === recipeAuthorId) {
    logger.debug(
      { likerId, recipeId, created: 0 },
      'createLikeNotification completed (self-like skipped)',
    );
    return;
  }

  try {
    const target = await deps.model.findNotifyTarget(recipeAuthorId);
    if (!target) {
      logger.debug(
        { recipeAuthorId, created: 0 },
        'createLikeNotification completed (target not found)',
      );
      return;
    }
    if (target.prefs?.notifyRecipeLiked === false) {
      logger.debug(
        { recipeAuthorId, created: 0 },
        'createLikeNotification completed (opted out)',
      );
      return;
    }

    let created = 0;
    try {
      await deps.model.create({
        userId: recipeAuthorId,
        type: 'like',
        actorId: likerId,
        referenceId: recipeId,
        referenceType: 'recipe',
        metadata: JSON.stringify({ recipeSlug, recipeTitle }),
      });
      created++;
    } catch (err) {
      logger.error(
        { err, likerId, recipeId, recipeAuthorId },
        'like notification create failed',
      );
    }

    try {
      await deps.notifyRecipeLiked({
        recipeAuthorId,
        likerUsername,
        recipeTitle,
        recipeSlug,
      });
    } catch (err) {
      logger.error({ err, likerId, recipeId }, 'like email failed');
    }

    logger.debug({ recipeAuthorId, created }, 'createLikeNotification completed');
  } catch (err) {
    logger.error(
      { err, likerId, recipeId, recipeAuthorId },
      'createLikeNotification failed',
    );
    throw err;
  }
}

/**
 * Create a comment-on-recipe notification (and recipe-commented email) for
 * the recipe author when someone else comments on their recipe. Skips
 * self-comments. This path is DISTINCT from `createMentionNotifications`
 * (F04), which targets each `@username` in the comment body. The same
 * comment can trigger BOTH fan-outs: this one targets the recipe author
 * ("X commented on your recipe"); the mention path targets each mentioned
 * user ("X mentioned you"). See design D6.
 *
 * @param params - `{ commenterId, commenterUsername, recipeAuthorId, recipeId, recipeSlug, recipeTitle, commentId }`.
 */
export async function createCommentNotification(params: {
  commenterId: string;
  commenterUsername: string;
  recipeAuthorId: string;
  recipeId: string;
  recipeSlug: string;
  recipeTitle: string;
  commentId: string;
}): Promise<void> {
  const {
    commenterId,
    commenterUsername,
    recipeAuthorId,
    recipeId,
    recipeSlug,
    recipeTitle,
    commentId,
  } = params;
  logger.debug(
    { commenterId, recipeId, recipeAuthorId },
    'createCommentNotification started',
  );
  if (commenterId === recipeAuthorId) {
    logger.debug(
      { commenterId, recipeId, created: 0 },
      'createCommentNotification completed (self-comment skipped)',
    );
    return;
  }

  try {
    const target = await deps.model.findNotifyTarget(recipeAuthorId);
    if (!target) {
      logger.debug(
        { recipeAuthorId, created: 0 },
        'createCommentNotification completed (target not found)',
      );
      return;
    }
    if (target.prefs?.notifyRecipeCommented === false) {
      logger.debug(
        { recipeAuthorId, created: 0 },
        'createCommentNotification completed (opted out)',
      );
      return;
    }

    let created = 0;
    try {
      await deps.model.create({
        userId: recipeAuthorId,
        type: 'comment',
        actorId: commenterId,
        referenceId: commentId,
        referenceType: 'comment',
        metadata: JSON.stringify({ recipeSlug, recipeTitle }),
      });
      created++;
    } catch (err) {
      logger.error(
        { err, commentId, recipeId, recipeAuthorId },
        'comment notification create failed',
      );
    }

    try {
      await deps.notifyRecipeCommented({
        recipeAuthorId,
        commenterUsername,
        recipeTitle,
        recipeSlug,
      });
    } catch (err) {
      logger.error({ err, commentId, recipeId }, 'comment email failed');
    }

    logger.debug({ recipeAuthorId, created }, 'createCommentNotification completed');
  } catch (err) {
    logger.error(
      { err, commenterId, recipeId, recipeAuthorId },
      'createCommentNotification failed',
    );
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
