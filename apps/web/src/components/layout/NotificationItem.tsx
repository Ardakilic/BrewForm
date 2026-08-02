import { Link } from 'react-router';
import type { NotificationOutput } from '@brewform/shared/schemas';
import { notificationApi } from '../../api/index.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '@/utils/logger.ts';
import { notifyNotificationsChanged } from '../../utils/notification-events.ts';
import { formatDate } from '../../utils/format.ts';

const log = createLogger('NotificationItem');

/**
 * Notification metadata payload (JSON string). Each notification type stores
 * a different shape: mention/like/comment carry `{ recipeSlug, recipeTitle }`;
 * follow carries `{ followerUsername }` (though the actor's username is also
 * available directly on `notification.actorUsername`).
 */
interface NotificationMetadata {
  recipeSlug?: string;
  recipeTitle?: string;
  followerUsername?: string;
}

/**
 * Defensively parse the notification `metadata` JSON string.
 * Malformed or non-object payloads yield `{}` so the item falls back
 * to the generic mention text instead of crashing.
 */
function parseMetadata(metadata: string | null): NotificationMetadata {
  if (!metadata) return {};
  try {
    const parsed: unknown = JSON.parse(metadata);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const { recipeSlug, recipeTitle, followerUsername } = parsed as Record<string, unknown>;
      return {
        recipeSlug: typeof recipeSlug === 'string' ? recipeSlug : undefined,
        recipeTitle: typeof recipeTitle === 'string' ? recipeTitle : undefined,
        followerUsername: typeof followerUsername === 'string' ? followerUsername : undefined,
      };
    }
  } catch {
    // Malformed metadata — fall back to generic text below.
  }
  return {};
}

/** Props accepted by {@link NotificationItem}. */
interface NotificationItemProps {
  notification: NotificationOutput;
  /** Called after the notification is successfully marked read (for local list updates). */
  onRead?: (id: string) => void;
  /** Called when the item link navigates (e.g. close a dropdown / mobile menu). */
  onNavigate?: () => void;
}

/**
 * Single notification row: mention text (actor + recipe title interpolated
 * via i18n), unread dot, timestamp, and a mark-as-read affordance. Clicking
 * the row marks it read (fire-and-forget) and navigates to the recipe when
 * the metadata carries a `recipeSlug`.
 */
export function NotificationItem({ notification, onRead, onNavigate }: NotificationItemProps) {
  const { t, locale } = useTranslation();

  const meta = parseMetadata(notification.metadata);
  const username = notification.actorUsername ?? '';
  const isUnread = !notification.readAt;

  // F05: per-type text pattern. `follow` / `like` / `comment` use the
  // matching i18n key; mention and unknown types fall back to mentionGeneric.
  const text = (() => {
    switch (notification.type) {
      case 'follow':
        return t('notifications.follow').replace('{actorUsername}', username);
      case 'like':
        return meta.recipeTitle
          ? t('notifications.like')
            .replace('{actorUsername}', username)
            .replace('{recipeTitle}', meta.recipeTitle)
          : t('notifications.mentionGeneric').replace('{username}', username);
      case 'comment':
        return meta.recipeTitle
          ? t('notifications.comment')
            .replace('{actorUsername}', username)
            .replace('{recipeTitle}', meta.recipeTitle)
          : t('notifications.mentionGeneric').replace('{username}', username);
      case 'mention':
        return meta.recipeTitle
          ? t('notifications.mention')
            .replace('{username}', username)
            .replace('{recipeTitle}', meta.recipeTitle)
          : t('notifications.mentionGeneric').replace('{username}', username);
      default:
        return t('notifications.mentionGeneric').replace('{username}', username);
    }
  })();

  // F05: per-type link target. Follow links to the actor's profile;
  // comment links to the recipe with `#commentId` anchor; like / mention
  // link to the recipe; missing slug renders a `<button>` (no nav).
  const linkTo: string | null = (() => {
    if (notification.type === 'follow') return username ? `/u/${username}` : null;
    if (notification.type === 'comment' && meta.recipeSlug && notification.referenceId) {
      return `/recipes/${meta.recipeSlug}#${notification.referenceId}`;
    }
    return meta.recipeSlug ? `/recipes/${meta.recipeSlug}` : null;
  })();

  function markRead() {
    if (!isUnread) return;
    notificationApi.markRead(notification.id)
      .then(() => {
        onRead?.(notification.id);
        notifyNotificationsChanged();
      })
      .catch((err) => {
        log.error({ err, notificationId: notification.id }, 'markRead failed');
      });
  }

  function handleActivate() {
    markRead();
    onNavigate?.();
  }

  const content = (
    <span className='flex items-start gap-2'>
      {/* Unread dot */}
      {isUnread && (
        <span
          data-testid='unread-dot'
          aria-hidden='true'
          className='mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[color:var(--accent-primary)]'
        />
      )}
      <span className='min-w-0'>
        <span
          className={`block text-sm ${isUnread ? 'font-semibold' : ''}`}
          style={{ color: 'var(--text-primary)' }}
        >
          {text}
        </span>
        <span className='block text-xs' style={{ color: 'var(--text-secondary)' }}>
          {formatDate(notification.createdAt, locale)}
        </span>
      </span>
    </span>
  );

  const interactiveClass =
    'block flex-1 rounded-md px-3 py-2 text-left transition-colors duration-150 motion-reduce:duration-0 hover:bg-[color:var(--bg-tertiary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--accent-primary)]';

  return (
    <div className='flex items-start gap-1'>
      {linkTo
        ? (
          <Link
            to={linkTo}
            onClick={handleActivate}
            className={interactiveClass}
          >
            {content}
          </Link>
        )
        : (
          <button type='button' onClick={handleActivate} className={interactiveClass}>
            {content}
          </button>
        )}
      {isUnread && (
        <button
          type='button'
          onClick={markRead}
          aria-label={t('notifications.markRead')}
          title={t('notifications.markRead')}
          className='mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-tertiary)] hover:text-[color:var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--accent-primary)]'
        >
          {/* Checkmark — inline SVG, matching the repo's icon idiom */}
          <svg
            width='12'
            height='12'
            viewBox='0 0 12 12'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
            aria-hidden='true'
          >
            <path d='M2 6l3 3 5-5' />
          </svg>
        </button>
      )}
    </div>
  );
}
