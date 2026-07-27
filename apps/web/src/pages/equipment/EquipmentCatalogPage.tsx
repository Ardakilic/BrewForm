import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../../api/client.ts';
import { useDebounce } from '../../hooks/useDebounce.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { createLogger } from '../../utils/logger.ts';
import { CardSkeletonGrid } from '../../components/ui/Skeleton.tsx';
import { EmptyState } from '../../components/ui/EmptyState.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { PaginationControls } from '../../components/ui/PaginationControls.tsx';
import { CategoryTabs } from '../../components/catalog/CategoryTabs.tsx';
import { CatalogEntityCard } from '../../components/catalog/CatalogEntityCard.tsx';
import type { EquipmentOutput } from '@brewform/shared/schemas';

const log = createLogger('EquipmentCatalogPage');

/**
 * Public equipment catalog with URL-driven pagination, type-category
 * tabs, and debounced search; cards link to equipment detail pages.
 */
export function EquipmentCatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [equipment, setEquipment] = useState<EquipmentOutput[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCounter, setRetryCounter] = useState(0);
  const { t } = useTranslation();

  const raw = Number(searchParams.get('page'));
  const page = Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 1;
  const type = searchParams.get('type') || '';
  const search = searchParams.get('search') || '';
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    log.debug({}, 'EquipmentCatalogPage mounted');
    return () => {
      log.debug({}, 'EquipmentCatalogPage unmounted');
    };
  }, []);

  const categoryButtons = [
    { value: '', label: t('common.all') },
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

    api.getWithMeta<{
      data: EquipmentOutput[];
      meta?: { pagination?: { total?: number; totalPages?: number } };
    }>(
      `/equipment?${params.toString()}`,
    )
      .then((data) => {
        const items = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
        setEquipment(items);
        setTotalPages(
          data?.meta?.pagination?.totalPages ||
            Math.ceil((data?.meta?.pagination?.total ?? items.length) / 12) || 1,
        );
      })
      .catch((err) => {
        log.error({ err }, 'EquipmentCatalogPage loadData failed');
        setError(t('equipment.catalog.error.load'));
      })
      .finally(() => setLoading(false));
  }, [page, type, debouncedSearch, retryCounter]);

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    if (key !== 'page') {
      params.delete('page');
    }
    setSearchParams(params, { preventScrollReset: true });
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
      <CategoryTabs
        tabs={categoryButtons}
        active={type}
        onSelect={(v) => updateFilter('type', v)}
      />

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
      {loading ? <CardSkeletonGrid variant='catalog' /> : error
        ? (
          <div className='text-center py-12'>
            <ErrorState message={error} className='mb-4' />
            <button
              type='button'
              onClick={() => {
                setError(null);
                setLoading(true);
                const params = new URLSearchParams(searchParams);
                params.delete('page');
                setSearchParams(params, { preventScrollReset: true });
                setRetryCounter((c) => c + 1);
              }}
              className='btn-primary'
            >
              {t('common.retry')}
            </button>
          </div>
        )
        : equipment.length === 0
        ? (
          <EmptyState
            message={t('equipment.catalog.empty')}
            action={hasActiveFilters
              ? (
                <button
                  type='button'
                  onClick={() => setSearchParams({})}
                  className='btn-secondary text-sm'
                >
                  {t('common.clearSearch')}
                </button>
              )
              : undefined}
          />
        )
        : (
          <>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
              {equipment.map((eq) => (
                <CatalogEntityCard
                  key={eq.id}
                  to={`/equipment/${eq.id}`}
                  title={eq.model || eq.name}
                  brand={eq.brand}
                  badge={eq.type ? eq.type.replace(/_/g, ' ') : null}
                  description={eq.description}
                />
              ))}
            </div>

            {/* Pagination */}
            <PaginationControls
              page={page}
              totalPages={totalPages}
              onPageChange={(p) => updateFilter('page', String(p))}
            />
          </>
        )}
    </div>
  );
}
