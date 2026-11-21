import type { NotificationOutput } from '@brewform/shared/schemas';
import { useEffect, useState } from 'react';
import { useFetcher, useLoaderData } from 'react-router';
import { NotificationItem } from '../../components/layout/NotificationItem.tsx';
import { PaginationControls } from '../../components/recipe-list/index.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { EmptyState } from '../../components/ui/EmptyState.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import { useListUrlState } from '../../hooks/useListUrlState.ts';
import {
  MARK_ALL_READ_PATH,
  type markAllReadAction,
} from '../../routes/resources/notifications.ts';
import { parseNotificationListParams } from '../../utils/list-parsers.ts';
import { createLogger } from '../../utils/logger.ts';
import type { loader } from './NotificationListPage.data.ts';

const log = createLogger('NotificationListPage');

/**
 * Full-page notification list for `/notifications`: a paginated feed of the
 * user's notifications (from the route loader in `NotificationListPage.data.ts`) with
 * per-item mark-as-read (via {@link NotificationItem}), a bulk "mark all read" action
 * submitted through a fetcher to `resources/notifications/read-all` (toast on
 * `{ ok: false }`), an empty state, and pagination controls. The read-state actions broadcast
 * `brewform:notifications-changed`, so the navbar bell badge refreshes.
 */
export function NotificationListPage() {
  const { notificationsResponse } = useLoaderData<typeof loader>();
  const markAllFetcher = useFetcher<typeof markAllReadAction>();
  const { t } = useTranslation();
  const {
    state: { unreadOnly },
    setFilter,
    setPage,
  } = useListUrlState(parseNotificationListParams);
  const [items, setItems] = useState<NotificationOutput[]>(notificationsResponse.data);

  // Re-sync local state whenever the loader returns a fresh page.
  useEffect(() => {
    setItems(notificationsResponse.data);
  }, [notificationsResponse]);

  useActionFeedback(markAllFetcher, {
    errorKey: 'notifications.markAllReadError',
    onSuccess: () => {
      const readAt = new Date().toISOString();
      setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt })));
    },
  });

  useEffect(() => {
    log.debug({}, 'NotificationListPage mounted');
    return () => {
      log.debug({}, 'NotificationListPage unmounted');
    };
  }, []);

  const { page, totalPages } = notificationsResponse.meta.pagination;
  const hasUnread = items.some((n) => !n.readAt);

  /** Goes to `nextPage`, keeping the filter; page 1 is omitted from the URL. */
  function handlePageChange(nextPage: number) {
    setPage(nextPage);
  }

  /**
   * F05: `All` / `Unread` filter state, derived from `?unreadOnly=true` in
   * the URL so it round-trips through the loader (peeling a fresh fetch on
   * every filter change) and survives page reloads.
   */
  const filter: 'all' | 'unread' = unreadOnly ? 'unread' : 'all';

  /**
   * F05: a filter change updates the URL → the loader re-fetches with the new `unreadOnly`
   * arg. It resets to page 1, and the defaults (`page=1`, `unreadOnly=false`) are omitted, so
   * switching to All yields a bare `/notifications`.
   */
  function handleFilterChange(next: 'all' | 'unread') {
    setFilter('unreadOnly', next === 'unread');
  }

  /** Marks one item read locally after its mark-read action succeeded. */
  function handleItemRead(id: string) {
    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt } : n)));
  }

  /** Submits the mark-all-read action (no loader revalidation; the list updates locally). */
  function handleMarkAllRead() {
    markAllFetcher.submit(
      {},
      { method: 'post', action: MARK_ALL_READ_PATH, defaultShouldRevalidate: false },
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <SEOHead title={t('notifications.title')} />

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('notifications.title')}
        </h1>
        {hasUnread && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={markAllFetcher.state !== 'idle'}
            className="btn-secondary text-sm"
          >
            {t('notifications.markAllRead')}
          </button>
        )}
      </div>

      {/* F05: All / Unread filter */}
      <div className="mb-4 flex gap-2" role="group" aria-label={t('notifications.filterLabel')}>
        <button
          type="button"
          onClick={() => handleFilterChange('all')}
          className={`btn-secondary text-sm ${filter === 'all' ? 'font-bold' : ''}`}
          aria-pressed={filter === 'all'}
        >
          {t('notifications.all')}
        </button>
        <button
          type="button"
          onClick={() => handleFilterChange('unread')}
          className={`btn-secondary text-sm ${filter === 'unread' ? 'font-bold' : ''}`}
          aria-pressed={filter === 'unread'}
        >
          {t('notifications.unread')}
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState message={t('notifications.empty')} />
      ) : (
        <ul className="m-0 list-none space-y-1 p-0">
          {items.map((n) => (
            <li key={n.id}>
              <NotificationItem notification={n} onRead={handleItemRead} />
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <PaginationControls page={page} totalPages={totalPages} onPageChange={handlePageChange} />
      )}
    </div>
  );
}
