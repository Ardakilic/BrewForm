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
import { varietyCategoryLabel } from '../../components/catalog/TypeBadge.tsx';
import type { CoffeeVarietyOutput } from '@brewform/shared/schemas';

const log = createLogger('CoffeeVarietiesPage');

/**
 * Public coffee-variety catalog with URL-driven pagination, category
 * tabs, and debounced search; cards link to variety detail pages.
 */
export function CoffeeVarietiesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [varieties, setVarieties] = useState<CoffeeVarietyOutput[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const { t } = useTranslation();

  const rawPage = Number(searchParams.get('page'));
  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
  const category = searchParams.get('category') || '';
  const search = searchParams.get('search') || '';
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    log.debug({}, 'CoffeeVarietiesPage mounted');
    return () => {
      log.debug({}, 'CoffeeVarietiesPage unmounted');
    };
  }, []);

  const categoryButtons = [
    { value: '', label: t('common.all') },
    { value: 'variety', label: t('coffeeVarieties.category.variety') },
    { value: 'processing', label: t('coffeeVarieties.category.processing') },
    { value: 'market_name', label: t('coffeeVarieties.category.market_name') },
  ];

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('perPage', '12');
    if (category) params.set('category', category);
    if (debouncedSearch) params.set('search', debouncedSearch);

    api.getWithMeta<{ data: CoffeeVarietyOutput[]; meta: { pagination?: { total: number } } }>(
      `/coffee-varieties?${params.toString()}`,
    )
      .then((data) => {
        const items = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
        setVarieties(items);
        setTotalPages(Math.ceil((data?.meta?.pagination?.total ?? items.length) / 12) || 1);
      })
      .catch((err) => {
        log.error({ err }, 'CoffeeVarietiesPage loadData failed');
        setError(t('coffeeVarieties.error.load'));
      })
      .finally(() => setLoading(false));
  }, [page, category, debouncedSearch, retryNonce]);

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

  const hasActiveFilters = !!(category || search);

  return (
    <div className='mx-auto max-w-6xl px-6 py-8'>
      <SEOHead title={t('coffeeVarieties.title')} />

      <h1 className='text-3xl font-bold mb-2' style={{ color: 'var(--text-primary)' }}>
        {t('coffeeVarieties.title')}
      </h1>
      <p className='mb-6' style={{ color: 'var(--text-secondary)' }}>
        {t('coffeeVarieties.subtitle')}
      </p>

      {/* Category tabs */}
      <CategoryTabs
        tabs={categoryButtons}
        active={category}
        onSelect={(v) => updateFilter('category', v)}
      />

      {/* Search */}
      <div className='mb-6'>
        <input
          type='text'
          placeholder={t('coffeeVarieties.searchPlaceholder')}
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
                setRetryNonce((n) => n + 1);
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
        : varieties.length === 0
        ? (
          <EmptyState
            message={t('coffeeVarieties.empty')}
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
              {varieties.map((v) => (
                <CatalogEntityCard
                  key={v.id}
                  to={`/coffee-varieties/${v.id}`}
                  title={v.name}
                  badge={v.category ? varietyCategoryLabel(t, v.category) : null}
                  description={v.cupProfile}
                >
                  {v.species && (
                    <p
                      className='text-sm italic mb-1'
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {v.species}
                    </p>
                  )}
                  {v.origin && (
                    <p
                      className='text-sm truncate mb-2'
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {v.origin}
                    </p>
                  )}
                </CatalogEntityCard>
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
