import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface CompatibilityRule {
  id: string;
  brewMethod: string;
  equipmentType: string;
  isCompatible: boolean;
}

export function AdminCompatibilityPage() {
  const [rules, setRules] = useState<CompatibilityRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [flushing, setFlushing] = useState(false);

  useEffect(() => {
    api.get<CompatibilityRule[]>('/admin/compatibility').then((data) => {
      setRules(data as CompatibilityRule[]);
    }).catch(() => {
    }).finally(() => setLoading(false));
  }, []);

  async function toggleCompatibility(id: string, current: boolean) {
    try {
      const updated = await api.patch<CompatibilityRule>(`/admin/compatibility/${id}`, { isCompatible: !current } as Record<string, unknown>);
      setRules((prev) => prev.map((r) => r.id === id ? updated as CompatibilityRule : r));
    } catch {
    }
  }

  async function flushCache() {
    setFlushing(true);
    try {
      await api.post('/admin/cache/flush', {});
    } catch {
    } finally {
      setFlushing(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Compatibility Matrix</h1>
        <button type="button" onClick={flushCache} className="btn-secondary" disabled={flushing}>
          {flushing ? 'Flushing...' : 'Flush Cache'}
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Brew Method</th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Equipment Type</th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Compatible</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{rule.brewMethod.replace(/_/g, ' ')}</td>
                  <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{rule.equipmentType.replace(/_/g, ' ')}</td>
                  <td className="py-2 px-3">
                    <button
                      type="button"
                      onClick={() => toggleCompatibility(rule.id, rule.isCompatible)}
                      className="rounded px-3 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: rule.isCompatible ? 'var(--success)' : 'var(--bg-tertiary)',
                        color: rule.isCompatible ? 'white' : 'var(--text-primary)',
                      }}
                    >
                      {rule.isCompatible ? 'Yes' : 'No'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}