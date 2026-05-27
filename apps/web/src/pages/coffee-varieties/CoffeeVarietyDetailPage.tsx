// deno-lint-ignore-file require-await
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../../api/client.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { Skeleton } from '../../components/ui/Skeleton.tsx';

interface VarietyDetail {
  id: string;
  name: string;
  species: string | null;
  category: string | null;
  origin: string | null;
  altitude: string | null;
  cupProfile: string | null;
  body: string | null;
  acidity: string | null;
  caffeine: string | null;
  diseaseResistance: string | null;
  yield: string | null;
  plantSize: string | null;
  spread: string | null;
  notes: string | null;
  fermentation: string | null;
  dryingTime: string | null;
  processingCompatibility: string | null;
  subVarieties: string | null;
  slug: string;
}

interface RecipeEntry {
  id: string;
  slug: string;
  title: string;
  author?: { username: string; displayName: string | null };
  currentVersion?: { brewMethod: string; drinkType: string; rating: number | null };
  likeCount: number;
  commentCount: number;
}

export function CoffeeVarietyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [variety, setVariety] = useState<VarietyDetail | null>(null);
  const [recipes, setRecipes] = useState<RecipeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);

    Promise.all([
      api.get<VarietyDetail>(`/coffee-varieties/${id}`),
      api.get<{ data: RecipeEntry[] }>(`/coffee-varieties/${id}/recipes?perPage=6`),
    ])
      .then(([varietyData, recipesData]) => {
        setVariety(varietyData);
        const items = Array.isArray(recipesData?.data)
          ? recipesData.data
          : (Array.isArray(recipesData) ? recipesData : []);
        setRecipes(items);
      })
      .catch(() => setError(true))
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
    [t('coffeeVarieties.fields.altitude'), variety.altitude],
    [t('coffeeVarieties.fields.cupProfile'), variety.cupProfile],
    [t('coffeeVarieties.fields.body'), variety.body],
    [t('coffeeVarieties.fields.acidity'), variety.acidity],
    [t('coffeeVarieties.fields.caffeine'), variety.caffeine],
    [t('coffeeVarieties.fields.diseaseResistance'), variety.diseaseResistance],
    [t('coffeeVarieties.fields.yield'), variety.yield],
    [t('coffeeVarieties.fields.plantSize'), variety.plantSize],
    [t('coffeeVarieties.fields.spread'), variety.spread],
    [t('coffeeVarieties.fields.notes'), variety.notes],
    [t('coffeeVarieties.fields.fermentation'), variety.fermentation],
    [t('coffeeVarieties.fields.dryingTime'), variety.dryingTime],
    [t('coffeeVarieties.fields.processingCompatibility'), variety.processingCompatibility],
    [t('coffeeVarieties.fields.subVarieties'), variety.subVarieties],
  ] as [string, string | null][]).filter(([, v]) => v != null && v !== '');

  return (
    <div className='mx-auto max-w-4xl px-6 py-8'>
      <SEOHead title={variety.name} />

      {/* Breadcrumb */}
      <nav aria-label='Breadcrumb' className='mb-4'>
        <ol
          className='flex items-center gap-1 flex-wrap text-xs'
          style={{ color: 'var(--text-tertiary)' }}
        >
          <li>
            <Link
              to='/coffee-varieties'
              className='transition-colors'
              style={{ color: 'var(--text-secondary)' }}
            >
              {t('coffeeVarieties.title')}
            </Link>
          </li>
          <li aria-hidden='true' className='select-none'>›</li>
          <li aria-current='page' style={{ color: 'var(--text-secondary)' }}>{variety.name}</li>
        </ol>
      </nav>

      {/* Category badge */}
      {variety.category && (
        <span
          className='inline-block text-xs px-2 py-0.5 rounded-full mb-2'
          style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
        >
          {variety.category === 'variety'
            ? t('coffeeVarieties.category.varietyDetail')
            : variety.category === 'processing'
            ? t('coffeeVarieties.category.processingDetail')
            : variety.category === 'market_name'
            ? t('coffeeVarieties.category.marketNameDetail')
            : variety.category}
        </span>
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
              {recipes.map((r) => (
                <Link
                  key={r.id}
                  to={`/recipes/${r.slug}`}
                  className='card hover:shadow-lg transition-shadow'
                >
                  <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>
                    {r.title}
                  </h3>
                  {r.author && (
                    <p className='mt-1 text-sm' style={{ color: 'var(--text-secondary)' }}>
                      {t('recipe.focusMode.by')} {r.author.displayName || r.author.username}
                    </p>
                  )}
                  {r.currentVersion && (
                    <div
                      className='mt-1 flex flex-wrap gap-1 text-xs'
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      <span>{r.currentVersion.brewMethod.replace(/_/g, ' ')}</span>
                      <span>•</span>
                      <span>{r.currentVersion.drinkType.replace(/_/g, ' ')}</span>
                      {r.currentVersion.rating && <span>• ★ {r.currentVersion.rating}</span>}
                    </div>
                  )}
                  <div
                    className='mt-2 flex items-center gap-2 text-xs'
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    <span>❤️ {r.likeCount}</span>
                    <span>💬 {r.commentCount}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
      </section>
    </div>
  );
}
