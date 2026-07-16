import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { NotificationOutput } from '@brewform/shared/schemas';
import { notificationApi } from '../../api/index.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '@/utils/logger.ts';
import { notifyNotificationsChanged } from '../../utils/notification-events.ts';
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
 * loading / error / empty states.
 */
export function NotificationDropdown({ onNavigate }: NotificationDropdownProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<NotificationOutput[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');

  useEffect(() => {
    let cancelled = false;
    notificationApi.list(1)
      .then((res) => {
        if (cancelled) return;
        setItems(res.data.slice(0, RECENT_LIMIT));
        setStatus('ready');
      })
      .catch((err) => {
        log.error({ err }, 'notification list fetch failed');
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleMarkAllRead() {
    try {
      await notificationApi.markAllRead();
      const readAt = new Date().toISOString();
      setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt })));
      notifyNotificationsChanged();
    } catch (err) {
      log.error({ err }, 'markAllRead failed');
    }
  }

  function handleItemRead(id: string) {
    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt } : n)));
  }

  const hasUnread = items.some((n) => !n.readAt);

  return (
    <div
      className='absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-[color:var(--border-primary)] bg-[color:var(--bg-secondary)] shadow-lg'
      role='region'
      aria-label={t('notifications.title')}
    >
      {/* Header: title + mark-all-read */}
      <div className='flex items-center justify-between border-b border-[color:var(--border-primary)] px-3 py-2'>
        <span className='text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>
          {t('notifications.title')}
        </span>
        {hasUnread && (
          <button
            type='button'
            onClick={handleMarkAllRead}
            className='rounded-sm text-xs text-[color:var(--accent-primary)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--accent-primary)]'
          >
            {t('notifications.markAllRead')}
          </button>
        )}
      </div>

      {/* Body: loading / error / empty / list */}
      <div className='max-h-96 overflow-y-auto py-1'>
        {status === 'loading' && (
          <p className='px-3 py-4 text-center text-sm' style={{ color: 'var(--text-secondary)' }}>
            {t('common.loading')}
          </p>
        )}
        {status === 'error' && (
          <p className='px-3 py-4 text-center text-sm' style={{ color: 'var(--error)' }}>
            {t('notifications.loadError')}
          </p>
        )}
        {status === 'ready' && items.length === 0 && (
          <p className='px-3 py-4 text-center text-sm' style={{ color: 'var(--text-secondary)' }}>
            {t('notifications.empty')}
          </p>
        )}
        {status === 'ready' && items.length > 0 && (
          <ul className='m-0 list-none p-0'>
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
      <div className='border-t border-[color:var(--border-primary)] px-3 py-2 text-center'>
        <Link
          to='/notifications'
          onClick={onNavigate}
          className='rounded-sm text-sm text-[color:var(--accent-primary)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--accent-primary)]'
        >
          {t('notifications.viewAll')}
        </Link>
      </div>
    </div>
  );
}
