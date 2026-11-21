import type { VendorOutput } from '@brewform/shared/schemas';
import { useEffect, useState } from 'react';
import { useFetcher, useLoaderData } from 'react-router';
import { Field } from '../../components/form/Field.tsx';
import { useConfirm } from '../../components/ui/Modal.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import { createLogger } from '../../utils/logger.ts';
import type { action, loader } from './AdminVendorsPage.data.ts';

const log = createLogger('AdminVendorsPage');

/**
 * Admin page: vendor CRUD with an inline form. Vendors come from the `/admin/vendors` route
 * loader; create, update and delete submit `intent`s to the route action
 * (`AdminVendorsPage.data.ts`) and toast on `{ ok: false }`. The loader revalidates after
 * each submission, so the table always shows the saved vendors.
 */
export function AdminVendorsPage() {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const { vendors } = useLoaderData<typeof loader>();
  const saveFetcher = useFetcher<typeof action>();
  const deleteFetcher = useFetcher<typeof action>();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', website: '', description: '' });
  const saving = saveFetcher.state !== 'idle';

  useActionFeedback(saveFetcher, { errorKey: 'admin.vendors.saveError', onSuccess: resetForm });
  useActionFeedback(deleteFetcher, { errorKey: 'admin.vendors.deleteFailed' });

  useEffect(() => {
    log.debug({}, 'AdminVendorsPage mounted');
    return () => {
      log.debug({}, 'AdminVendorsPage unmounted');
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
        bodyKey: 'admin.vendors.deleteConfirm',
        danger: true,
      }))
    )
      return;
    deleteFetcher.submit({ intent: 'delete', id }, { method: 'post' });
  }

  /** Opens the form pre-filled with `vendor` for editing. */
  function startEdit(vendor: VendorOutput) {
    setEditId(vendor.id);
    setForm({
      name: vendor.name,
      website: vendor.website || '',
      description: vendor.description || '',
    });
    setShowForm(true);
  }

  /** Clears and closes the form. */
  function resetForm() {
    setForm({ name: '', website: '', description: '' });
    setEditId(null);
    setShowForm(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('admin.vendors.management')}
        </h1>
        <button type="button" onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? t('common.cancel') : t('admin.vendors.add')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            {editId ? t('admin.vendors.editTitle') : t('admin.vendors.addTitle')}
          </h2>
          <div className="space-y-3">
            <Field label={t('common.name')}>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-field"
                required
              />
            </Field>
            <Field label={t('admin.vendors.website')}>
              <input
                type="url"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                className="input-field"
              />
            </Field>
            <Field label={t('common.description')}>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input-field"
                rows={3}
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
                {t('common.name')}
              </th>
              <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                {t('admin.vendors.website')}
              </th>
              <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                {t('common.actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((vendor) => (
              <tr key={vendor.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>
                  {vendor.name}
                </td>
                <td className="py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
                  {vendor.website || '-'}
                </td>
                <td className="py-2 px-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(vendor)}
                    className="text-xs"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(vendor.id)}
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
