import { useEffect, useState } from 'react';
import { useFetcher, useLoaderData } from 'react-router';
import { Field } from '../../components/form/Field.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { EmptyState } from '../../components/ui/EmptyState.tsx';
import { useConfirm } from '../../components/ui/Modal.tsx';
import { OwnedItemCard } from '../../components/ui/OwnedItemCard.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import { createLogger } from '../../utils/logger.ts';
import type { action, loader } from './EquipmentListPage.data.ts';

const log = createLogger('EquipmentListPage');

/** The empty create-form state. */
const EMPTY_FORM = { name: '', type: '', brand: '', model: '' };

/**
 * The user's equipment list with inline create/delete. The list comes from the `/equipment`
 * route loader (`EquipmentListPage.data.ts`, through the static cache); create and delete
 * submit `intent`s to the route action, which invalidates the static cache on success so the
 * revalidated list (and other tabs) re-fetch. A failed create or delete shows an error toast;
 * a failed load renders the route error state.
 */
export function EquipmentListPage() {
  const { equipment } = useLoaderData<typeof loader>();
  const createFetcher = useFetcher<typeof action>();
  const deleteFetcher = useFetcher<typeof action>();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const saving = createFetcher.state !== 'idle';
  const { t } = useTranslation();
  const { confirm } = useConfirm();

  useActionFeedback(createFetcher, {
    errorKey: 'equipment.error.createFailed',
    onSuccess: () => {
      setForm(EMPTY_FORM);
      setShowForm(false);
    },
  });
  useActionFeedback(deleteFetcher, { errorKey: 'equipment.error.deleteFailed' });

  useEffect(() => {
    log.debug({}, 'EquipmentListPage mounted');
    return () => {
      log.debug({}, 'EquipmentListPage unmounted');
    };
  }, []);

  /** Submits the create form as a `create` intent (name and type are required). */
  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.type.trim() || saving) return;
    createFetcher.submit({ intent: 'create', ...form }, { method: 'post' });
  }

  /** Asks for confirmation, then submits the `delete` intent. */
  async function handleDelete(id: string) {
    if (
      !(await confirm({
        titleKey: 'common.confirmDelete',
        bodyKey: 'equipment.deleteConfirm',
        danger: true,
      }))
    )
      return;
    deleteFetcher.submit({ intent: 'delete', id }, { method: 'post' });
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <SEOHead title={t('equipment.title')} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('equipment.title')}
        </h1>
        <button type="button" onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? t('common.cancel') : t('equipment.addEquipment')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card mb-6">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            {t('equipment.addEquipmentTitle')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label={t('equipment.name')} required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-field"
                required
              />
            </Field>
            <Field label={t('equipment.type')} required>
              <input
                type="text"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="input-field"
                placeholder={t('equipment.type.placeholder')}
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
          <button type="submit" className="btn-primary mt-4" disabled={saving}>
            {saving ? t('equipment.adding') : t('equipment.addEquipmentTitle')}
          </button>
        </form>
      )}

      {equipment.length === 0 ? (
        <EmptyState message={t('equipment.noEquipment')} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {equipment.map((eq) => (
            <OwnedItemCard
              key={eq.id}
              title={eq.name}
              meta={
                <>
                  <span className="badge">{eq.type}</span>
                  {eq.brand && <span>{eq.brand}</span>}
                  {eq.model && <span>{eq.model}</span>}
                </>
              }
              onDelete={() => handleDelete(eq.id)}
              deleteLabel={t('common.delete')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
