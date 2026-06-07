import { useEffect, useState } from 'react';
import { api } from '../../api/client.ts';
import { invalidateStaticCache } from '../../api/static-cache.ts';
import { createLogger } from '../../utils/logger.ts';

interface TasteNote {
  id: string;
  name: string;
  depth: number;
  parentId: string | null;
}

const log = createLogger('AdminTasteNotesPage');

export function AdminTasteNotesPage() {
  const [notes, setNotes] = useState<TasteNote[]>([]);
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
    api.get<TasteNote[]>('/taste-notes/flat').then((data) => {
      setNotes(data as TasteNote[]);
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
      const created = await api.post<TasteNote>('/admin/taste-notes', {
        name: form.name.trim(),
        parentId: form.parentId || undefined,
      } as Record<string, unknown>);
      setNotes((prev) => [...prev, created as TasteNote]);
      log.debug({ tasteNoteId: (created as TasteNote).id }, 'handleCreate completed');
      setForm({ name: '', parentId: '' });
      setShowForm(false);
      invalidateStaticCache();
    } catch {
    } finally {
      setSaving(false);
    }
  }

  /**
   * DELETE `/admin/taste-notes/:id`, remove the item from local state, and
   * invalidate the static cache so the next loader run re-fetches.
   */
  async function handleDelete(id: string) {
    if (!globalThis.confirm('Delete this taste note?')) return;
    log.debug({ tasteNoteId: id }, 'handleDelete started');
    try {
      await api.delete(`/admin/taste-notes/${id}`);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      log.debug({ tasteNoteId: id }, 'handleDelete completed');
      invalidateStaticCache();
    } catch {
    }
  }

  return (
    <div>
      <div className='flex items-center justify-between mb-6'>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>Taste Notes</h1>
        <button type='button' onClick={() => setShowForm(!showForm)} className='btn-primary'>
          {showForm ? 'Cancel' : '+ Add Taste Note'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className='card mb-6'>
          <h2 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
            Add Taste Note
          </h2>
          <div className='space-y-3'>
            <div>
              <label
                htmlFor='tn-name'
                className='block text-sm font-medium mb-1'
                style={{ color: 'var(--text-secondary)' }}
              >
                Name *
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
                Parent (optional)
              </label>
              <select
                id='tn-parent'
                value={form.parentId}
                onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                className='input-field'
              >
                <option value=''>None (top-level)</option>
                {notes.filter((n) => n.depth === 0).map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button type='submit' className='btn-primary mt-4' disabled={saving}>
            {saving ? 'Creating...' : 'Create'}
          </button>
          <p className='mt-2 text-xs' style={{ color: 'var(--warning)' }}>
            Note: Creating taste notes will flush the taste note cache.
          </p>
        </form>
      )}

      {loading
        ? <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
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
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
