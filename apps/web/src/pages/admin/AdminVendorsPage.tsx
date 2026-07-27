import { useEffect, useState } from 'react';
import { api } from '../../api/client.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useConfirm } from '../../components/ui/Modal.tsx';
import { LoadingState } from '../../components/ui/LoadingState.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { useToast } from '../../components/ui/Toast.tsx';
import { createLogger } from '../../utils/logger.ts';
import { Field } from '../../components/form/Field.tsx';
import type { VendorOutput } from '@brewform/shared/schemas';

const log = createLogger('AdminVendorsPage');

/** Admin page: vendor CRUD with inline form. */
export function AdminVendorsPage() {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const toast = useToast();
  const [vendors, setVendors] = useState<VendorOutput[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', website: '', description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    log.debug({}, 'AdminVendorsPage mounted');
    return () => {
      log.debug({}, 'AdminVendorsPage unmounted');
    };
  }, []);

  useEffect(() => {
    api.get<VendorOutput[]>('/admin/vendors').then((data) => {
      setVendors(data);
      setStatus('ready');
    }).catch((err) => {
      log.error({ err }, 'vendor list fetch failed');
      setStatus('error');
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (editId) {
        const updated = await api.patch<VendorOutput>(`/admin/vendors/${editId}`, {
          name: form.name.trim(),
          website: form.website || undefined,
          description: form.description || undefined,
        });
        setVendors((prev) => prev.map((v) => v.id === editId ? updated : v));
      } else {
        const created = await api.post<VendorOutput>('/admin/vendors', {
          name: form.name.trim(),
          website: form.website || undefined,
          description: form.description || undefined,
        });
        setVendors((prev) => [...prev, created]);
      }
      resetForm();
    } catch (err) {
      log.error({ err, editId }, 'handleSubmit failed');
      toast.error('admin.vendors.saveError');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (
      !await confirm({
        titleKey: 'common.confirmDelete',
        bodyKey: 'admin.vendors.deleteConfirm',
        danger: true,
      })
    ) return;
    try {
      await api.delete(`/admin/vendors/${id}`);
      setVendors((prev) => prev.filter((v) => v.id !== id));
    } catch (err) {
      log.error({ err, vendorId: id }, 'handleDelete failed');
      toast.error('admin.vendors.deleteFailed');
    }
  }

  function startEdit(vendor: VendorOutput) {
    setEditId(vendor.id);
    setForm({
      name: vendor.name,
      website: vendor.website || '',
      description: vendor.description || '',
    });
    setShowForm(true);
  }

  function resetForm() {
    setForm({ name: '', website: '', description: '' });
    setEditId(null);
    setShowForm(false);
  }

  return (
    <div>
      <div className='flex items-center justify-between mb-6'>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {t('admin.vendors.management')}
        </h1>
        <button type='button' onClick={() => setShowForm(!showForm)} className='btn-primary'>
          {showForm ? t('common.cancel') : t('admin.vendors.add')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className='card mb-6'>
          <h2 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
            {editId ? t('admin.vendors.editTitle') : t('admin.vendors.addTitle')}
          </h2>
          <div className='space-y-3'>
            <Field label={t('common.name')}>
              <input
                type='text'
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className='input-field'
                required
              />
            </Field>
            <Field label={t('admin.vendors.website')}>
              <input
                type='url'
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                className='input-field'
              />
            </Field>
            <Field label={t('common.description')}>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className='input-field'
                rows={3}
              />
            </Field>
          </div>
          <div className='flex gap-2 mt-4'>
            <button type='submit' className='btn-primary' disabled={saving}>
              {saving ? t('common.saving') : t('common.save')}
            </button>
            {editId && (
              <button type='button' onClick={resetForm} className='btn-secondary'>
                {t('common.cancelEdit')}
              </button>
            )}
          </div>
        </form>
      )}

      {status === 'loading'
        ? <LoadingState />
        : status === 'error'
        ? <ErrorState message={t('admin.vendors.loadError')} />
        : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('common.name')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('admin.vendors.website')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <tr key={vendor.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                    <td className='py-2 px-3' style={{ color: 'var(--text-primary)' }}>
                      {vendor.name}
                    </td>
                    <td className='py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                      {vendor.website || '-'}
                    </td>
                    <td className='py-2 px-3 flex gap-2'>
                      <button
                        type='button'
                        onClick={() =>
                          startEdit(vendor)}
                        className='text-xs'
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        type='button'
                        onClick={() =>
                          handleDelete(vendor.id)}
                        className='btn-danger-text text-xs'
                      >
                        {t('common.delete')}
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
