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
import type { action, loader } from './BeanListPage.data.ts';

const log = createLogger('BeanListPage');

/** The empty create-form state. */
const EMPTY_FORM = { name: '', brand: '', origin: '', processing: '', roastLevel: '' };

/**
 * The user's saved beans: list plus inline create/delete form. Beans come from the `/beans`
 * route loader (`BeanListPage.data.ts`); create and delete submit `intent`s to the route
 * action, which revalidates the list, and a failure shows an error toast (the create form
 * keeps its input). A failed load renders the route error state.
 */
export function BeanListPage() {
  const { beans } = useLoaderData<typeof loader>();
  const createFetcher = useFetcher<typeof action>();
  const deleteFetcher = useFetcher<typeof action>();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const saving = createFetcher.state !== 'idle';
  const { t } = useTranslation();
  const { confirm } = useConfirm();

  useActionFeedback(createFetcher, {
    errorKey: 'bean.error.createFailed',
    onSuccess: () => {
      setForm(EMPTY_FORM);
      setShowForm(false);
    },
  });
  useActionFeedback(deleteFetcher, { errorKey: 'bean.error.deleteFailed' });

  useEffect(() => {
    log.debug({}, 'BeanListPage mounted');
    return () => {
      log.debug({}, 'BeanListPage unmounted');
    };
  }, []);

  /** Submits the create form as a `create` intent. */
  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    createFetcher.submit({ intent: 'create', ...form }, { method: 'post' });
  }

  /** Asks for confirmation, then submits the `delete` intent. */
  async function handleDelete(id: string) {
    if (
      !(await confirm({
        titleKey: 'common.confirmDelete',
        bodyKey: 'bean.deleteConfirm',
        danger: true,
      }))
    )
      return;
    deleteFetcher.submit({ intent: 'delete', id }, { method: 'post' });
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <SEOHead title={t('bean.title')} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('bean.title')}
        </h1>
        <button type="button" onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? t('common.cancel') : t('bean.addBean')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card mb-6">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            {t('bean.addBeanTitle')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label={t('common.name')}>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-field"
              />
            </Field>
            <Field label={t('bean.brand')}>
              <input
                type="text"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="input-field"
              />
            </Field>
            <Field label={t('bean.origin')}>
              <input
                type="text"
                value={form.origin}
                onChange={(e) => setForm({ ...form, origin: e.target.value })}
                className="input-field"
                placeholder={t('bean.origin.placeholder')}
              />
            </Field>
            <Field label={t('bean.processing')}>
              <input
                type="text"
                value={form.processing}
                onChange={(e) => setForm({ ...form, processing: e.target.value })}
                className="input-field"
                placeholder={t('bean.processing.placeholder')}
              />
            </Field>
            <Field label={t('bean.roastLevel')}>
              <input
                type="text"
                value={form.roastLevel}
                onChange={(e) => setForm({ ...form, roastLevel: e.target.value })}
                className="input-field"
                placeholder={t('bean.roastLevel.placeholder')}
              />
            </Field>
          </div>
          <button type="submit" className="btn-primary mt-4" disabled={saving}>
            {saving ? t('bean.adding') : t('bean.addBeanTitle')}
          </button>
        </form>
      )}

      {beans.length === 0 ? (
        <EmptyState message={t('bean.noBeansYet')} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {beans.map((bean) => (
            <OwnedItemCard
              key={bean.id}
              title={bean.name || t('bean.unnamed')}
              subtitle={
                bean.brand ? (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {bean.brand}
                  </p>
                ) : undefined
              }
              meta={
                <>
                  {bean.origin && <span>{bean.origin}</span>}
                  {bean.processing && <span>• {bean.processing}</span>}
                  {bean.roastLevel && <span>• {bean.roastLevel}</span>}
                </>
              }
              onDelete={() => handleDelete(bean.id)}
              deleteLabel={t('common.delete')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
