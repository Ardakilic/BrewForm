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
import { beanApi } from '../../api/index.ts';
import type { BeanOutput } from '@brewform/shared/schemas';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('BeanListPage');

/** The user's saved beans: list plus inline create/delete form. */
export function BeanListPage() {
  const [beans, setBeans] = useState<BeanOutput[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    brand: '',
    origin: '',
    processing: '',
    roastLevel: '',
  });
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const toast = useToast();

  useEffect(() => {
    log.debug({}, 'BeanListPage mounted');
    return () => {
      log.debug({}, 'BeanListPage unmounted');
    };
  }, []);

  useEffect(() => {
    beanApi.list().then((data) => {
      setBeans(data);
      setStatus('ready');
    }).catch((err) => {
      log.error({ err }, 'bean list fetch failed');
      setStatus('error');
    });
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const newBean = await beanApi.create({
        name: form.name,
        brand: form.brand || undefined,
        origin: form.origin || undefined,
        processing: form.processing || undefined,
        roastLevel: form.roastLevel || undefined,
      });
      setBeans((prev) => [...prev, newBean]);
      setForm({ name: '', brand: '', origin: '', processing: '', roastLevel: '' });
      setShowForm(false);
    } catch (err) {
      log.error({ err }, 'handleCreate failed');
      toast.error('bean.error.createFailed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (
      !await confirm({
        titleKey: 'common.confirmDelete',
        bodyKey: 'bean.deleteConfirm',
        danger: true,
      })
    ) return;
    try {
      await beanApi.delete(id);
      setBeans((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      log.error({ err, beanId: id }, 'handleDelete failed');
      toast.error('bean.error.deleteFailed');
    }
  }

  if (status === 'loading') {
    return <LoadingState className='mx-auto max-w-4xl px-6' />;
  }

  return (
    <div className='mx-auto max-w-4xl px-6 py-8'>
      <SEOHead title={t('bean.title')} />
      <div className='flex items-center justify-between mb-6'>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {t('bean.title')}
        </h1>
        <button type='button' onClick={() => setShowForm(!showForm)} className='btn-primary'>
          {showForm ? t('common.cancel') : t('bean.addBean')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className='card mb-6'>
          <h2 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
            {t('bean.addBeanTitle')}
          </h2>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <Field label={t('common.name')}>
              <input
                type='text'
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className='input-field'
              />
            </Field>
            <Field label={t('bean.brand')}>
              <input
                type='text'
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className='input-field'
              />
            </Field>
            <Field label={t('bean.origin')}>
              <input
                type='text'
                value={form.origin}
                onChange={(e) => setForm({ ...form, origin: e.target.value })}
                className='input-field'
                placeholder={t('bean.origin.placeholder')}
              />
            </Field>
            <Field label={t('bean.processing')}>
              <input
                type='text'
                value={form.processing}
                onChange={(e) => setForm({ ...form, processing: e.target.value })}
                className='input-field'
                placeholder={t('bean.processing.placeholder')}
              />
            </Field>
            <Field label={t('bean.roastLevel')}>
              <input
                type='text'
                value={form.roastLevel}
                onChange={(e) => setForm({ ...form, roastLevel: e.target.value })}
                className='input-field'
                placeholder={t('bean.roastLevel.placeholder')}
              />
            </Field>
          </div>
          <button type='submit' className='btn-primary mt-4' disabled={saving}>
            {saving ? t('bean.adding') : t('bean.addBeanTitle')}
          </button>
        </form>
      )}

      {status === 'error'
        ? <ErrorState message={t('bean.error.loadFailed')} />
        : beans.length === 0
        ? <EmptyState message={t('bean.noBeansYet')} />
        : (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            {beans.map((bean) => (
              <OwnedItemCard
                key={bean.id}
                title={bean.name || t('bean.unnamed')}
                subtitle={bean.brand
                  ? (
                    <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                      {bean.brand}
                    </p>
                  )
                  : undefined}
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
