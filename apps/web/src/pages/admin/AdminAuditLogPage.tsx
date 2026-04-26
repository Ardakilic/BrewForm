import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface AuditLogEntry {
  id: string;
  adminId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string | null;
  createdAt: string;
  admin?: { username: string };
}

export function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [entityFilter, setEntityFilter] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), perPage: '50' });
    if (entityFilter) params.set('entityType', entityFilter);
    api.get<{ logs: AuditLogEntry[]; total: number }>(`/admin/audit-log?${params}`).then((data) => {
      const d = data as Record<string, unknown>;
      setLogs((d.logs as AuditLogEntry[]) || []);
    }).catch(() => {
    }).finally(() => setLoading(false));
  }, [page, entityFilter]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Audit Log</h1>

      <div className="mb-4">
        <select value={entityFilter} onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }} className="input-field w-auto">
          <option value="">All Entities</option>
          <option value="user">Users</option>
          <option value="recipe">Recipes</option>
          <option value="equipment">Equipment</option>
          <option value="vendor">Vendors</option>
          <option value="taste_note">Taste Notes</option>
          <option value="report">Reports</option>
        </select>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Date</th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Admin</th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Action</th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Entity</th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <td className="py-2 px-3 whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
                    {new Date(log.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>
                    {log.admin?.username || log.adminId}
                  </td>
                  <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{log.action}</td>
                  <td className="py-2 px-3">
                    <span className="badge">{log.entityType}</span>
                  </td>
                  <td className="py-2 px-3 max-w-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                    {log.details || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        {page > 1 && (
          <button type="button" onClick={() => setPage(page - 1)} className="btn-secondary">Previous</button>
        )}
        <button type="button" onClick={() => setPage(page + 1)} className="btn-secondary">Next</button>
      </div>
    </div>
  );
}