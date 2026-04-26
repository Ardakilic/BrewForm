import { useEffect, useState } from 'react';
import { SEOHead } from '../../components/seo/SEOHead';
import { api } from '../../api/client';

interface Bean {
  id: string;
  productName: string | null;
  brand: string | null;
  origin: string | null;
  processing: string | null;
  roastLevel: string | null;
  createdAt: string;
}

export function BeanListPage() {
  const [beans, setBeans] = useState<Bean[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ productName: '', brand: '', origin: '', processing: '', roastLevel: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Bean[]>('/beans').then((data) => {
      setBeans(data as Bean[]);
    }).catch(() => {
    }).finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const newBean = await api.post<Bean>('/beans', {
        productName: form.productName || undefined,
        brand: form.brand || undefined,
        origin: form.origin || undefined,
        processing: form.processing || undefined,
        roastLevel: form.roastLevel || undefined,
      } as Record<string, unknown>);
      setBeans((prev) => [...prev, newBean as Bean]);
      setForm({ productName: '', brand: '', origin: '', processing: '', roastLevel: '' });
      setShowForm(false);
    } catch {
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!globalThis.confirm('Delete this bean?')) return;
    try {
      await api.delete(`/beans/${id}`);
      setBeans((prev) => prev.filter((b) => b.id !== id));
    } catch {
    }
  }

  if (loading) return <div className="mx-auto max-w-4xl px-6 py-12 text-center" style={{ color: 'var(--text-secondary)' }}>Loading...</div>;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <SEOHead title="My Beans" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>My Beans</h1>
        <button type="button" onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Cancel' : '+ Add Bean'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card mb-6">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Add Bean</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Product Name</label>
              <input type="text" value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Brand</label>
              <input type="text" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Origin</label>
              <input type="text" value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} className="input-field" placeholder="Ethiopia, Colombia..." />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Processing</label>
              <input type="text" value={form.processing} onChange={(e) => setForm({ ...form, processing: e.target.value })} className="input-field" placeholder="Washed, Natural, Honey..." />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Roast Level</label>
              <input type="text" value={form.roastLevel} onChange={(e) => setForm({ ...form, roastLevel: e.target.value })} className="input-field" placeholder="Light, Medium, Dark..." />
            </div>
          </div>
          <button type="submit" className="btn-primary mt-4" disabled={saving}>
            {saving ? 'Adding...' : 'Add Bean'}
          </button>
        </form>
      )}

      {beans.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>No beans yet. Add your coffee beans!</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {beans.map((bean) => (
            <div key={bean.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {bean.productName || 'Unnamed Bean'}
                  </h3>
                  {bean.brand && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{bean.brand}</p>}
                  <div className="flex gap-2 mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {bean.origin && <span>{bean.origin}</span>}
                    {bean.processing && <span>• {bean.processing}</span>}
                    {bean.roastLevel && <span>• {bean.roastLevel}</span>}
                  </div>
                </div>
                <button type="button" onClick={() => handleDelete(bean.id)} className="text-sm" style={{ color: 'var(--error)' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}