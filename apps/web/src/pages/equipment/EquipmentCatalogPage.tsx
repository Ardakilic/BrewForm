// deno-lint-ignore-file require-await
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../../api/client.ts';
import { useDebounce } from '../../hooks/useDebounce.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { Skeleton } from '../../components/ui/Skeleton.tsx';

interface CatalogEquipmentItem {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  type: string | null;
  description: string | null;
}

export function EquipmentCatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [equipment, setEquipment] = useState<CatalogEquipmentItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const page = Number(searchParams.get('page')) || 1;
  const type = searchParams.get('type') || '';
  const search = searchParams.get('search') || '';
  const debouncedSearch = useDebounce(search, 300);

  const categoryButtons = [
    { value: 'espresso_machine', label: t('equipment.category.espresso_machine') },
    { value: 'grinder', label: t('equipment.category.grinder') },
    { value: 'pour_over_brewer', label: t('equipment.category.pour_over_brewer') },
    { value: 'immersion_brewer', label: t('equipment.category.immersion_brewer') },
    { value: 'kettle', label: t('equipment.category.kettle') },
    { value: 'milk_tool', label: t('equipment.category.milk_tool') },
    { value: 'scale_accessory', label: t('equipment.category.scale_accessory') },
    { value: 'roaster', label: t('equipment.category.roaster') },
  ];

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('perPage', '12');
    if (type) params.set('type', type);
    if (debouncedSearch) params.set('search', debouncedSearch);

    api.getWithMeta<{ data: CatalogEquipmentItem[]; total?: number }>(
      `/equipment?${params.toString()}`,
    )
      .then((data) => {
        const items = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
        setEquipment(items);
        setTotalPages(Math.ceil((data?.total ?? items.length) / 12) || 1);
      })
      .catch(() => setError(t('equipment.catalog.error.load')))
      .finally(() => setLoading(false));
  }, [page, type, debouncedSearch]);

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    setSearchParams(params);
  }

  const hasActiveFilters = !!(type || search);

  return (
    <div className='mx-auto max-w-6xl px-6 py-8'>
      <SEOHead title={t('equipment.catalog.title')} />

      <h1 className='text-3xl font-bold mb-2' style={{ color: 'var(--text-primary)' }}>
        {t('equipment.catalog.title')}
      </h1>
      <p className='mb-6' style={{ color: 'var(--text-secondary)' }}>
        {t('equipment.catalog.subtitle')}
      </p>

      {/* Category tabs */}
      <div className='flex flex-wrap gap-2 mb-4'>
        <button
          type='button'
          onClick={() => updateFilter('type', '')}
          className={[
            'rounded-full px-3 py-1.5 text-sm transition-colors',
            !type
              ? 'bg-[color:var(--accent-primary)] text-white'
              : 'bg-[color:var(--bg-tertiary)] text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-primary)]',
          ].join(' ')}
        >
          {t('common.all')}
        </button>
        {categoryButtons.map((cat) => (
          <button
            key={cat.value}
            type='button'
            onClick={() => updateFilter('type', cat.value)}
            className={[
              'rounded-full px-3 py-1.5 text-sm transition-colors',
              type === cat.value
                ? 'bg-[color:var(--accent-primary)] text-white'
                : 'bg-[color:var(--bg-tertiary)] text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-primary)]',
            ].join(' ')}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className='mb-6'>
        <input
          type='text'
          placeholder={t('equipment.catalog.searchPlaceholder')}
          value={search}
          onChange={(e) => updateFilter('search', e.target.value)}
          className='input-field text-sm max-w-md'
        />
      </div>

      {/* Active filters */}
      {hasActiveFilters && (
        <div className='flex items-center gap-2 mb-4'>
          <span className='text-sm' style={{ color: 'var(--text-secondary)' }}>
            {t('common.activeFilters')}
          </span>
          <button
            type='button'
            onClick={() => setSearchParams({})}
            className='btn-secondary text-sm'
          >
            {t('common.clearAll')}
          </button>
        </div>
      )}

      {/* Content */}
      {loading
        ? (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className='card space-y-3'>
                <div className='flex gap-2'>
                  <Skeleton height='1.25rem' width='60%' />
                  <Skeleton height='1.25rem' width='4rem' className='rounded-full' />
                </div>
                <Skeleton height='0.875rem' width='40%' />
                <Skeleton height='1.5rem' />
              </div>
            ))}
          </div>
        )
        : error
        ? (
          <div className='text-center py-12'>
            <p className='mb-4' style={{ color: 'var(--error)' }}>{error}</p>
            <button
              type='button'
              onClick={() => {
                setError(null);
                setLoading(true);
                const params = new URLSearchParams(searchParams);
                params.delete('page');
                setSearchParams(params);
              }}
              className='btn-primary'
            >
              {t('common.retry')}
            </button>
          </div>
        )
        : equipment.length === 0
        ? (
          <div className='text-center py-12' style={{ color: 'var(--text-tertiary)' }}>
            <p className='mb-2'>{t('equipment.catalog.empty')}</p>
            {hasActiveFilters && (
              <button
                type='button'
                onClick={() => setSearchParams({})}
                className='btn-secondary text-sm'
              >
                {t('common.clearSearch')}
              </button>
            )}
          </div>
        )
        : (
          <>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
              {equipment.map((eq) => (
                <Link
                  key={eq.id}
                  to={`/equipment/${eq.id}`}
                  className='card hover:shadow-lg transition-shadow'
                >
                  <div className='flex items-start justify-between mb-1'>
                    <div>
                      {eq.brand && (
                        <p className='font-bold' style={{ color: 'var(--text-primary)' }}>
                          {eq.brand}
                        </p>
                      )}
                      <h3
                        className={eq.brand ? 'text-sm' : 'font-semibold'}
                        style={{
                          color: eq.brand ? 'var(--text-secondary)' : 'var(--text-primary)',
                        }}
                      >
                        {eq.model || eq.name}
                      </h3>
                    </div>
                    {eq.type && (
                      <span
                        className='text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2'
                        style={{
                          backgroundColor: 'var(--accent-primary)',
                          color: 'white',
                        }}
                      >
                        {eq.type.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  {eq.description && (
                    <p
                      className='text-xs mt-2'
                      style={{
                        color: 'var(--text-tertiary)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {eq.description}
                    </p>
                  )}
                </Link>
              ))}
            </div>

            {/* Pagination */}
            <div className='flex justify-center gap-2 mt-8'>
              {page > 1 && (
                <button
                  type='button'
                  onClick={() => updateFilter('page', String(page - 1))}
                  className='btn-secondary'
                >
                  {t('common.previous')}
                </button>
              )}
              <span
                className='py-2 px-4 text-sm'
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('common.pagination')
                  .replace('{page}', String(page))
                  .replace('{total}', String(totalPages))}
              </span>
              {page < totalPages && (
                <button
                  type='button'
                  onClick={() => updateFilter('page', String(page + 1))}
                  className='btn-secondary'
                >
                  {t('common.next')}
                </button>
              )}
            </div>
          </>
        )}
    </div>
  );
}
