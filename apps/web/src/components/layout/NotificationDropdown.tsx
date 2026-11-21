import type { NotificationOutput } from '@brewform/shared/schemas';
import { useEffect, useRef, useState } from 'react';
import { Link, useFetcher } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import {
  MARK_ALL_READ_PATH,
  type markAllReadAction,
  NOTIFICATIONS_PAGE_PATH,
  type notificationsPageLoader,
} from '../../routes/resources/notifications.ts';
import { NotificationItem } from './NotificationItem.tsx';

const log = createLogger('NotificationDropdown');

/** Number of recent notifications shown in the dropdown. */
const RECENT_LIMIT = 10;

/** Props accepted by {@link NotificationDropdown}. */
interface NotificationDropdownProps {
  /** Called when a link inside the dropdown navigates (closes the dropdown / mobile menu). */
  onNavigate?: () => void;
}

/**
 * Dropdown panel anchored to the navbar {@link NotificationBell}: shows the
 * most recent notifications (first page, capped at {@link RECENT_LIMIT}),
 * a mark-all-read action, a link to the full `/notifications` page, and
 * loading / error / empty states. The page is read with
 * `useFetcher().load('/resources/notifications?page=1')` when the dropdown opens (a resource
 * route returning `{ ok, notifications }`, so a failure renders the error state); mark all
 * read submits to `resources/notifications/read-all` and toasts on `{ ok: false }`.
 */
export function NotificationDropdown({ onNavigate }: NotificationDropdownProps) {
  const { t } = useTranslation();
  const listFetcher = useFetcher<typeof notificationsPageLoader>();
  const markAllFetcher = useFetcher<typeof markAllReadAction>();
  /** `readAt` stamps applied locally after a successful mark-read, keyed by notification id. */
  const [readAtById, setReadAtById] = useState<Record<string, string>>({});
  const loadRef = useRef(listFetcher.load);
  loadRef.current = listFetcher.load;
  const result = listFetcher.data;
  const status: 'loading' | 'error' | 'ready' = !result ? 'loading' : result.ok ? 'ready' : 'error';
  const items: NotificationOutput[] = result?.ok
    ? result.notifications.data
        .slice(0, RECENT_LIMIT)
        .map((n) => (n.readAt || !readAtById[n.id] ? n : { ...n, readAt: readAtById[n.id] }))
    : [];

  // Load the first page when the dropdown opens (a fetcher load, not a direct API call).
  useEffect(() => {
    log.debug({}, 'NotificationDropdown opened');
    loadRef.current(`${NOTIFICATIONS_PAGE_PATH}?page=1`);
  }, []);

  useActionFeedback(markAllFetcher, {
    errorKey: 'notifications.markAllReadError',
    onSuccess: () => {
      const readAt = new Date().toISOString();
      setReadAtById(Object.fromEntries(items.map((n) => [n.id, n.readAt ?? readAt])));
    },
  });

  /** Submits the mark-all-read action (no loader revalidation; the list updates locally). */
  function handleMarkAllRead() {
    markAllFetcher.submit(
      {},
      { method: 'post', action: MARK_ALL_READ_PATH, defaultShouldRevalidate: false },
    );
  }

  /** Marks one item read locally after its mark-read action succeeded. */
  function handleItemRead(id: string) {
    const readAt = new Date().toISOString();
    setReadAtById((prev) => ({ ...prev, [id]: readAt }));
  }

  const hasUnread = items.some((n) => !n.readAt);

  return (
    <div
      className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-[color:var(--border-primary)] bg-[color:var(--bg-secondary)] shadow-lg"
      role="region"
      aria-label={t('notifications.title')}
    >
      {/* Header: title + mark-all-read */}
      <div className="flex items-center justify-between border-b border-[color:var(--border-primary)] px-3 py-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {t('notifications.title')}
        </span>
        {hasUnread && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={markAllFetcher.state !== 'idle'}
            className="rounded-sm text-xs text-[color:var(--accent-primary)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--accent-primary)]"
          >
            {t('notifications.markAllRead')}
          </button>
        )}
      </div>

      {/* Body: loading / error / empty / list */}
      <div className="max-h-96 overflow-y-auto py-1">
        {status === 'loading' && (
          <p className="px-3 py-4 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('common.loading')}
          </p>
        )}
        {status === 'error' && (
          <p className="px-3 py-4 text-center text-sm" style={{ color: 'var(--error)' }}>
            {t('notifications.loadError')}
          </p>
        )}
        {status === 'ready' && items.length === 0 && (
          <p className="px-3 py-4 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('notifications.empty')}
          </p>
        )}
        {status === 'ready' && items.length > 0 && (
          <ul className="m-0 list-none p-0">
            {items.map((n) => (
              <li key={n.id}>
                <NotificationItem
                  notification={n}
                  onRead={handleItemRead}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer: view-all link */}
      <div className="border-t border-[color:var(--border-primary)] px-3 py-2 text-center">
        <Link
          to="/notifications"
          onClick={onNavigate}
          className="rounded-sm text-sm text-[color:var(--accent-primary)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--accent-primary)]"
        >
          {t('notifications.viewAll')}
        </Link>
      </div>
    </div>
  );
}
