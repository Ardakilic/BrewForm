import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { badgeApi } from '../../api/index.ts';
import { requireAdmin } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('AdminBadgesPage');

/** `/admin/badges` loader: the badge catalogue (admin only). */
export const loader = requireAdmin(({ request }: LoaderFunctionArgs) =>
  withDataLog(log, 'AdminBadgesPage loadBadges', {}, async () => ({
    badges: await badgeApi.list({ signal: request.signal }),
  })),
);
