import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../../api/client.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { createLogger } from '../../utils/logger.ts';
import { Skeleton } from '../../components/ui/Skeleton.tsx';
import { Breadcrumb } from '../../components/ui/Breadcrumb.tsx';
import { RecipeCard } from '../../components/recipe-list/RecipeCard.tsx';
import { TypeBadge } from '../../components/catalog/TypeBadge.tsx';
import type { CoffeeVarietyOutput, RecipeWithVersionsOutput } from '@brewform/shared/schemas';

const log = createLogger('CoffeeVarietyDetailPage');

/** Join an array field for display, or return null if empty/absent. */
function joinArray(v: string[] | null): string | null {
  if (!v || v.length === 0) return null;
  return v.join(', ');
}

/** Displays a single coffee variety's details, properties, and associated recipes. */
export function CoffeeVarietyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [variety, setVariety] = useState<CoffeeVarietyOutput | null>(null);
  const [recipes, setRecipes] = useState<RecipeWithVersionsOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    log.debug({}, 'CoffeeVarietyDetailPage mounted');
    return () => {
      log.debug({}, 'CoffeeVarietyDetailPage unmounted');
    };
  }, []);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);

    Promise.all([
      api.get<CoffeeVarietyOutput>(`/coffee-varieties/${id}`),
      api.get<{ data: RecipeWithVersionsOutput[] }>(
        `/coffee-varieties/${id}/recipes?perPage=6`,
      ),
    ])
      .then(([varietyData, recipesData]) => {
        setVariety(varietyData);
        const items = Array.isArray(recipesData?.data)
          ? recipesData.data
          : (Array.isArray(recipesData) ? recipesData : []);
        setRecipes(items);
      })
      .catch((err) => {
        log.error({ err }, 'CoffeeVarietyDetailPage loadData failed');
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className='mx-auto max-w-4xl px-6 py-8 space-y-6'>
        <Skeleton height='0.875rem' width='12rem' />
        <Skeleton height='2rem' width='40%' />
        <Skeleton height='1rem' width='20%' />
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className='space-y-1'>
              <Skeleton height='0.75rem' width='6rem' />
              <Skeleton height='1rem' width='80%' />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !variety) {
    return (
      <div
        className='mx-auto max-w-4xl px-6 py-12 text-center'
        style={{ color: 'var(--text-tertiary)' }}
      >
        <h1 className='text-2xl font-bold mb-4' style={{ color: 'var(--text-primary)' }}>
          {t('coffeeVarieties.error.notFound')}
        </h1>
        <Link to='/coffee-varieties' className='btn-primary'>
          {t('coffeeVarieties.backToList')}
        </Link>
      </div>
    );
  }

  const fields: [string, string | null][] = ([
    [t('coffeeVarieties.fields.origin'), variety.origin],
    [t('coffeeVarieties.fields.altitude'), variety.altitudeRangeM],
    [t('coffeeVarieties.fields.cupProfile'), variety.cupProfile],
    [t('coffeeVarieties.fields.body'), variety.body],
    [t('coffeeVarieties.fields.acidity'), variety.acidity],
    [t('coffeeVarieties.fields.caffeine'), variety.caffeinePct],
    [t('coffeeVarieties.fields.diseaseResistance'), variety.diseaseResistance],
    [t('coffeeVarieties.fields.yield'), variety.yield],
    [t('coffeeVarieties.fields.plantSize'), variety.plantSize],
    [t('coffeeVarieties.fields.spread'), variety.spread],
    [t('coffeeVarieties.fields.notes'), variety.notes],
    [t('coffeeVarieties.fields.fermentation'), variety.fermentation],
    [t('coffeeVarieties.fields.dryingTime'), variety.dryingTimeDays],
    [
      t('coffeeVarieties.fields.processingCompatibility'),
      joinArray(variety.processingCompatibility),
    ],
    [t('coffeeVarieties.fields.subVarieties'), joinArray(variety.subVarieties)],
  ] as [string, string | null][]).filter(([, v]) => v != null && v !== '');

  return (
    <div className='mx-auto max-w-4xl px-6 py-8'>
      <SEOHead
        title={variety.name}
        description={variety.cupProfile ||
          [variety.species, variety.origin].filter(Boolean).join(' from ') ||
          undefined}
        canonical={`${globalThis.location.origin}/coffee-varieties/${variety.id}`}
      />

      {/* Breadcrumb */}
      <div className='mb-4'>
        <Breadcrumb
          items={[
            { label: t('coffeeVarieties.title'), to: '/coffee-varieties' },
            { label: variety.name },
          ]}
        />
      </div>

      {/* Category badge */}
      {variety.category && (
        <div className='mb-2'>
          <TypeBadge
            label={variety.category === 'variety'
              ? t('coffeeVarieties.category.varietyDetail')
              : variety.category === 'processing'
              ? t('coffeeVarieties.category.processingDetail')
              : variety.category === 'market_name'
              ? t('coffeeVarieties.category.marketNameDetail')
              : variety.category}
          />
        </div>
      )}

      {/* Title */}
      <h1 className='text-3xl font-bold mb-1' style={{ color: 'var(--text-primary)' }}>
        {variety.name}
      </h1>

      {variety.species && (
        <p className='text-lg italic mb-6' style={{ color: 'var(--text-secondary)' }}>
          {variety.species}
        </p>
      )}

      {/* Detail grid */}
      {fields.length > 0 && (
        <div className='card mb-8'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3'>
            {fields.map(([label, value]) => (
              <div key={label}>
                <span
                  className='block text-xs uppercase tracking-widest font-semibold mb-0.5'
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {label}
                </span>
                <span className='text-sm' style={{ color: 'var(--text-primary)' }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recipes using this variety */}
      <section>
        <h2 className='text-xl font-bold mb-4' style={{ color: 'var(--text-primary)' }}>
          {t('coffeeVarieties.recipesUsing').replace('{name}', variety.name)}
        </h2>

        {recipes.length === 0
          ? (
            <p style={{ color: 'var(--text-tertiary)' }}>
              {t('coffeeVarieties.noRecipes')}
            </p>
          )
          : (
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
              {recipes.map((r) => <RecipeCard key={r.id} recipe={r} version={r.versions[0]} />)}
            </div>
          )}
      </section>
    </div>
  );
}
