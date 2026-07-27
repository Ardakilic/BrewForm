import { useEffect, useState } from 'react';
import { api } from '../../api/client.ts';
import { invalidateStaticCache } from '../../api/static-cache.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useConfirm } from '../../components/ui/Modal.tsx';
import { Field } from '../../components/form/Field.tsx';
import type { EquipmentOutput } from '@brewform/shared/schemas';
import { LoadingState } from '../../components/ui/LoadingState.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('AdminEquipmentPage');

/** Admin page: equipment CRUD with inline form; invalidates the static cache on changes. */
export function AdminEquipmentPage() {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const [equipment, setEquipment] = useState<EquipmentOutput[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', type: '', brand: '', model: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    log.debug({}, 'AdminEquipmentPage mounted');
    return () => {
      log.debug({}, 'AdminEquipmentPage unmounted');
    };
  }, []);

  useEffect(() => {
    api.get<EquipmentOutput[]>('/admin/equipment').then((data) => {
      setEquipment(data);
      setStatus('ready');
    }).catch((err) => {
      log.error({ err }, 'admin equipment fetch failed');
      setStatus('error');
    });
  }, []);

  /**
   * Create or edit equipment. Both branches update local state and share
   * a single `resetForm()` and `invalidateStaticCache()` call on success.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    log.debug({ editId }, 'handleSubmit started');
    try {
      if (editId) {
        const updated = await api.patch<EquipmentOutput>(`/admin/equipment/${editId}`, {
          name: form.name.trim(),
          type: form.type.trim(),
          brand: form.brand || undefined,
          model: form.model || undefined,
        });
        setEquipment((prev) =>
          prev.map((eq) => eq.id === editId ? updated as EquipmentOutput : eq)
        );
      } else {
        const created = await api.post<EquipmentOutput>('/admin/equipment', {
          name: form.name.trim(),
          type: form.type.trim(),
          brand: form.brand || undefined,
          model: form.model || undefined,
        });
        setEquipment((prev) => [...prev, created as EquipmentOutput]);
      }
      resetForm();
      log.debug({ editId }, 'handleSubmit completed');
      invalidateStaticCache();
    } catch (err) {
      log.error({ err, editId }, 'handleSubmit failed');
    } finally {
      setSaving(false);
    }
  }

  /**
   * DELETE `/admin/equipment/:id`, remove the item from local state, and
   * invalidate the static cache so the next loader run re-fetches.
   */
  async function handleDelete(id: string) {
    if (
      !await confirm({
        titleKey: 'common.confirmDelete',
        bodyKey: 'admin.equipment.deleteConfirm',
        danger: true,
      })
    ) return;
    log.debug({ equipmentId: id }, 'handleDelete started');
    try {
      await api.delete(`/admin/equipment/${id}`);
      setEquipment((prev) => prev.filter((eq) => eq.id !== id));
      log.debug({ equipmentId: id }, 'handleDelete completed');
      invalidateStaticCache();
    } catch (err) {
      log.error({ err, equipmentId: id }, 'handleDelete failed');
    }
  }

  function startEdit(eq: EquipmentOutput) {
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
      <div className='flex items-center justify-between mb-6'>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {t('admin.equipment.management')}
        </h1>
        <button type='button' onClick={() => setShowForm(!showForm)} className='btn-primary'>
          {showForm ? t('common.cancel') : t('admin.equipment.add')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className='card mb-6'>
          <h2 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
            {editId ? t('admin.equipment.editTitle') : t('admin.equipment.addTitle')}
          </h2>
          <div className='grid grid-cols-2 gap-4'>
            <Field label={t('equipment.name')} required>
              <input
                type='text'
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className='input-field'
                required
              />
            </Field>
            <Field label={t('common.type')} required>
              <input
                type='text'
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className='input-field'
                required
              />
            </Field>
            <Field label={t('equipment.brand')}>
              <input
                type='text'
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className='input-field'
              />
            </Field>
            <Field label={t('equipment.model')}>
              <input
                type='text'
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className='input-field'
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
        ? <ErrorState message={t('admin.equipment.loadError')} />
        : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('equipment.name')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('common.type')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('equipment.brand')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {equipment.map((eq) => (
                  <tr key={eq.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                    <td className='py-2 px-3' style={{ color: 'var(--text-primary)' }}>
                      {eq.name}
                    </td>
                    <td className='py-2 px-3'>
                      <span className='badge'>{eq.type}</span>
                    </td>
                    <td className='py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                      {eq.brand || '-'}
                    </td>
                    <td className='py-2 px-3 flex gap-2'>
                      <button
                        type='button'
                        onClick={() =>
                          startEdit(eq)}
                        className='text-xs'
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        type='button'
                        onClick={() =>
                          handleDelete(eq.id)}
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
