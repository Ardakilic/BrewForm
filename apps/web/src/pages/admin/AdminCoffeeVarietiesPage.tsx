import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.ts';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('AdminCoffeeVarietiesPage');

type Category = 'variety' | 'processing' | 'market_name';

interface CoffeeVarietyItem {
  id: string;
  name: string;
  category: Category;
  species: string | null;
  origin: string | null;
  spread: string | null;
  altitudeRangeM: string | null;
  cupProfile: string | null;
  body: string | null;
  acidity: string | null;
  caffeinePct: string | null;
  processingCompatibility: string[] | null;
  diseaseResistance: string | null;
  yield: string | null;
  plantSize: string | null;
  notes: string | null;
  subVarieties: string[] | null;
  fermentation: string | null;
  dryingTimeDays: string | null;
  dryingMethod: string | null;
  mucilageRetentionPct: string | null;
  priceRange: string | null;
  processing: string | null;
  typeLabel: string | null;
  notableFarms: string[] | null;
  notableRegions: string[] | null;
  regionalVariants: string[] | null;
  globalSharePct: string | null;
  isSystem: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

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
  const [items, setItems] = useState<CoffeeVarietyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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
        { success: boolean; data: CoffeeVarietyItem[]; total: number }
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

    const body: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(form)) {
      if (arrayFields.includes(key)) {
        const arr = stringToArr(val as string);
        if (arr.length > 0) body[key] = arr;
        else body[key] = undefined;
      } else {
        body[key] = (val as string).trim() || undefined;
      }
    }

    try {
      if (editId) {
        await api.patch<CoffeeVarietyItem>(
          `/admin/coffee-varieties/${editId}`,
          body,
        );
      } else {
        await api.post<CoffeeVarietyItem>('/admin/coffee-varieties', body);
      }
      await fetchData();
      resetForm();
    } catch {
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleteConfirm(id);
  }

  async function confirmDelete() {
    if (!deleteConfirm) return;
    try {
      await api.delete(`/admin/coffee-varieties/${deleteConfirm}`);
      await fetchData();
    } catch {
    } finally {
      setDeleteConfirm(null);
    }
  }

  function startEdit(item: CoffeeVarietyItem) {
    setEditId(item.id);
    setForm({
      name: item.name,
      category: item.category,
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
      name: 'Name',
      category: 'Category',
      species: 'Species',
      origin: 'Origin',
      spread: 'Spread',
      altitudeRangeM: 'Altitude Range (m)',
      cupProfile: 'Cup Profile',
      body: 'Body',
      acidity: 'Acidity',
      caffeinePct: 'Caffeine %',
      processingCompatibility: 'Processing Compatibility',
      diseaseResistance: 'Disease Resistance',
      yield: 'Yield',
      plantSize: 'Plant Size',
      notes: 'Notes',
      subVarieties: 'Sub Varieties',
      fermentation: 'Fermentation',
      dryingTimeDays: 'Drying Time (days)',
      dryingMethod: 'Drying Method',
      mucilageRetentionPct: 'Mucilage Retention %',
      priceRange: 'Price Range',
      processing: 'Processing',
      typeLabel: 'Type Label',
      notableFarms: 'Notable Farms',
      notableRegions: 'Notable Regions',
      regionalVariants: 'Regional Variants',
      globalSharePct: 'Global Share %',
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
      return 'Comma-separated values';
    }
    return '';
  }

  const fieldKeys = Object.keys(emptyForm) as (keyof FormData)[];

  return (
    <div>
      <div className='flex items-center justify-between mb-6'>
        <h1 className='text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
          Coffee Varieties
        </h1>
        <div className='flex gap-2'>
          <button type='button' onClick={() => setShowForm(!showForm)} className='btn-primary'>
            {showForm ? 'Cancel' : '+ Add Coffee Variety'}
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
          <option value=''>All Categories</option>
          <option value='variety'>Variety</option>
          <option value='processing'>Processing</option>
          <option value='market_name'>Market Name</option>
        </select>
        <input
          type='text'
          placeholder='Search by name...'
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
            {editId ? 'Edit Coffee Variety' : 'Add Coffee Variety'}
          </h2>
          <div className='grid grid-cols-2 gap-4'>
            {fieldKeys.map((field) => {
              if (!isFieldVisible(field)) return null;

              if (field === 'category') {
                return (
                  <div key={field}>
                    <label
                      className='block text-sm font-medium mb-1'
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {fieldLabel(field)} *
                    </label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
                      className='input-field'
                      required
                    >
                      <option value='variety'>Variety</option>
                      <option value='processing'>Processing</option>
                      <option value='market_name'>Market Name</option>
                    </select>
                  </div>
                );
              }

              if (field === 'notes' || field === 'cupProfile' || field === 'spread') {
                return (
                  <div key={field} className='col-span-2'>
                    <label
                      className='block text-sm font-medium mb-1'
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {fieldLabel(field)}
                    </label>
                    <textarea
                      value={(form as unknown as Record<string, string>)[field]}
                      onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                      className='input-field'
                      rows={3}
                      placeholder={fieldPlaceholder(field)}
                    />
                  </div>
                );
              }

              const required = field === 'name';
              return (
                <div key={field}>
                  <label
                    className='block text-sm font-medium mb-1'
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {fieldLabel(field)}
                    {required ? ' *' : ''}
                  </label>
                  <input
                    type='text'
                    value={(form as unknown as Record<string, string>)[field]}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                    className='input-field'
                    required={required}
                    placeholder={fieldPlaceholder(field)}
                  />
                </div>
              );
            })}
          </div>
          <div className='flex gap-2 mt-4'>
            <button type='submit' className='btn-primary' disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            {editId && (
              <button type='button' onClick={resetForm} className='btn-secondary'>
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      )}

      {loading ? <div style={{ color: 'var(--text-secondary)' }}>Loading...</div> : (
        <>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    Name
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    Category
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    Species
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    Origin
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    System
                  </th>
                  <th className='text-left py-2 px-3' style={{ color: 'var(--text-secondary)' }}>
                    Actions
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
                          backgroundColor: CATEGORY_BADGE_COLORS[item.category],
                          color: '#fff',
                        }}
                      >
                        {item.category}
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
                            System
                          </span>
                        )
                        : (
                          <span
                            className='badge'
                            style={{ backgroundColor: 'var(--success)', color: '#fff' }}
                          >
                            Custom
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
                        Edit
                      </button>
                      {!item.isSystem && (
                        <button
                          type='button'
                          onClick={() => handleDelete(item.id)}
                          className='text-xs'
                          style={{ color: 'var(--error)' }}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > 20 && (
            <div className='flex justify-center gap-2 mt-4'>
              <button
                type='button'
                className='btn-secondary text-sm'
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className='text-sm self-center' style={{ color: 'var(--text-secondary)' }}>
                Page {page} of {Math.ceil(total / 20)}
              </span>
              <button
                type='button'
                className='btn-secondary text-sm'
                disabled={page >= Math.ceil(total / 20)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div
          className='fixed inset-0 flex items-center justify-center z-50'
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div className='card max-w-sm w-full'>
            <h3 className='font-semibold mb-2' style={{ color: 'var(--text-primary)' }}>
              Confirm Delete
            </h3>
            <p className='text-sm mb-4' style={{ color: 'var(--text-secondary)' }}>
              Are you sure you want to delete this coffee variety? This action cannot be undone.
            </p>
            <div className='flex justify-end gap-2'>
              <button
                type='button'
                onClick={() => setDeleteConfirm(null)}
                className='btn-secondary'
              >
                Cancel
              </button>
              <button
                type='button'
                onClick={confirmDelete}
                className='btn-primary'
                style={{ backgroundColor: 'var(--error)' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
