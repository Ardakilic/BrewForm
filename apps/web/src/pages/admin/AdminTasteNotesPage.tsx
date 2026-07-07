import { useEffect, useState } from 'react';
import { api } from '../../api/client.ts';
import { invalidateStaticCache } from '../../api/static-cache.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';
import type { TasteNoteOutput } from '@brewform/shared/schemas';

const log = createLogger('AdminTasteNotesPage');

/** Admin page: taste-note hierarchy management (create/delete); invalidates the static cache on changes. */
export function AdminTasteNotesPage() {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<TasteNoteOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', parentId: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    log.debug({}, 'AdminTasteNotesPage mounted');
    return () => {
      log.debug({}, 'AdminTasteNotesPage unmounted');
    };
  }, []);

  useEffect(() => {
    api.get<TasteNoteOutput[]>('/taste-notes/flat').then((data) => {
      setNotes(data as TasteNoteOutput[]);
    }).catch(() => {
    }).finally(() => setLoading(false));
  }, []);

  /**
   * POST `/admin/taste-notes`, append the created item to local state, and
   * invalidate the static cache so the next loader run re-fetches.
   */
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || saving) return;
    setSaving(true);
    log.debug({}, 'handleCreate started');
    try {
      const created = await api.post<TasteNoteOutput>('/admin/taste-notes', {
        name: form.name.trim(),
        parentId: form.parentId || undefined,
      } as Record<string, unknown>);
      setNotes((prev) => [...prev, created as TasteNoteOutput]);
      log.debug({ tasteNoteId: (created as TasteNoteOutput).id }, 'handleCreate completed');
      setForm({ name: '', parentId: '' });
      setShowForm(false);
      invalidateStaticCache();
    } catch (err) {
      log.error({ err, name: form.name, parentId: form.parentId }, 'handleCreate failed');
    } finally {
      setSaving(false);
    }
  }

  /**
   * DELETE `/admin/taste-notes/:id`, remove the item from local state, and
   * invalidate the static cache so the next loader run re-fetches.
   */
  async function handleDelete(id: string) {
    if (!globalThis.confirm(t('admin.tasteNotes.deleteConfirm'))) return;
    log.debug({ tasteNoteId: id }, 'handleDelete started');
    try {
      await api.delete(`/admin/taste-notes/${id}`);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      log.debug({ tasteNoteId: id }, 'handleDelete completed');
      invalidateStaticCache();
    } catch (err) {
      log.error({ err, tasteNoteId: id }, 'handleDelete failed');
    }
  }

  return (
    <div>
      <div className='flex items-center justify-between mb-6'>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {t('admin.tasteNotes')}
        </h1>
        <button type='button' onClick={() => setShowForm(!showForm)} className='btn-primary'>
          {showForm ? t('common.cancel') : t('admin.tasteNotes.add')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className='card mb-6'>
          <h2 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
            {t('admin.tasteNotes.addTitle')}
          </h2>
          <div className='space-y-3'>
            <div>
              <label
                htmlFor='tn-name'
                className='block text-sm font-medium mb-1'
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('common.name')} *
              </label>
              <input
                id='tn-name'
                type='text'
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className='input-field'
                required
              />
            </div>
            <div>
              <label
                htmlFor='tn-parent'
                className='block text-sm font-medium mb-1'
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('admin.tasteNotes.parent')}
              </label>
              <select
                id='tn-parent'
                value={form.parentId}
                onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                className='input-field'
              >
                <option value=''>{t('admin.tasteNotes.noneTopLevel')}</option>
                {notes.filter((n) => n.depth === 0).map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button type='submit' className='btn-primary mt-4' disabled={saving}>
            {saving ? t('common.creating') : t('common.create')}
          </button>
          <p className='mt-2 text-xs' style={{ color: 'var(--warning)' }}>
            {t('admin.tasteNotes.cacheWarning')}
          </p>
        </form>
      )}

      {loading
        ? <div style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</div>
        : (
          <div className='space-y-1'>
            {notes.map((note) => (
              <div
                key={note.id}
                className='flex items-center justify-between py-2 px-3 rounded hover:opacity-80'
                style={{ paddingLeft: `${note.depth * 1.5 + 0.75}rem` }}
              >
                <span style={{ color: 'var(--text-primary)' }}>{note.name}</span>
                <button
                  type='button'
                  onClick={() => handleDelete(note.id)}
                  className='text-xs'
                  style={{ color: 'var(--error)' }}
                >
                  {t('common.delete')}
                </button>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
