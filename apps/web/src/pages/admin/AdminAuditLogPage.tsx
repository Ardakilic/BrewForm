import { useEffect } from 'react';
import { useLoaderData } from 'react-router';
import { PaginationControls } from '../../components/ui/PaginationControls.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useListUrlState } from '../../hooks/useListUrlState.ts';
import { formatDate } from '../../utils/format.ts';
import { parseAuditLogParams } from '../../utils/list-parsers.ts';
import { createLogger } from '../../utils/logger.ts';
import type { loader } from './AdminAuditLogPage.data.ts';

const log = createLogger('AdminAuditLogPage');

/**
 * Admin page: paginated audit-log table with an entity-type filter. Both selections live in
 * the URL (`?entityType=`, `?page=`) and the rows come from the route loader
 * (`AdminAuditLogPage.data.ts`), so the view is shareable and Back/Forward step through it.
 */
export function AdminAuditLogPage() {
  const { t, locale } = useTranslation();
  const { logs, pagination } = useLoaderData<typeof loader>();
  const {
    state: { entityType },
    setFilter,
    setPage,
  } = useListUrlState(parseAuditLogParams);

  useEffect(() => {
    log.debug({}, 'AdminAuditLogPage mounted');
    return () => {
      log.debug({}, 'AdminAuditLogPage unmounted');
    };
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        {t('admin.auditLog')}
      </h1>

      <div className="mb-4">
        <select
          value={entityType}
          onChange={(e) => setFilter('entityType', e.target.value)}
          className="input-field w-auto"
        >
          <option value="">{t('admin.audit.allEntities')}</option>
          <option value="user">{t('admin.audit.entityUsers')}</option>
          <option value="recipe">{t('admin.audit.entityRecipes')}</option>
          <option value="equipment">{t('admin.audit.entityEquipment')}</option>
          <option value="vendor">{t('admin.audit.entityVendors')}</option>
          <option value="taste_note">{t('admin.audit.entityTasteNotes')}</option>
          <option value="report">{t('admin.audit.entityReports')}</option>
        </select>
      </div>

      {logs.length === 0 ? (
        <p style={{ color: 'var(--text-tertiary)' }}>{t('admin.audit.noResults')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                  {t('admin.audit.date')}
                </th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                  {t('admin.audit.admin')}
                </th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                  {t('admin.audit.action')}
                </th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                  {t('admin.audit.entity')}
                </th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                  {t('admin.audit.details')}
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <td
                    className="py-2 px-3 whitespace-nowrap"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {formatDate(log.createdAt, locale)}
                  </td>
                  <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>
                    {log.admin?.username || log.adminId}
                  </td>
                  <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>
                    {log.action}
                  </td>
                  <td className="py-2 px-3">
                    <span className="badge">{log.entityType}</span>
                  </td>
                  <td
                    className="py-2 px-3 max-w-xs truncate"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {log.details || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <PaginationControls
          page={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
