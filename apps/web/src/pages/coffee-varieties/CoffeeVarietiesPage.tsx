import { useEffect } from 'react';
import { useLoaderData, useLocation, useNavigation } from 'react-router';
import { CatalogEntityCard } from '../../components/catalog/CatalogEntityCard.tsx';
import { CategoryTabs } from '../../components/catalog/CategoryTabs.tsx';
import { varietyCategoryLabel } from '../../components/catalog/TypeBadge.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { EmptyState } from '../../components/ui/EmptyState.tsx';
import { PaginationControls } from '../../components/ui/PaginationControls.tsx';
import { CardSkeletonGrid } from '../../components/ui/Skeleton.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useDebouncedUrlText, useListUrlState } from '../../hooks/useListUrlState.ts';
import { parseCoffeeVarietyCatalogParams } from '../../utils/list-parsers.ts';
import { createLogger } from '../../utils/logger.ts';
import type { loader } from './CoffeeVarietiesPage.data.ts';

const log = createLogger('CoffeeVarietiesPage');

/**
 * Public coffee-variety catalog with URL-driven pagination, category
 * tabs, and debounced search; cards link to variety detail pages. All
 * selections live in the URL (`page`, `category`, `q`; a legacy `search` link
 * is still read): tabs push history, the search box commits after a 300 ms
 * pause with `replace`, and page 1 is never written. The cards come from the
 * `/coffee-varieties` route loader (`CoffeeVarietiesPage.data.ts`); a skeleton
 * shows while a new URL state loads, and a failed load renders the route error
 * state.
 */
export function CoffeeVarietiesPage() {
  const {
    state: { page, category, q: search },
    setFilter,
    setPage,
    clearAll,
  } = useListUrlState(parseCoffeeVarietyCatalogParams);
  const searchInput = useDebouncedUrlText('q', { legacyKeys: ['search'] });
  const { varieties, totalPages } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const location = useLocation();
  const loading =
    navigation.state === 'loading' && navigation.location.pathname === location.pathname;
  const { t } = useTranslation();

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

  const hasActiveFilters = !!(category || search);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <SEOHead title={t('coffeeVarieties.title')} />

      <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
        {t('coffeeVarieties.title')}
      </h1>
      <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
        {t('coffeeVarieties.subtitle')}
      </p>

      {/* Category tabs */}
      <CategoryTabs
        tabs={categoryButtons}
        active={category}
        onSelect={(v) => setFilter('category', v)}
      />

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder={t('coffeeVarieties.searchPlaceholder')}
          value={searchInput.value}
          onChange={(e) => searchInput.setValue(e.target.value)}
          className="input-field text-sm max-w-md"
        />
      </div>

      {/* Active filters */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('common.activeFilters')}
          </span>
          <button type="button" onClick={clearAll} className="btn-secondary text-sm">
            {t('common.clearAll')}
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <CardSkeletonGrid variant="catalog" />
      ) : varieties.length === 0 ? (
        <EmptyState
          message={t('coffeeVarieties.empty')}
          action={
            hasActiveFilters ? (
              <button type="button" onClick={clearAll} className="btn-secondary text-sm">
                {t('common.clearSearch')}
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {varieties.map((v) => (
              <CatalogEntityCard
                key={v.id}
                to={`/coffee-varieties/${v.id}`}
                title={v.name}
                badge={v.category ? varietyCategoryLabel(t, v.category) : null}
                description={v.cupProfile}
              >
                {v.species && (
                  <p className="text-sm italic mb-1" style={{ color: 'var(--text-secondary)' }}>
                    {v.species}
                  </p>
                )}
                {v.origin && (
                  <p className="text-sm truncate mb-2" style={{ color: 'var(--text-tertiary)' }}>
                    {v.origin}
                  </p>
                )}
              </CatalogEntityCard>
            ))}
          </div>

          {/* Pagination */}
          <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
