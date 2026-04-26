import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { SEOHead } from '../../components/seo/SEOHead';
import { api } from '../../api/client';

interface Setup {
  id: string;
  name: string;
  brewerDetails: string | null;
  grinder: string | null;
  isDefault: boolean;
  createdAt: string;
}

export function SetupListPage() {
  const [setups, setSetups] = useState<Setup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [brewerDetails, setBrewerDetails] = useState('');
  const [grinder, setGrinder] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Setup[]>('/setups').then((data) => {
      setSetups(data as Setup[]);
    }).catch(() => {
    }).finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const newSetup = await api.post<Setup>('/setups', { name: name.trim(), brewerDetails: brewerDetails || undefined, grinder: grinder || undefined } as Record<string, unknown>);
      setSetups((prev) => [...prev, newSetup as Setup]);
      setName('');
      setBrewerDetails('');
      setGrinder('');
      setShowForm(false);
    } catch {
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!globalThis.confirm('Delete this setup?')) return;
    try {
      await api.delete(`/setups/${id}`);
      setSetups((prev) => prev.filter((s) => s.id !== id));
    } catch {
    }
  }

  if (loading) return <div className="mx-auto max-w-4xl px-6 py-12 text-center" style={{ color: 'var(--text-secondary)' }}>Loading...</div>;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <SEOHead title="My Setups" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>My Setups</h1>
        <button type="button" onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Cancel' : '+ New Setup'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card mb-6">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Create Setup</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="My V60 Setup" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Brewer Details</label>
              <input type="text" value={brewerDetails} onChange={(e) => setBrewerDetails(e.target.value)} className="input-field" placeholder="May 2024 batch" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Grinder</label>
              <input type="text" value={grinder} onChange={(e) => setGrinder(e.target.value)} className="input-field" placeholder="Niche Zero" />
            </div>
          </div>
          <button type="submit" className="btn-primary mt-4" disabled={saving}>
            {saving ? 'Creating...' : 'Create Setup'}
          </button>
        </form>
      )}

      {setups.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
          No setups yet. Create your first brewing setup!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {setups.map((setup) => (
            <div key={setup.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {setup.name}
                    {setup.isDefault && <span className="badge ml-2 text-xs">Default</span>}
                  </h3>
                  {setup.brewerDetails && <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{setup.brewerDetails}</p>}
                  {setup.grinder && <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Grinder: {setup.grinder}</p>}
                </div>
                <button type="button" onClick={() => handleDelete(setup.id)} className="text-sm" style={{ color: 'var(--error)' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}