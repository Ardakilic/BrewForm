import { useEffect } from 'react';
import { useLoaderData } from 'react-router';
import { TypeBadge } from '../../components/catalog/TypeBadge.tsx';
import { RecipeCard } from '../../components/recipe-list/RecipeCard.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { Breadcrumb } from '../../components/ui/Breadcrumb.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '../../utils/logger.ts';
import type { loader } from './EquipmentDetailPage.data.ts';

const log = createLogger('EquipmentDetailPage');

/**
 * Displays a single equipment item's details, description, and associated recipes. The data
 * comes from the `/equipment/:id` route loader (`EquipmentDetailPage.data.ts`): an unknown id
 * renders the not-found page and any other failure the route error state, so the page never
 * shows a previous item's data under a new URL.
 */
export function EquipmentDetailPage() {
  const { equipment, recipes } = useLoaderData<typeof loader>();
  const { t } = useTranslation();

  useEffect(() => {
    log.debug({}, 'EquipmentDetailPage mounted');
    return () => {
      log.debug({}, 'EquipmentDetailPage unmounted');
    };
  }, []);

  const displayTitle = [equipment.brand, equipment.model || equipment.name]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <SEOHead
        title={displayTitle}
        description={
          equipment.description ||
          [equipment.brand, equipment.type ? equipment.type.replace(/_/g, ' ') : '']
            .filter(Boolean)
            .join(' ') ||
          undefined
        }
        canonical={`${globalThis.location.origin}/equipment/${equipment.id}`}
      />

      {/* Breadcrumb */}
      <div className="mb-4">
        <Breadcrumb
          items={[
            { label: t('equipment.catalog.title'), to: '/equipments' },
            { label: displayTitle },
          ]}
        />
      </div>

      {/* Type badge */}
      {equipment.type && (
        <div className="mb-2">
          <TypeBadge label={equipment.type.replace(/_/g, ' ')} />
        </div>
      )}

      {/* Title */}
      {equipment.brand && (
        <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          {equipment.brand}
        </p>
      )}
      <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
        {equipment.model || equipment.name}
      </h1>

      {/* Description */}
      {equipment.description && (
        <div className="card mt-4">
          <p className="text-sm" style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            {equipment.description}
          </p>
        </div>
      )}

      {/* Recipes using this equipment */}
      <section className="mt-8">
        <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          {t('equipment.recipesUsing')}
        </h2>

        {recipes.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)' }}>{t('equipment.noRecipes')}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recipes.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
