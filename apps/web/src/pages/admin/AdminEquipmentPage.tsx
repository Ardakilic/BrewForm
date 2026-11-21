import type { EquipmentOutput } from '@brewform/shared/schemas';
import { useEffect, useState } from 'react';
import { useFetcher, useLoaderData } from 'react-router';
import { Field } from '../../components/form/Field.tsx';
import { useConfirm } from '../../components/ui/Modal.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import { createLogger } from '../../utils/logger.ts';
import type { action, loader } from './AdminEquipmentPage.data.ts';

const log = createLogger('AdminEquipmentPage');

/**
 * Admin page: equipment CRUD with an inline form. Equipment comes from the `/admin/equipment`
 * route loader; create, update and delete submit `intent`s to the route action
 * (`AdminEquipmentPage.data.ts`), which invalidates the static cache on success. Failures
 * toast (`admin.equipment.saveError` / `admin.equipment.deleteFailed`) instead of only logging.
 */
export function AdminEquipmentPage() {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const { equipment } = useLoaderData<typeof loader>();
  const saveFetcher = useFetcher<typeof action>();
  const deleteFetcher = useFetcher<typeof action>();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', type: '', brand: '', model: '' });
  const saving = saveFetcher.state !== 'idle';

  useActionFeedback(saveFetcher, { errorKey: 'admin.equipment.saveError', onSuccess: resetForm });
  useActionFeedback(deleteFetcher, { errorKey: 'admin.equipment.deleteFailed' });

  useEffect(() => {
    log.debug({}, 'AdminEquipmentPage mounted');
    return () => {
      log.debug({}, 'AdminEquipmentPage unmounted');
    };
  }, []);

  /** Submits the form as a `create` or (when editing) an `update` intent. */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    saveFetcher.submit(
      editId ? { intent: 'update', id: editId, ...form } : { intent: 'create', ...form },
      { method: 'post' },
    );
  }

  /** Asks for confirmation, then submits the `delete` intent. */
  async function handleDelete(id: string) {
    if (
      !(await confirm({
        titleKey: 'common.confirmDelete',
        bodyKey: 'admin.equipment.deleteConfirm',
        danger: true,
      }))
    )
      return;
    deleteFetcher.submit({ intent: 'delete', id }, { method: 'post' });
  }

  /** Opens the form pre-filled with `eq` for editing. */
  function startEdit(eq: EquipmentOutput) {
    setEditId(eq.id);
    setForm({ name: eq.name, type: eq.type, brand: eq.brand || '', model: eq.model || '' });
    setShowForm(true);
  }

  /** Clears and closes the form. */
  function resetForm() {
    setForm({ name: '', type: '', brand: '', model: '' });
    setEditId(null);
    setShowForm(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('admin.equipment.management')}
        </h1>
        <button type="button" onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? t('common.cancel') : t('admin.equipment.add')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            {editId ? t('admin.equipment.editTitle') : t('admin.equipment.addTitle')}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('equipment.name')} required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-field"
                required
              />
            </Field>
            <Field label={t('common.type')} required>
              <input
                type="text"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="input-field"
                required
              />
            </Field>
            <Field label={t('equipment.brand')}>
              <input
                type="text"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="input-field"
              />
            </Field>
            <Field label={t('equipment.model')}>
              <input
                type="text"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="input-field"
              />
            </Field>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? t('common.saving') : t('common.save')}
            </button>
            {editId && (
              <button type="button" onClick={resetForm} className="btn-secondary">
                {t('common.cancelEdit')}
              </button>
            )}
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
              <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                {t('equipment.name')}
              </th>
              <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                {t('common.type')}
              </th>
              <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                {t('equipment.brand')}
              </th>
              <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                {t('common.actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {equipment.map((eq) => (
              <tr key={eq.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>
                  {eq.name}
                </td>
                <td className="py-2 px-3">
                  <span className="badge">{eq.type}</span>
                </td>
                <td className="py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                  {eq.brand || '-'}
                </td>
                <td className="py-2 px-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(eq)}
                    className="text-xs"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(eq.id)}
                    className="btn-danger-text text-xs"
                  >
                    {t('common.delete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
