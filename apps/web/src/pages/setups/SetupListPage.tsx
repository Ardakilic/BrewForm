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
import type { action, loader } from './SetupListPage.data.ts';

const log = createLogger('SetupListPage');

/**
 * The user's brewing setups: list plus inline create/delete and default-setup display. Setups
 * come from the `/setups` route loader (`SetupListPage.data.ts`); create and delete submit
 * `intent`s to the route action, which revalidates the list, and a failure shows an error
 * toast (the create form keeps its input). A failed load renders the route error state.
 */
export function SetupListPage() {
  const { setups } = useLoaderData<typeof loader>();
  const createFetcher = useFetcher<typeof action>();
  const deleteFetcher = useFetcher<typeof action>();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [brewerDetails, setBrewerDetails] = useState('');
  const [grinder, setGrinder] = useState('');
  const saving = createFetcher.state !== 'idle';
  const { t } = useTranslation();
  const { confirm } = useConfirm();

  useActionFeedback(createFetcher, {
    errorKey: 'setup.error.createFailed',
    onSuccess: () => {
      setName('');
      setBrewerDetails('');
      setGrinder('');
      setShowForm(false);
    },
  });
  useActionFeedback(deleteFetcher, { errorKey: 'setup.error.deleteFailed' });

  useEffect(() => {
    log.debug({}, 'SetupListPage mounted');
    return () => {
      log.debug({}, 'SetupListPage unmounted');
    };
  }, []);

  /** Submits the create form as a `create` intent (a name is required). */
  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    createFetcher.submit({ intent: 'create', name, brewerDetails, grinder }, { method: 'post' });
  }

  /** Asks for confirmation, then submits the `delete` intent. */
  async function handleDelete(id: string) {
    if (
      !(await confirm({
        titleKey: 'common.confirmDelete',
        bodyKey: 'setup.deleteConfirm',
        danger: true,
      }))
    )
      return;
    deleteFetcher.submit({ intent: 'delete', id }, { method: 'post' });
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <SEOHead title={t('setup.title')} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('setup.title')}
        </h1>
        <button type="button" onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? t('common.cancel') : t('setup.newSetup')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card mb-6">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            {t('setup.createSetup')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label={t('setup.name')} required>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                placeholder={t('setup.name.placeholder')}
              />
            </Field>
            <Field label={t('setup.brewerDetails')}>
              <input
                type="text"
                value={brewerDetails}
                onChange={(e) => setBrewerDetails(e.target.value)}
                className="input-field"
                placeholder={t('setup.brewerDetails.placeholder')}
              />
            </Field>
            <Field label={t('recipe.grinder')}>
              <input
                type="text"
                value={grinder}
                onChange={(e) => setGrinder(e.target.value)}
                className="input-field"
                placeholder={t('setup.grinder.placeholder')}
              />
            </Field>
          </div>
          <button type="submit" className="btn-primary mt-4" disabled={saving}>
            {saving ? t('setup.creating') : t('setup.createSetup')}
          </button>
        </form>
      )}

      {setups.length === 0 ? (
        <EmptyState message={t('setup.noSetups')} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {setups.map((setup) => (
            <OwnedItemCard
              key={setup.id}
              title={
                <>
                  {setup.name}
                  {setup.isDefault && (
                    <span className="badge ml-2 text-xs">{t('setup.default')}</span>
                  )}
                </>
              }
              subtitle={
                <>
                  {setup.brewerDetails && (
                    <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                      {setup.brewerDetails}
                    </p>
                  )}
                  {setup.grinder && (
                    <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                      {t('recipe.grinder')}: {setup.grinder}
                    </p>
                  )}
                </>
              }
              onDelete={() => handleDelete(setup.id)}
              deleteLabel={t('common.delete')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
