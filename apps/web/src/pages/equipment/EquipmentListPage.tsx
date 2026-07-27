import { useEffect, useState } from 'react';
import { equipmentApi } from '../../api/index.ts';
import { invalidateStaticCache } from '../../api/static-cache.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { Field } from '../../components/form/Field.tsx';
import { OwnedItemCard } from '../../components/ui/OwnedItemCard.tsx';
import { EmptyState } from '../../components/ui/EmptyState.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { LoadingState } from '../../components/ui/LoadingState.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useConfirm } from '../../components/ui/Modal.tsx';
import type { EquipmentOutput } from '@brewform/shared/schemas';
import type { EquipmentType } from '@brewform/shared/types';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('EquipmentListPage');

/**
 * The user's equipment list with inline create/delete; changes
 * invalidate the static cache so loaders re-fetch fresh data.
 */
export function EquipmentListPage() {
  const [equipment, setEquipment] = useState<EquipmentOutput[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: '', brand: '', model: '' });
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();
  const { confirm } = useConfirm();

  useEffect(() => {
    log.debug({}, 'EquipmentListPage mounted');
    return () => {
      log.debug({}, 'EquipmentListPage unmounted');
    };
  }, []);

  useEffect(() => {
    equipmentApi.list().then((data) => {
      setEquipment(data);
      setStatus('ready');
    }).catch((err) => {
      log.error({ err }, 'equipment list fetch failed');
      setStatus('error');
    });
  }, []);

  /**
   * POST `/equipment`, append the created item to local state, and
   * invalidate the static cache so the next loader run re-fetches.
   */
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.type.trim() || saving) return;
    setSaving(true);
    log.debug({}, 'handleCreate started');
    try {
      const newEq = await equipmentApi.create({
        name: form.name.trim(),
        type: form.type.trim() as EquipmentType,
        brand: form.brand || undefined,
        model: form.model || undefined,
      });
      setEquipment((prev) => [...prev, newEq]);
      log.debug({ equipmentId: newEq.id }, 'handleCreate completed');
      setForm({ name: '', type: '', brand: '', model: '' });
      setShowForm(false);
      invalidateStaticCache();
    } catch (err) {
      log.error({ err, name: form.name, type: form.type }, 'handleCreate failed');
    } finally {
      setSaving(false);
    }
  }

  /**
   * DELETE `/equipment/:id`, remove the item from local state, and
   * invalidate the static cache so the next loader run re-fetches.
   */
  async function handleDelete(id: string) {
    if (
      !await confirm({
        titleKey: 'common.confirmDelete',
        bodyKey: 'equipment.deleteConfirm',
        danger: true,
      })
    ) return;
    log.debug({ equipmentId: id }, 'handleDelete started');
    try {
      await equipmentApi.delete(id);
      setEquipment((prev) => prev.filter((e) => e.id !== id));
      log.debug({ equipmentId: id }, 'handleDelete completed');
      invalidateStaticCache();
    } catch (err) {
      log.error({ err, equipmentId: id }, 'handleDelete failed');
    }
  }

  if (status === 'loading') {
    return <LoadingState className='mx-auto max-w-4xl px-6' />;
  }

  return (
    <div className='mx-auto max-w-4xl px-6 py-8'>
      <SEOHead title={t('equipment.title')} />
      <div className='flex items-center justify-between mb-6'>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {t('equipment.title')}
        </h1>
        <button type='button' onClick={() => setShowForm(!showForm)} className='btn-primary'>
          {showForm ? t('common.cancel') : t('equipment.addEquipment')}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className='card mb-6'>
          <h2 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
            {t('equipment.addEquipmentTitle')}
          </h2>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <Field label={t('equipment.name')} required>
              <input
                type='text'
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className='input-field'
                required
              />
            </Field>
            <Field label={t('equipment.type')} required>
              <input
                type='text'
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className='input-field'
                placeholder={t('equipment.type.placeholder')}
                required
              />
            </Field>
            <Field label={t('equipment.brand')}>
              <input
                type='text'
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className='input-field'
              />
            </Field>
            <Field label={t('equipment.model')}>
              <input
                type='text'
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className='input-field'
              />
            </Field>
          </div>
          <button type='submit' className='btn-primary mt-4' disabled={saving}>
            {saving ? t('equipment.adding') : t('equipment.addEquipmentTitle')}
          </button>
        </form>
      )}

      {status === 'error'
        ? <ErrorState message={t('equipment.error.loadFailed')} />
        : equipment.length === 0
        ? <EmptyState message={t('equipment.noEquipment')} />
        : (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            {equipment.map((eq) => (
              <OwnedItemCard
                key={eq.id}
                title={eq.name}
                meta={
                  <>
                    <span className='badge'>{eq.type}</span>
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
