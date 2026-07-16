import { useEffect, useState } from 'react';
import { redirect, useLoaderData, useSearchParams } from 'react-router';
import type { NotificationOutput, PaginatedResponse } from '@brewform/shared/schemas';
import { ApiError, notificationApi } from '../../api/index.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { PaginationControls } from '../../components/recipe-list/index.ts';
import { NotificationItem } from '../../components/layout/NotificationItem.tsx';
import { notifyNotificationsChanged } from '../../utils/notification-events.ts';

const log = createLogger('NotificationListPage');

/** Loader payload for {@link NotificationListPage}. */
export interface NotificationListLoaderData {
  notificationsResponse: PaginatedResponse<NotificationOutput>;
}

/**
 * React Router data loader for `/notifications` — fetches the authenticated
 * user's notifications for the requested `?page` (newest first, paginated).
 * Redirects to `/login` on a 401, mirroring the other `RequireAuth`'d
 * paginated list loaders.
 */
export const loader = async (
  { request }: { request: Request },
): Promise<NotificationListLoaderData> => {
  log.debug({}, 'NotificationListPage loader started');
  const url = new URL(request.url);
  const page = Number(url.searchParams.get('page')) || 1;
  try {
    const notificationsResponse = await notificationApi.list(page);
    log.debug({}, 'NotificationListPage loader completed');
    return { notificationsResponse };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) throw redirect('/login');
    log.error({ err }, 'NotificationListPage loader failed');
    throw err;
  }
};

/**
 * Full-page notification list for `/notifications`: a paginated feed of the
 * user's @mention notifications with per-item mark-as-read (via
 * {@link NotificationItem}), a bulk "mark all read" action, an empty state,
 * and pagination controls. Read-state changes broadcast
 * {@link notifyNotificationsChanged} so the navbar bell badge refreshes.
 */
export function NotificationListPage() {
  const { notificationsResponse } = useLoaderData() as NotificationListLoaderData;
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<NotificationOutput[]>(notificationsResponse.data);

  // Re-sync local state whenever the loader returns a fresh page.
  useEffect(() => {
    setItems(notificationsResponse.data);
  }, [notificationsResponse]);

  useEffect(() => {
    log.debug({}, 'NotificationListPage mounted');
    return () => {
      log.debug({}, 'NotificationListPage unmounted');
    };
  }, []);

  const { page, totalPages } = notificationsResponse.meta.pagination;
  const hasUnread = items.some((n) => !n.readAt);

  function handlePageChange(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(nextPage));
    setSearchParams(next);
  }

  function handleItemRead(id: string) {
    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt } : n)));
  }

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

  return (
    <div className='mx-auto max-w-2xl px-6 py-8'>
      <SEOHead title={t('notifications.title')} />

      <div className='mb-6 flex items-center justify-between'>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {t('notifications.title')}
        </h1>
        {hasUnread && (
          <button
            type='button'
            onClick={handleMarkAllRead}
            className='btn-secondary text-sm'
          >
            {t('notifications.markAllRead')}
          </button>
        )}
      </div>

      {items.length === 0
        ? (
          <p className='py-12 text-center' style={{ color: 'var(--text-secondary)' }}>
            {t('notifications.empty')}
          </p>
        )
        : (
          <ul className='m-0 list-none space-y-1 p-0'>
            {items.map((n) => (
              <li key={n.id}>
                <NotificationItem notification={n} onRead={handleItemRead} />
              </li>
            ))}
          </ul>
        )}

      {totalPages > 1 && (
        <PaginationControls
          page={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          previousLabel={t('common.previous')}
          nextLabel={t('common.next')}
          pageLabel={t('common.pagination')}
        />
      )}
    </div>
  );
}
