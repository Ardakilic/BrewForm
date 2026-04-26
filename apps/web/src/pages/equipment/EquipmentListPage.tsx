import { useEffect, useState } from 'react';
import { SEOHead } from '../../components/seo/SEOHead';
import { api } from '../../api/client';

interface EquipmentItem {
  id: string;
  name: string;
  type: string;
  brand: string | null;
  model: string | null;
  createdAt: string;
}

export function EquipmentListPage() {
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: '', brand: '', model: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<EquipmentItem[]>('/equipment').then((data) => {
      setEquipment(data as EquipmentItem[]);
    }).catch(() => {
    }).finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.type.trim() || saving) return;
    setSaving(true);
    try {
      const newEq = await api.post<EquipmentItem>('/equipment', {
        name: form.name.trim(),
        type: form.type.trim(),
        brand: form.brand || undefined,
        model: form.model || undefined,
      } as Record<string, unknown>);
      setEquipment((prev) => [...prev, newEq as EquipmentItem]);
      setForm({ name: '', type: '', brand: '', model: '' });
      setShowForm(false);
    } catch {
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!globalThis.confirm('Delete this equipment?')) return;
    try {
      await api.delete(`/equipment/${id}`);
      setEquipment((prev) => prev.filter((e) => e.id !== id));
    } catch {
    }
  }

  if (loading) return <div className="mx-auto max-w-4xl px-6 py-12 text-center" style={{ color: 'var(--text-secondary)' }}>Loading...</div>;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <SEOHead title="Equipment" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Equipment</h1>
        <button type="button" onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Cancel' : '+ Add Equipment'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card mb-6">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Add Equipment</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Type *</label>
              <input type="text" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input-field" placeholder="portafilter, basket, tamper..." required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Brand</label>
              <input type="text" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Model</label>
              <input type="text" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="input-field" />
            </div>
          </div>
          <button type="submit" className="btn-primary mt-4" disabled={saving}>
            {saving ? 'Adding...' : 'Add Equipment'}
          </button>
        </form>
      )}

      {equipment.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>No equipment yet. Add your brewing equipment!</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {equipment.map((eq) => (
            <div key={eq.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{eq.name}</h3>
                  <div className="flex gap-2 mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    <span className="badge">{eq.type}</span>
                    {eq.brand && <span>{eq.brand}</span>}
                    {eq.model && <span>{eq.model}</span>}
                  </div>
                </div>
                <button type="button" onClick={() => handleDelete(eq.id)} className="text-sm" style={{ color: 'var(--error)' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}