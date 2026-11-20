import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { adminApi } from '../../api/index.ts';
import { requireAdmin } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';

const log = createLogger('AdminDashboard');

/** `/admin` loader: the dashboard totals (admin only; 401 → login, 403 → home). */
export const loader = requireAdmin(({ request }: LoaderFunctionArgs) =>
  withDataLog(log, 'AdminDashboard loadStats', {}, async () => ({
    stats: await adminApi.getStats({ signal: request.signal }),
  })),
);
