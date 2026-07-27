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
import type { EquipmentOutput, RecipeWithAuthorOutput } from '@brewform/shared/schemas';

const log = createLogger('EquipmentDetailPage');

/** Displays a single equipment item's details, description, and associated recipes. */
export function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [equipment, setEquipment] = useState<EquipmentOutput | null>(null);
  const [recipes, setRecipes] = useState<RecipeWithAuthorOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    log.debug({}, 'EquipmentDetailPage mounted');
    return () => {
      log.debug({}, 'EquipmentDetailPage unmounted');
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
      api.get<EquipmentOutput>(`/equipment/${id}`),
      api.get<{ data: RecipeWithAuthorOutput[] }>(`/equipment/${id}/recipes?perPage=6`),
    ])
      .then(([equipData, recipesData]) => {
        setEquipment(equipData);
        const items = Array.isArray(recipesData?.data)
          ? recipesData.data
          : (Array.isArray(recipesData) ? recipesData : []);
        setRecipes(items);
      })
      .catch((err) => {
        log.error({ err }, 'EquipmentDetailPage loadData failed');
        setError(true);
      })
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
      <SEOHead
        title={displayTitle}
        description={equipment.description ||
          [equipment.brand, equipment.type ? equipment.type.replace(/_/g, ' ') : '']
            .filter(Boolean).join(' ') ||
          undefined}
        canonical={`${globalThis.location.origin}/equipment/${equipment.id}`}
      />

      {/* Breadcrumb */}
      <div className='mb-4'>
        <Breadcrumb
          items={[
            { label: t('equipment.catalog.title'), to: '/equipments' },
            { label: displayTitle },
          ]}
        />
      </div>

      {/* Type badge */}
      {equipment.type && (
        <div className='mb-2'>
          <TypeBadge label={equipment.type.replace(/_/g, ' ')} />
        </div>
      )}

      {/* Title */}
      {equipment.brand && (
        <p className='text-lg font-bold' style={{ color: 'var(--text-primary)' }}>
          {equipment.brand}
        </p>
      )}
      <h1 className='text-2xl font-bold mb-1' style={{ color: 'var(--text-primary)' }}>
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
              {recipes.map((r) => <RecipeCard key={r.id} recipe={r} />)}
            </div>
          )}
      </section>
    </div>
  );
}
