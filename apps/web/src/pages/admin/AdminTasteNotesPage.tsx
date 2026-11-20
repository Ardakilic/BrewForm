import { useEffect, useState } from 'react';
import { useFetcher, useLoaderData } from 'react-router';
import { Field } from '../../components/form/Field.tsx';
import { useConfirm } from '../../components/ui/Modal.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import { createLogger } from '../../utils/logger.ts';
import type { action, loader } from './AdminTasteNotesPage.data.ts';

const log = createLogger('AdminTasteNotesPage');

/**
 * Admin page: taste-note hierarchy management (create/delete). Notes come from the
 * `/admin/taste-notes` route loader; create and delete submit `intent`s to the route action
 * (`AdminTasteNotesPage.data.ts`), which invalidates the static cache on success. Failures
 * toast (`admin.tasteNotes.createError` / `admin.tasteNotes.deleteFailed`).
 */
export function AdminTasteNotesPage() {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const { notes } = useLoaderData<typeof loader>();
  const createFetcher = useFetcher<typeof action>();
  const deleteFetcher = useFetcher<typeof action>();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', parentId: '' });
  const saving = createFetcher.state !== 'idle';

  useActionFeedback(createFetcher, {
    errorKey: 'admin.tasteNotes.createError',
    onSuccess: () => {
      setForm({ name: '', parentId: '' });
      setShowForm(false);
    },
  });
  useActionFeedback(deleteFetcher, { errorKey: 'admin.tasteNotes.deleteFailed' });

  useEffect(() => {
    log.debug({}, 'AdminTasteNotesPage mounted');
    return () => {
      log.debug({}, 'AdminTasteNotesPage unmounted');
    };
  }, []);

  /** Submits the `create` intent with the trimmed name and optional parent. */
  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || saving) return;
    createFetcher.submit({ intent: 'create', ...form }, { method: 'post' });
  }

  /** Asks for confirmation, then submits the `delete` intent. */
  async function handleDelete(id: string) {
    if (
      !(await confirm({
        titleKey: 'common.confirmDelete',
        bodyKey: 'admin.tasteNotes.deleteConfirm',
        danger: true,
      }))
    )
      return;
    deleteFetcher.submit({ intent: 'delete', id }, { method: 'post' });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('admin.tasteNotes')}
        </h1>
        <button type="button" onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? t('common.cancel') : t('admin.tasteNotes.add')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card mb-6">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            {t('admin.tasteNotes.addTitle')}
          </h2>
          <div className="space-y-3">
            <Field label={`${t('common.name')} *`}>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-field"
                required
              />
            </Field>
            <Field label={t('admin.tasteNotes.parent')}>
              <select
                value={form.parentId}
                onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                className="input-field"
              >
                <option value="">{t('admin.tasteNotes.noneTopLevel')}</option>
                {notes
                  .filter((n) => n.depth === 0)
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <button type="submit" className="btn-primary mt-4" disabled={saving}>
            {saving ? t('common.creating') : t('common.create')}
          </button>
          <p className="mt-2 text-xs" style={{ color: 'var(--warning)' }}>
            {t('admin.tasteNotes.cacheWarning')}
          </p>
        </form>
      )}

      <div className="space-y-1">
        {notes.map((note) => (
          <div
            key={note.id}
            className="flex items-center justify-between py-2 px-3 rounded hover:opacity-80"
            style={{ paddingLeft: `${note.depth * 1.5 + 0.75}rem` }}
          >
            <span style={{ color: 'var(--text-primary)' }}>{note.name}</span>
            <button
              type="button"
              onClick={() => handleDelete(note.id)}
              className="btn-danger-text text-xs"
            >
              {t('common.delete')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
