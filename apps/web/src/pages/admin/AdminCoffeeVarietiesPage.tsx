import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useConfirm } from '../../components/ui/Modal.tsx';
import { LoadingState } from '../../components/ui/LoadingState.tsx';
import { useToast } from '../../components/ui/Toast.tsx';
import { PaginationControls } from '../../components/ui/PaginationControls.tsx';
import { Field } from '../../components/form/Field.tsx';
import { createLogger } from '../../utils/logger.ts';
import type { CoffeeVarietyOutput, CoffeeVarietyUpdate } from '@brewform/shared/schemas';

const log = createLogger('AdminCoffeeVarietiesPage');

type Category = 'variety' | 'processing' | 'market_name';

interface FormData {
  name: string;
  category: Category;
  species: string;
  origin: string;
  spread: string;
  altitudeRangeM: string;
  cupProfile: string;
  body: string;
  acidity: string;
  caffeinePct: string;
  processingCompatibility: string;
  diseaseResistance: string;
  yield: string;
  plantSize: string;
  notes: string;
  subVarieties: string;
  fermentation: string;
  dryingTimeDays: string;
  dryingMethod: string;
  mucilageRetentionPct: string;
  priceRange: string;
  processing: string;
  typeLabel: string;
  notableFarms: string;
  notableRegions: string;
  regionalVariants: string;
  globalSharePct: string;
}

const emptyForm: FormData = {
  name: '',
  category: 'variety',
  species: '',
  origin: '',
  spread: '',
  altitudeRangeM: '',
  cupProfile: '',
  body: '',
  acidity: '',
  caffeinePct: '',
  processingCompatibility: '',
  diseaseResistance: '',
  yield: '',
  plantSize: '',
  notes: '',
  subVarieties: '',
  fermentation: '',
  dryingTimeDays: '',
  dryingMethod: '',
  mucilageRetentionPct: '',
  priceRange: '',
  processing: '',
  typeLabel: '',
  notableFarms: '',
  notableRegions: '',
  regionalVariants: '',
  globalSharePct: '',
};

const CATEGORY_BADGE_COLORS: Record<Category, string> = {
  variety: 'var(--accent-primary)',
  processing: 'var(--accent-secondary)',
  market_name: 'var(--accent-tertiary)',
};

const CATEGORY_LABELS: Record<Category, string> = {
  variety: 'admin.coffeeVarieties.catVariety',
  processing: 'admin.coffeeVarieties.catProcessing',
  market_name: 'admin.coffeeVarieties.catMarketName',
};
const DEFAULT_CATEGORY: Category = 'variety';

/**
 * Coerce an arbitrary API string into the page's `Category` union.
 * `CoffeeVarietyOutputSchema.category` is typed as a plain string (not an
 * enum), so an unknown value must not index `CATEGORY_BADGE_COLORS` /
 * `CATEGORY_LABELS` — fall back to `DEFAULT_CATEGORY` instead.
 */
function toCategory(value: string | undefined | null): Category {
  switch (value) {
    case 'variety':
    case 'processing':
    case 'market_name':
      return value;
    default:
      return DEFAULT_CATEGORY;
  }
}

function arrToString(arr: string[] | null | undefined): string {
  if (!arr || arr.length === 0) return '';
  return arr.join(', ');
}

function stringToArr(s: string): string[] {
  const trimmed = s.trim();
  if (!trimmed) return [];
  return trimmed.split(',').map((v) => v.trim()).filter(Boolean);
}

/** Admin page: paginated, searchable coffee-variety CRUD with category filter and inline form. */
export function AdminCoffeeVarietiesPage() {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const toast = useToast();

  const categoryLabel = useCallback((cat: Category): string => {
    return t(CATEGORY_LABELS[cat]);
  }, [t]);
  const [items, setItems] = useState<CoffeeVarietyOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    log.debug({}, 'AdminCoffeeVarietiesPage mounted');
    return () => {
      log.debug({}, 'AdminCoffeeVarietiesPage unmounted');
    };
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('perPage', '20');
      if (categoryFilter) params.set('category', categoryFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await api.getWithMeta<
        { success: boolean; data: CoffeeVarietyOutput[]; total: number }
      >(
        `/admin/coffee-varieties?${params.toString()}`,
      );
      setItems(res.data);
      setTotal(res.total);
    } catch (err) {
      log.error({ err }, 'AdminCoffeeVarietiesPage fetchData failed');
    } finally {
      setLoading(false);
    }
  }, [page, categoryFilter, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);

    const arrayFields = [
      'processingCompatibility',
      'subVarieties',
      'notableFarms',
      'notableRegions',
      'regionalVariants',
    ];

    // Dynamic form keys prevent a statically-checked object literal; build the
    // entries and narrow once to the shared input schema (validated server-side).
    const body = Object.fromEntries(
      Object.entries(form).map(([key, val]) => {
        if (arrayFields.includes(key)) {
          const arr = stringToArr(val);
          return [key, arr.length > 0 ? arr : undefined];
        }
        return [key, val.trim() || undefined];
      }),
    ) as CoffeeVarietyUpdate;

    try {
      if (editId) {
        await api.patch<CoffeeVarietyOutput>(
          `/admin/coffee-varieties/${editId}`,
          body,
        );
      } else {
        await api.post<CoffeeVarietyOutput>('/admin/coffee-varieties', body);
      }
      await fetchData();
      resetForm();
    } catch (err) {
      log.error({ err, editId }, 'handleSubmit failed');
      toast.error('admin.coffeeVarieties.saveError');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (
      !await confirm({
        titleKey: 'common.confirmDelete',
        bodyKey: 'admin.coffeeVarieties.deleteConfirm',
        danger: true,
      })
    ) return;
    try {
      await api.delete(`/admin/coffee-varieties/${id}`);
      await fetchData();
    } catch (err) {
      log.error({ err, varietyId: id }, 'handleDelete failed');
      toast.error('admin.coffeeVarieties.deleteFailed');
    }
  }

  function startEdit(item: CoffeeVarietyOutput) {
    setEditId(item.id);
    setForm({
      name: item.name,
      category: toCategory(item.category),
      species: item.species || '',
      origin: item.origin || '',
      spread: item.spread || '',
      altitudeRangeM: item.altitudeRangeM || '',
      cupProfile: item.cupProfile || '',
      body: item.body || '',
      acidity: item.acidity || '',
      caffeinePct: item.caffeinePct || '',
      processingCompatibility: arrToString(item.processingCompatibility),
      diseaseResistance: item.diseaseResistance || '',
      yield: item.yield || '',
      plantSize: item.plantSize || '',
      notes: item.notes || '',
      subVarieties: arrToString(item.subVarieties),
      fermentation: item.fermentation || '',
      dryingTimeDays: item.dryingTimeDays || '',
      dryingMethod: item.dryingMethod || '',
      mucilageRetentionPct: item.mucilageRetentionPct || '',
      priceRange: item.priceRange || '',
      processing: item.processing || '',
      typeLabel: item.typeLabel || '',
      notableFarms: arrToString(item.notableFarms),
      notableRegions: arrToString(item.notableRegions),
      regionalVariants: arrToString(item.regionalVariants),
      globalSharePct: item.globalSharePct || '',
    });
    setShowForm(true);
  }

  function resetForm() {
    setForm({ ...emptyForm });
    setEditId(null);
    setShowForm(false);
  }

  const categoryFieldsets: Record<Category, string[]> = {
    variety: [
      'species',
      'origin',
      'spread',
      'altitudeRangeM',
      'cupProfile',
      'body',
      'acidity',
      'caffeinePct',
      'diseaseResistance',
      'yield',
      'plantSize',
      'subVarieties',
    ],
    processing: ['fermentation', 'dryingTimeDays', 'dryingMethod', 'mucilageRetentionPct'],
    market_name: [
      'priceRange',
      'processing',
      'typeLabel',
      'notableFarms',
      'notableRegions',
      'regionalVariants',
      'globalSharePct',
    ],
  };

  const commonFields = ['name', 'category', 'notes', 'processingCompatibility'];

  function isFieldVisible(field: string): boolean {
    if (commonFields.includes(field)) return true;
    return categoryFieldsets[form.category]?.includes(field) ?? false;
  }

  function fieldLabel(field: string): string {
    const labels: Record<string, string> = {
      name: t('common.name'),
      category: t('common.category'),
      species: t('admin.coffeeVarieties.species'),
      origin: t('coffeeVarieties.fields.origin'),
      spread: t('coffeeVarieties.fields.spread'),
      altitudeRangeM: t('admin.coffeeVarieties.altitudeRange'),
      cupProfile: t('coffeeVarieties.fields.cupProfile'),
      body: t('coffeeVarieties.fields.body'),
      acidity: t('coffeeVarieties.fields.acidity'),
      caffeinePct: t('admin.coffeeVarieties.caffeinePct'),
      processingCompatibility: t('coffeeVarieties.fields.processingCompatibility'),
      diseaseResistance: t('coffeeVarieties.fields.diseaseResistance'),
      yield: t('coffeeVarieties.fields.yield'),
      plantSize: t('coffeeVarieties.fields.plantSize'),
      notes: t('coffeeVarieties.fields.notes'),
      subVarieties: t('coffeeVarieties.fields.subVarieties'),
      fermentation: t('coffeeVarieties.fields.fermentation'),
      dryingTimeDays: t('admin.coffeeVarieties.dryingTime'),
      dryingMethod: t('admin.coffeeVarieties.dryingMethod'),
      mucilageRetentionPct: t('admin.coffeeVarieties.mucilageRetention'),
      priceRange: t('admin.coffeeVarieties.priceRange'),
      processing: t('bean.processing'),
      typeLabel: t('admin.coffeeVarieties.typeLabel'),
      notableFarms: t('admin.coffeeVarieties.notableFarms'),
      notableRegions: t('admin.coffeeVarieties.notableRegions'),
      regionalVariants: t('admin.coffeeVarieties.regionalVariants'),
      globalSharePct: t('admin.coffeeVarieties.globalShare'),
    };
    return labels[field] || field;
  }

  function fieldPlaceholder(field: string): string {
    if (
      [
        'processingCompatibility',
        'subVarieties',
        'notableFarms',
        'notableRegions',
        'regionalVariants',
      ].includes(field)
    ) {
      return t('common.commaSeparated');
    }
    return '';
  }

  const fieldKeys = Object.keys(emptyForm) as (keyof FormData)[];

  return (
    <div>
      <div className='flex items-center justify-between mb-6'>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          {t('coffeeVarieties.title')}
        </h1>
        <div className='flex gap-2'>
          <button type='button' onClick={() => setShowForm(!showForm)} className='btn-primary'>
            {showForm ? t('common.cancel') : t('admin.coffeeVarieties.add')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className='flex flex-wrap gap-3 mb-4'>
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          className='input-field'
          style={{ width: '180px' }}
        >
          <option value=''>{t('admin.coffeeVarieties.allCategories')}</option>
          <option value='variety'>{t('admin.coffeeVarieties.catVariety')}</option>
          <option value='processing'>{t('admin.coffeeVarieties.catProcessing')}</option>
          <option value='market_name'>{t('admin.coffeeVarieties.catMarketName')}</option>
        </select>
        <input
          type='text'
          placeholder={t('admin.coffeeVarieties.searchPlaceholder')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className='input-field'
          style={{ width: '250px' }}
        />
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className='card mb-6'>
          <h2 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>
            {editId ? t('admin.coffeeVarieties.editTitle') : t('admin.coffeeVarieties.addTitle')}
          </h2>
          <div className='grid grid-cols-2 gap-4'>
            {fieldKeys.map((field) => {
              if (!isFieldVisible(field)) return null;

              if (field === 'category') {
                return (
                  <div key={field}>
                    <Field label={fieldLabel(field)} required>
                      <select
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
                        className='input-field'
                        required
                      >
                        <option value='variety'>{t('admin.coffeeVarieties.catVariety')}</option>
                        <option value='processing'>
                          {t('admin.coffeeVarieties.catProcessing')}
                        </option>
                        <option value='market_name'>
                          {t('admin.coffeeVarieties.catMarketName')}
                        </option>
                      </select>
                    </Field>
                  </div>
                );
              }

              if (field === 'notes' || field === 'cupProfile' || field === 'spread') {
                return (
                  <div key={field} className='col-span-2'>
                    <Field label={fieldLabel(field)}>
                      <textarea
                        value={(form as unknown as Record<string, string>)[field]}
                        onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                        className='input-field'
                        rows={3}
                        placeholder={fieldPlaceholder(field)}
                      />
                    </Field>
                  </div>
                );
              }

              const required = field === 'name';
              return (
                <div key={field}>
                  <Field label={fieldLabel(field)} required={required}>
                    <input
                      type='text'
                      value={(form as unknown as Record<string, string>)[field]}
                      onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                      className='input-field'
                      required={required}
                      placeholder={fieldPlaceholder(field)}
                    />
                  </Field>
                </div>
              );
            })}
          </div>
          <div className='flex gap-2 mt-4'>
            <button type='submit' className='btn-primary' disabled={saving}>
              {saving ? t('common.saving') : t('common.save')}
            </button>
            {editId && (
              <button type='button' onClick={resetForm} className='btn-secondary'>
                {t('common.cancelEdit')}
              </button>
            )}
          </div>
        </form>
      )}

      {loading ? <LoadingState /> : (
        <>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('common.name')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('common.category')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('admin.coffeeVarieties.species')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('coffeeVarieties.fields.origin')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('admin.coffeeVarieties.system')}
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                    <td className='py-2 px-3' style={{ color: 'var(--text-primary)' }}>
                      {item.name}
                    </td>
                    <td className='py-2 px-3'>
                      <span
                        className='badge'
                        style={{
                          backgroundColor: CATEGORY_BADGE_COLORS[toCategory(item.category)],
                          color: '#fff',
                        }}
                      >
                        {categoryLabel(toCategory(item.category))}
                      </span>
                    </td>
                    <td className='py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                      {item.species || '-'}
                    </td>
                    <td className='py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                      {item.origin
                        ? item.origin.length > 40 ? `${item.origin.slice(0, 40)}...` : item.origin
                        : '-'}
                    </td>
                    <td className='py-2 px-3'>
                      {item.isSystem
                        ? (
                          <span
                            className='badge'
                            style={{ backgroundColor: 'var(--warning)', color: '#000' }}
                          >
                            {t('admin.coffeeVarieties.system')}
                          </span>
                        )
                        : (
                          <span
                            className='badge'
                            style={{ backgroundColor: 'var(--success)', color: '#fff' }}
                          >
                            {t('admin.coffeeVarieties.custom')}
                          </span>
                        )}
                    </td>
                    <td className='py-2 px-3 flex gap-2'>
                      <button
                        type='button'
                        onClick={() =>
                          startEdit(item)}
                        className='text-xs'
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        {t('common.edit')}
                      </button>
                      {!item.isSystem && (
                        <button
                          type='button'
                          onClick={() => handleDelete(item.id)}
                          className='btn-danger-text text-xs'
                        >
                          {t('common.delete')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > 20 && (
            <PaginationControls
              page={page}
              totalPages={Math.ceil(total / 20)}
              onPageChange={setPage}
              variant='disable'
            />
          )}
        </>
      )}
    </div>
  );
}
