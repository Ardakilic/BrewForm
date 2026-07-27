import { useEffect, useState } from 'react';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { Field } from '../../components/form/Field.tsx';
import { OwnedItemCard } from '../../components/ui/OwnedItemCard.tsx';
import { EmptyState } from '../../components/ui/EmptyState.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { LoadingState } from '../../components/ui/LoadingState.tsx';
import { useToast } from '../../components/ui/Toast.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useConfirm } from '../../components/ui/Modal.tsx';
import { setupApi } from '../../api/index.ts';
import type { SetupOutput } from '@brewform/shared/schemas';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('SetupListPage');

/** The user's brewing setups: list plus inline create/delete and default-setup handling. */
export function SetupListPage() {
  const [setups, setSetups] = useState<SetupOutput[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [brewerDetails, setBrewerDetails] = useState('');
  const [grinder, setGrinder] = useState('');
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const toast = useToast();

  useEffect(() => {
    log.debug({}, 'SetupListPage mounted');
    return () => {
      log.debug({}, 'SetupListPage unmounted');
    };
  }, []);

  useEffect(() => {
    setupApi.list().then((data) => {
      setSetups(data);
      setStatus('ready');
    }).catch((err) => {
      log.error({ err }, 'setup list fetch failed');
      setStatus('error');
    });
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const newSetup = await setupApi.create({
        name: name.trim(),
        isDefault: false,
        brewerDetails: brewerDetails || undefined,
        grinder: grinder || undefined,
      });
      setSetups((prev) => [...prev, newSetup]);
      setName('');
      setBrewerDetails('');
      setGrinder('');
      setShowForm(false);
    } catch (err) {
      log.error({ err }, 'handleCreate failed');
      toast.error('setup.error.createFailed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (
      !await confirm({
        titleKey: 'common.confirmDelete',
        bodyKey: 'setup.deleteConfirm',
        danger: true,
      })
    ) return;
    try {
      await setupApi.delete(id);
      setSetups((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      log.error({ err, setupId: id }, 'handleDelete failed');
      toast.error('setup.error.deleteFailed');
    }
  }

  if (status === 'loading') {
    return <LoadingState className='mx-auto max-w-4xl px-6' />;
  }

  return (
    <div className='mx-auto max-w-4xl px-6 py-8'>
      <SEOHead title={t('setup.title')} />
      <div className='flex items-center justify-between mb-6'>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {t('setup.title')}
        </h1>
        <button type='button' onClick={() => setShowForm(!showForm)} className='btn-primary'>
          {showForm ? t('common.cancel') : t('setup.newSetup')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className='card mb-6'>
          <h2 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
            {t('setup.createSetup')}
          </h2>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            <Field label={t('setup.name')} required>
              <input
                type='text'
                value={name}
                onChange={(e) => setName(e.target.value)}
                className='input-field'
                placeholder={t('setup.name.placeholder')}
              />
            </Field>
            <Field label={t('setup.brewerDetails')}>
              <input
                type='text'
                value={brewerDetails}
                onChange={(e) => setBrewerDetails(e.target.value)}
                className='input-field'
                placeholder={t('setup.brewerDetails.placeholder')}
              />
            </Field>
            <Field label={t('recipe.grinder')}>
              <input
                type='text'
                value={grinder}
                onChange={(e) => setGrinder(e.target.value)}
                className='input-field'
                placeholder={t('setup.grinder.placeholder')}
              />
            </Field>
          </div>
          <button type='submit' className='btn-primary mt-4' disabled={saving}>
            {saving ? t('setup.creating') : t('setup.createSetup')}
          </button>
        </form>
      )}

      {status === 'error'
        ? <ErrorState message={t('setup.error.loadFailed')} />
        : setups.length === 0
        ? <EmptyState message={t('setup.noSetups')} />
        : (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            {setups.map((setup) => (
              <OwnedItemCard
                key={setup.id}
                title={
                  <>
                    {setup.name}
                    {setup.isDefault && (
                      <span className='badge ml-2 text-xs'>{t('setup.default')}</span>
                    )}
                  </>
                }
                subtitle={
                  <>
                    {setup.brewerDetails && (
                      <p className='text-sm mt-1' style={{ color: 'var(--text-secondary)' }}>
                        {setup.brewerDetails}
                      </p>
                    )}
                    {setup.grinder && (
                      <p className='text-sm' style={{ color: 'var(--text-tertiary)' }}>
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
