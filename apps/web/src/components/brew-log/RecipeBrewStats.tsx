import { useEffect } from 'react';
import { useFetcher } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import {
  type recipeBrewStatsLoader,
  recipeBrewStatsPath,
} from '../../routes/resources/brew-logs.ts';
import { formatDecimal } from '../../utils/format.ts';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('RecipeBrewStats');

/** Props for {@link RecipeBrewStats}. */
interface RecipeBrewStatsProps {
  recipeId: string;
}

/**
 * Inline brew stats for one recipe: the viewer's brew count and average
 * personal rating (one locale-formatted decimal plus "/10" — the ten-point
 * scale carries no star glyph; rating hidden when null). The stats are read
 * with a fetcher from the `resources/brew-logs/stats/:recipeId` resource route.
 * Renders nothing while loading, on error, or before the first brew.
 */
export function RecipeBrewStats({ recipeId }: RecipeBrewStatsProps) {
  const { t, locale } = useTranslation();
  const { load, data } = useFetcher<typeof recipeBrewStatsLoader>();
  const stats = data?.ok ? data.stats : null;

  useEffect(() => {
    log.debug({ recipeId }, 'RecipeBrewStats loading stats');
    void load(recipeBrewStatsPath(recipeId));
  }, [load, recipeId]);

  if (!stats || stats.brewCount === 0) return null;

  return (
    <div data-testid="recipe-brew-stats">
      <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
        {t('brewLog.stats.totalBrews')}
      </p>
      <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
        {stats.brewCount}
      </p>
      {stats.avgBrewRating !== null && (
        <>
          <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
            {t('brewLog.stats.avgRating')}
          </p>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {formatDecimal(stats.avgBrewRating, locale, 1)}/10
          </p>
        </>
      )}
    </div>
  );
}
