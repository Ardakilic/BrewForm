import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { brewLogApi } from '../../api/index.ts';
import type { BrewLogListItemOutput } from '@brewform/shared/schemas';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { BrewLogCard } from './BrewLogCard.tsx';

const HISTORY_PER_PAGE = 5;

/** Props for {@link BrewHistorySection}. */
interface BrewHistorySectionProps {
  recipeId: string;
  currentVersionId: string | null;
}

/**
 * Recipe-scoped brew history: the viewer's five most recent brew logs for the
 * recipe, a "Brew Again" link to the create form (prefilled with the current
 * version), and an empty state. Loading and fetch errors render no items.
 */
export function BrewHistorySection({ recipeId, currentVersionId }: BrewHistorySectionProps) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<BrewLogListItemOutput[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    brewLogApi.listForRecipe(recipeId, { page: 1, perPage: HISTORY_PER_PAGE })
      .then((response) => {
        if (!cancelled) setLogs(response.data);
      })
      .catch(() => {
        // ponytail: history is supplementary — swallow errors silently
      });
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  const brewAgainQuery = currentVersionId
    ? `recipeId=${recipeId}&recipeVersionId=${currentVersionId}`
    : `recipeId=${recipeId}`;

  return (
    <section className='card' data-testid='brew-history-section'>
      <div className='flex items-center justify-between mb-4'>
        <h2 className='text-lg font-semibold' style={{ color: 'var(--text-primary)' }}>
          {t('brewLog.history.title')}
        </h2>
        <Link
          to={`/brew-logs/new?${brewAgainQuery}`}
          className='btn-secondary text-sm'
        >
          {t('brewLog.history.brewAgain')}
        </Link>
      </div>

      {logs === null
        ? null
        : logs.length === 0
        ? <p style={{ color: 'var(--text-tertiary)' }}>{t('brewLog.history.empty')}</p>
        : (
          <div className='space-y-3'>
            {logs.map((entry) => <BrewLogCard key={entry.id} log={entry} showRecipe={false} />)}
          </div>
        )}
    </section>
  );
}
