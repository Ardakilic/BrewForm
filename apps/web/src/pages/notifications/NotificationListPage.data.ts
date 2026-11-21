import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { notificationApi } from '../../api/index.ts';
import { requireAuth } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';
import { parseNotificationListParams } from '../../utils/list-parsers.ts';

const log = createLogger('NotificationListPage');

/**
 * `/notifications` loader: the signed-in user's notifications for the requested `?page` and
 * `?unreadOnly` filter (newest first), as `{ notificationsResponse }`. Passes `request.signal`,
 * so a superseded navigation aborts the request. Wrapped in `requireAuth`, so a final 401
 * redirects to `/login?next=…`.
 */
export const loader = requireAuth(({ request }: LoaderFunctionArgs) => {
  const { page, unreadOnly } = parseNotificationListParams(new URL(request.url).searchParams);
  return withDataLog(
    log,
    'NotificationListPage loadNotifications',
    { page, unreadOnly },
    async () => ({
      notificationsResponse: await notificationApi.list(page, unreadOnly, {
        signal: request.signal,
      }),
    }),
  );
});
