import type { LoaderFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { adminApi } from '../../api/index.ts';
import { requireAdmin } from '../../routes/auth-guards.ts';
import { withDataLog } from '../../routes/data-logging.ts';
import { parseAuditLogParams } from '../../utils/list-parsers.ts';

const log = createLogger('AdminAuditLogPage');

/** Audit-log rows per page. */
export const AUDIT_LOG_PER_PAGE = 50;

/**
 * `/admin/audit-log` loader: the requested `?page` of the audit log, filtered by
 * `?entityType` (both read with the shared parser the page's controls use).
 */
export const loader = requireAdmin(({ request }: LoaderFunctionArgs) => {
  const { page, entityType } = parseAuditLogParams(new URL(request.url).searchParams);
  return withDataLog(log, 'AdminAuditLogPage loadLogs', { page, entityType }, async () => {
    const params: Record<string, string> = {
      page: String(page),
      perPage: String(AUDIT_LOG_PER_PAGE),
    };
    if (entityType) params.entityType = entityType;
    const res = await adminApi.getAuditLog(params, { signal: request.signal });
    return { logs: res.data, pagination: res.meta.pagination };
  });
});
