import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface Vendor {
  id: string;
  name: string;
  website: string | null;
  description: string | null;
}

export function AdminVendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', website: '', description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Vendor[]>('/admin/vendors').then((data) => {
      setVendors(data as Vendor[]);
    }).catch(() => {
    }).finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (editId) {
        const updated = await api.patch<Vendor>(`/admin/vendors/${editId}`, {
          name: form.name.trim(),
          website: form.website || undefined,
          description: form.description || undefined,
        } as Record<string, unknown>);
        setVendors((prev) => prev.map((v) => v.id === editId ? updated as Vendor : v));
      } else {
        const created = await api.post<Vendor>('/admin/vendors', {
          name: form.name.trim(),
          website: form.website || undefined,
          description: form.description || undefined,
        } as Record<string, unknown>);
        setVendors((prev) => [...prev, created as Vendor]);
      }
      resetForm();
    } catch {
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!globalThis.confirm('Delete this vendor?')) return;
    try {
      await api.delete(`/admin/vendors/${id}`);
      setVendors((prev) => prev.filter((v) => v.id !== id));
    } catch {
    }
  }

  function startEdit(vendor: Vendor) {
    setEditId(vendor.id);
    setForm({ name: vendor.name, website: vendor.website || '', description: vendor.description || '' });
    setShowForm(true);
  }

  function resetForm() {
    setForm({ name: '', website: '', description: '' });
    setEditId(null);
    setShowForm(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Vendor Management</h1>
        <button type="button" onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Cancel' : '+ Add Vendor'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            {editId ? 'Edit Vendor' : 'Add Vendor'}
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Website</label>
              <input type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field" rows={3} />
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
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Website</th>
                <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => (
                <tr key={vendor.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{vendor.name}</td>
                  <td className="py-2 px-3" style={{ color: 'var(--text-secondary)' }}>{vendor.website || '-'}</td>
                  <td className="py-2 px-3 flex gap-2">
                    <button type="button" onClick={() => startEdit(vendor)} className="text-xs" style={{ color: 'var(--accent-primary)' }}>Edit</button>
                    <button type="button" onClick={() => handleDelete(vendor.id)} className="text-xs" style={{ color: 'var(--error)' }}>Delete</button>
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