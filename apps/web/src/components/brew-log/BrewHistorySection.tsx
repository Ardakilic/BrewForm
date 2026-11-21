import { useEffect } from 'react';
import { Link, useFetcher } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { type recipeBrewLogsLoader, recipeBrewLogsPath } from '../../routes/resources/brew-logs.ts';
import { createLogger } from '../../utils/logger.ts';
import { BrewLogCard } from './BrewLogCard.tsx';

const log = createLogger('BrewHistorySection');

/** Props for {@link BrewHistorySection}. */
interface BrewHistorySectionProps {
  recipeId: string;
  currentVersionId: string | null;
}

/**
 * Recipe-scoped brew history: the viewer's five most recent brew logs for the
 * recipe, a "Brew Again" link to the create form (prefilled with the current
 * version), and an empty state. The logs are read with a fetcher from the
 * `resources/brew-logs/recipe/:recipeId` resource route (a new recipe id cancels
 * the previous load); while loading, and when the load fails, no items render.
 */
export function BrewHistorySection({ recipeId, currentVersionId }: BrewHistorySectionProps) {
  const { t } = useTranslation();
  const { load, data } = useFetcher<typeof recipeBrewLogsLoader>();
  const logs = data?.ok ? data.logs : null;

  useEffect(() => {
    log.debug({ recipeId }, 'BrewHistorySection loading history');
    void load(recipeBrewLogsPath(recipeId));
  }, [load, recipeId]);

  const brewAgainQuery = currentVersionId
    ? `recipeId=${recipeId}&recipeVersionId=${currentVersionId}`
    : `recipeId=${recipeId}`;

  return (
    <section className="card" data-testid="brew-history-section">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          {t('brewLog.history.title')}
        </h2>
        <Link
          to={`/brew-logs/new?${brewAgainQuery}`}
          className="btn-secondary text-sm print-hidden"
        >
          {t('brewLog.history.brewAgain')}
        </Link>
      </div>

      {logs === null ? null : logs.length === 0 ? (
        <p style={{ color: 'var(--text-tertiary)' }}>{t('brewLog.history.empty')}</p>
      ) : (
        <div className="space-y-3">
          {logs.map((entry) => (
            <BrewLogCard key={entry.id} log={entry} showRecipe={false} />
          ))}
        </div>
      )}
    </section>
  );
}
