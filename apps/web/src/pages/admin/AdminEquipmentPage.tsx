import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface EquipmentItem {
  id: string;
  name: string;
  type: string;
  brand: string | null;
  model: string | null;
}

export function AdminEquipmentPage() {
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', type: '', brand: '', model: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<EquipmentItem[]>('/admin/equipment').then((data) => {
      setEquipment(data as EquipmentItem[]);
    }).catch(() => {
    }).finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (editId) {
        const updated = await api.patch<EquipmentItem>(`/admin/equipment/${editId}`, {
          name: form.name.trim(),
          type: form.type.trim(),
          brand: form.brand || undefined,
          model: form.model || undefined,
        } as Record<string, unknown>);
        setEquipment((prev) => prev.map((eq) => eq.id === editId ? updated as EquipmentItem : eq));
      } else {
        const created = await api.post<EquipmentItem>('/admin/equipment', {
          name: form.name.trim(),
          type: form.type.trim(),
          brand: form.brand || undefined,
          model: form.model || undefined,
        } as Record<string, unknown>);
        setEquipment((prev) => [...prev, created as EquipmentItem]);
      }
      resetForm();
    } catch {
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!globalThis.confirm('Delete this equipment?')) return;
    try {
      await api.delete(`/admin/equipment/${id}`);
      setEquipment((prev) => prev.filter((eq) => eq.id !== id));
    } catch {
    }
  }

  function startEdit(eq: EquipmentItem) {
    setEditId(eq.id);
    setForm({ name: eq.name, type: eq.type, brand: eq.brand || '', model: eq.model || '' });
    setShowForm(true);
  }

  function resetForm() {
    setForm({ name: '', type: '', brand: '', model: '' });
    setEditId(null);
    setShowForm(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Equipment Management</h1>
        <button type="button" onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Cancel' : '+ Add Equipment'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            {editId ? 'Edit Equipment' : 'Add Equipment'}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Type *</label>
              <input type="text" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input-field" required />
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
          <div className="flex gap-2 mt-4">
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            {editId && <button type="button" onClick={resetForm} className="btn-secondary">Cancel Edit</button>}
          </div>
        </form>
      )}

      {loading ? <div style={{ color: 'var(--text-secondary)' }}>Loading...</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Name</th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Type</th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Brand</th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {equipment.map((eq) => (
                <tr key={eq.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{eq.name}</td>
                  <td className="py-2 px-3"><span className="badge">{eq.type}</span></td>
                  <td className="py-2 px-3" style={{ color: 'var(--text-secondary)' }}>{eq.brand || '-'}</td>
                  <td className="py-2 px-3 flex gap-2">
                    <button type="button" onClick={() => startEdit(eq)} className="text-xs" style={{ color: 'var(--accent-primary)' }}>Edit</button>
                    <button type="button" onClick={() => handleDelete(eq.id)} className="text-xs" style={{ color: 'var(--error)' }}>Delete</button>
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