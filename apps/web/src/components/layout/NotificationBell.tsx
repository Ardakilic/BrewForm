import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationApi } from '../../api/index.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '@/utils/logger.ts';
import { NOTIFICATIONS_CHANGED_EVENT } from '../../utils/notification-events.ts';
import { NotificationDropdown } from './NotificationDropdown.tsx';

const log = createLogger('NotificationBell');

/** Props accepted by {@link NotificationBell}. */
interface NotificationBellProps {
  /** Called when a link inside the dropdown navigates (e.g. to close the mobile menu). */
  onNavigate?: () => void;
}

/**
 * Navbar bell button with an unread-notification count badge (hidden at 0,
 * capped at "9+"). Refetches the count on mount, on window focus, and on the
 * `NOTIFICATIONS_CHANGED_EVENT` window event (no polling). Clicking toggles
 * a {@link NotificationDropdown}, closed on outside click or Escape.
 * Auth-gating is the parent's responsibility.
 */
export function NotificationBell({ onNavigate }: NotificationBellProps) {
  const { t } = useTranslation();
  const [count, setCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchCount = useCallback(() => {
    notificationApi.unreadCount()
      .then(({ count: unread }) => setCount(unread))
      .catch((err) => log.error({ err }, 'unread count fetch failed'));
  }, []);

  // Refresh triggers: mount, window focus, and notification read-state changes.
  useEffect(() => {
    fetchCount();
    globalThis.addEventListener('focus', fetchCount);
    globalThis.addEventListener(NOTIFICATIONS_CHANGED_EVENT, fetchCount);
    return () => {
      globalThis.removeEventListener('focus', fetchCount);
      globalThis.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, fetchCount);
    };
  }, [fetchCount]);

  // Close the dropdown on outside click (mousedown, TasteAutocomplete pattern).
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') setIsOpen(false);
  }, []);

  const handleNavigate = useCallback(() => {
    setIsOpen(false);
    onNavigate?.();
  }, [onNavigate]);

  return (
    <div ref={containerRef} onKeyDown={handleKeyDown} className='relative'>
      <button
        type='button'
        aria-label={t('notifications.bellLabel')}
        aria-expanded={isOpen}
        aria-haspopup='true'
        onClick={() => setIsOpen((prev) => !prev)}
        className='relative flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full text-[color:var(--text-secondary)] transition-colors duration-150 motion-reduce:duration-0 hover:bg-[color:var(--bg-tertiary)] hover:text-[color:var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-primary)]'
      >
        {/* Bell — inline SVG, no icon library needed */}
        <svg
          xmlns='http://www.w3.org/2000/svg'
          width='20'
          height='20'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
          aria-hidden='true'
        >
          <path d='M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9' />
          <path d='M13.73 21a2 2 0 0 1-3.46 0' />
        </svg>
        {count > 0 && (
          <>
            <span
              aria-hidden='true'
              className='absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--accent-primary)] px-1 text-[10px] font-bold leading-none text-white'
            >
              {count > 9 ? '9+' : count}
            </span>
            <span className='sr-only'>
              {t('notifications.unreadCount').replace('{count}', String(count))}
            </span>
          </>
        )}
      </button>
      {isOpen && <NotificationDropdown onNavigate={handleNavigate} />}
    </div>
  );
}
