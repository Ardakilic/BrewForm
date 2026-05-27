// deno-lint-ignore-file require-await
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../../api/client.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { Skeleton } from '../../components/ui/Skeleton.tsx';

interface EquipmentDetail {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  type: string | null;
  description: string | null;
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

export function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [equipment, setEquipment] = useState<EquipmentDetail | null>(null);
  const [recipes, setRecipes] = useState<RecipeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(false);

    Promise.all([
      api.get<EquipmentDetail>(`/equipment/${id}`),
      api.get<{ data: RecipeEntry[] }>(`/equipment/${id}/recipes?perPage=6`),
    ])
      .then(([equipData, recipesData]) => {
        setEquipment(equipData);
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
        <Skeleton height='2rem' width='50%' />
        <Skeleton height='1rem' width='30%' />
        <Skeleton height='3rem' />
      </div>
    );
  }

  if (error || !equipment) {
    return (
      <div
        className='mx-auto max-w-4xl px-6 py-12 text-center'
        style={{ color: 'var(--text-tertiary)' }}
      >
        <h1 className='text-2xl font-bold mb-4' style={{ color: 'var(--text-primary)' }}>
          {t('equipment.error.notFound')}
        </h1>
        <Link to='/equipments' className='btn-primary'>
          {t('equipment.backToList')}
        </Link>
      </div>
    );
  }

  const displayTitle = [equipment.brand, equipment.model || equipment.name]
    .filter(Boolean)
    .join(' ');

  return (
    <div className='mx-auto max-w-4xl px-6 py-8'>
      <SEOHead title={displayTitle} />

      {/* Breadcrumb */}
      <nav aria-label='Breadcrumb' className='mb-4'>
        <ol
          className='flex items-center gap-1 flex-wrap text-xs'
          style={{ color: 'var(--text-tertiary)' }}
        >
          <li>
            <Link
              to='/equipments'
              className='transition-colors'
              style={{ color: 'var(--text-secondary)' }}
            >
              {t('equipment.catalog.title')}
            </Link>
          </li>
          <li aria-hidden='true' className='select-none'>›</li>
          <li aria-current='page' style={{ color: 'var(--text-secondary)' }}>
            {equipment.brand && <span className='font-medium'>{equipment.brand}</span>}
            {equipment.model || equipment.name}
          </li>
        </ol>
      </nav>

      {/* Type badge */}
      {equipment.type && (
        <span
          className='inline-block text-xs px-2 py-0.5 rounded-full mb-2'
          style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
        >
          {equipment.type.replace(/_/g, ' ')}
        </span>
      )}

      {/* Title */}
      {equipment.brand && (
        <p className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>
          {equipment.brand}
        </p>
      )}
      <h1 className='text-2xl font-semibold mb-1' style={{ color: 'var(--text-primary)' }}>
        {equipment.model || equipment.name}
      </h1>

      {/* Description */}
      {equipment.description && (
        <div className='card mt-4'>
          <p className='text-sm' style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            {equipment.description}
          </p>
        </div>
      )}

      {/* Recipes using this equipment */}
      <section className='mt-8'>
        <h2 className='text-xl font-bold mb-4' style={{ color: 'var(--text-primary)' }}>
          {t('equipment.recipesUsing')}
        </h2>

        {recipes.length === 0
          ? (
            <p style={{ color: 'var(--text-tertiary)' }}>
              {t('equipment.noRecipes')}
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
                      by {r.author.displayName || r.author.username}
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
