// deno-lint-ignore-file require-await
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../../api/client.ts';
import { useDebounce } from '../../hooks/useDebounce.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { createLogger } from '../../utils/logger.ts';
import { Skeleton } from '../../components/ui/Skeleton.tsx';

const log = createLogger('CoffeeVarietiesPage');

interface CoffeeVarietyItem {
  id: string;
  name: string;
  species: string | null;
  category: string | null;
  origin: string | null;
  cupProfile: string | null;
  slug: string;
}

/**
 * Public coffee-variety catalog with URL-driven pagination, category
 * tabs, and debounced search; cards link to variety detail pages.
 */
export function CoffeeVarietiesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [varieties, setVarieties] = useState<CoffeeVarietyItem[]>([]);
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

    api.getWithMeta<{ data: CoffeeVarietyItem[]; meta: { pagination?: { total: number } } }>(
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
      <div className='flex flex-wrap gap-2 mb-4'>
        {categoryButtons.map((cat) => (
          <button
            key={cat.value}
            type='button'
            onClick={() => updateFilter('category', cat.value)}
            className={[
              'rounded-full px-3 py-1.5 text-sm transition-colors',
              category === cat.value
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
                <Skeleton height='0.875rem' width='80%' />
                <Skeleton height='2.5rem' />
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
          <div className='text-center py-12' style={{ color: 'var(--text-tertiary)' }}>
            <p className='mb-2'>{t('coffeeVarieties.empty')}</p>
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
              {varieties.map((v) => (
                <Link
                  key={v.id}
                  to={`/coffee-varieties/${v.id}`}
                  className='card hover:shadow-lg transition-shadow'
                >
                  <div className='flex items-start justify-between mb-2'>
                    <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>
                      {v.name}
                    </h3>
                    {v.category && (
                      <span
                        className='text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2'
                        style={{
                          backgroundColor: 'var(--accent-primary)',
                          color: 'white',
                        }}
                      >
                        {v.category === 'variety'
                          ? t('coffeeVarieties.category.varietyShort')
                          : v.category === 'processing'
                          ? t('coffeeVarieties.category.processingShort')
                          : v.category === 'market_name'
                          ? t('coffeeVarieties.category.marketNameShort')
                          : v.category}
                      </span>
                    )}
                  </div>
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
                  {v.cupProfile && (
                    <p
                      className='text-xs'
                      style={{
                        color: 'var(--text-tertiary)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {v.cupProfile}
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
