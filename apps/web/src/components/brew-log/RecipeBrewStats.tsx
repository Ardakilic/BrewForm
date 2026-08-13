import { useEffect, useState } from 'react';
import { brewLogApi } from '../../api/index.ts';
import type { RecipeBrewStatsOutput } from '@brewform/shared/schemas';
import { useTranslation } from '../../contexts/I18nContext.tsx';

/** Props for {@link RecipeBrewStats}. */
interface RecipeBrewStatsProps {
  recipeId: string;
}

/**
 * Inline brew stats for one recipe: the viewer's brew count and average
 * personal rating (one decimal, "/10"; rating hidden when null). Renders
 * nothing while loading, on error, or before the first brew.
 */
export function RecipeBrewStats({ recipeId }: RecipeBrewStatsProps) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<RecipeBrewStatsOutput | null>(null);

  useEffect(() => {
    let cancelled = false;
    brewLogApi.getRecipeStats(recipeId)
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch(() => {
        // ponytail: stats are decorative — swallow errors silently
      });
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  if (!stats || stats.brewCount === 0) return null;

  return (
    <div data-testid='recipe-brew-stats'>
      <p className='text-xs mb-1' style={{ color: 'var(--text-tertiary)' }}>
        {t('brewLog.stats.totalBrews')}
      </p>
      <p className='text-sm font-medium mb-2' style={{ color: 'var(--text-primary)' }}>
        {stats.brewCount}
      </p>
      {stats.avgBrewRating !== null && (
        <>
          <p className='text-xs mb-1' style={{ color: 'var(--text-tertiary)' }}>
            {t('brewLog.stats.avgRating')}
          </p>
          <p className='text-sm font-medium' style={{ color: 'var(--text-primary)' }}>
            {stats.avgBrewRating.toFixed(1)}/10
          </p>
        </>
      )}
    </div>
  );
}
