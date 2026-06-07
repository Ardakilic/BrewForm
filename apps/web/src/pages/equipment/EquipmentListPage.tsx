import { useEffect, useState } from 'react';
import { api } from '../../api/client.ts';
import { invalidateStaticCache } from '../../api/static-cache.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';

interface EquipmentItem {
  id: string;
  name: string;
  type: string;
  brand: string | null;
  model: string | null;
  createdAt: string;
}

const log = createLogger('EquipmentListPage');

export function EquipmentListPage() {
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: '', brand: '', model: '' });
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    log.debug({}, 'EquipmentListPage mounted');
    return () => {
      log.debug({}, 'EquipmentListPage unmounted');
    };
  }, []);

  useEffect(() => {
    api.get<EquipmentItem[]>('/equipment').then((data) => {
      setEquipment(data as EquipmentItem[]);
    }).catch(() => {
    }).finally(() => setLoading(false));
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
      const newEq = await api.post<EquipmentItem>('/equipment', {
        name: form.name.trim(),
        type: form.type.trim(),
        brand: form.brand || undefined,
        model: form.model || undefined,
      } as Record<string, unknown>);
      setEquipment((prev) => [...prev, newEq as EquipmentItem]);
      log.debug({ equipmentId: (newEq as EquipmentItem).id }, 'handleCreate completed');
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
    if (!globalThis.confirm(t('common.delete') + '?')) return;
    log.debug({ equipmentId: id }, 'handleDelete started');
    try {
      await api.delete(`/equipment/${id}`);
      setEquipment((prev) => prev.filter((e) => e.id !== id));
      log.debug({ equipmentId: id }, 'handleDelete completed');
      invalidateStaticCache();
    } catch (err) {
      log.error({ err, equipmentId: id }, 'handleDelete failed');
    }
  }

  if (loading) {
    return (
      <div
        className='mx-auto max-w-4xl px-6 py-12 text-center'
        style={{ color: 'var(--text-secondary)' }}
      >
        {t('common.loading')}
      </div>
    );
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
            <div>
              <label
                htmlFor='eq-name'
                className='block text-sm font-medium mb-1'
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('equipment.name')} *
              </label>
              <input
                id='eq-name'
                type='text'
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className='input-field'
                required
              />
            </div>
            <div>
              <label
                htmlFor='eq-type'
                className='block text-sm font-medium mb-1'
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('equipment.type')} *
              </label>
              <input
                id='eq-type'
                type='text'
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className='input-field'
                placeholder='portafilter, basket, tamper...'
                required
              />
            </div>
            <div>
              <label
                htmlFor='eq-brand'
                className='block text-sm font-medium mb-1'
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('equipment.brand')}
              </label>
              <input
                id='eq-brand'
                type='text'
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className='input-field'
              />
            </div>
            <div>
              <label
                htmlFor='eq-model'
                className='block text-sm font-medium mb-1'
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('equipment.model')}
              </label>
              <input
                id='eq-model'
                type='text'
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className='input-field'
              />
            </div>
          </div>
          <button type='submit' className='btn-primary mt-4' disabled={saving}>
            {saving ? t('equipment.adding') : t('equipment.addEquipmentTitle')}
          </button>
        </form>
      )}

      {equipment.length === 0
        ? (
          <div className='text-center py-12' style={{ color: 'var(--text-tertiary)' }}>
            {t('equipment.noEquipment')}
          </div>
        )
        : (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            {equipment.map((eq) => (
              <div key={eq.id} className='card'>
                <div className='flex items-start justify-between'>
                  <div>
                    <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>
                      {eq.name}
                    </h3>
                    <div
                      className='flex gap-2 mt-1 text-xs'
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      <span className='badge'>{eq.type}</span>
                      {eq.brand && <span>{eq.brand}</span>}
                      {eq.model && <span>{eq.model}</span>}
                    </div>
                  </div>
                  <button
                    type='button'
                    onClick={() => handleDelete(eq.id)}
                    className='text-sm'
                    style={{ color: 'var(--error)' }}
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
