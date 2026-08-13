import { Link } from 'react-router';
import type { BrewLogListItemOutput } from '@brewform/shared/schemas';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { formatDate } from '../../utils/format.ts';

const NOTES_EXCERPT_LENGTH = 120;

/** Props for {@link BrewLogCard}. */
interface BrewLogCardProps {
  log: BrewLogListItemOutput;
  /** When false, hides the recipe title link (e.g. inside a recipe-scoped list). */
  showRecipe?: boolean;
}

/**
 * Card displaying one brew-log entry: recipe title (link to the recipe),
 * brew date, actual yield/dose, personal rating, and a truncated notes excerpt.
 */
export function BrewLogCard({ log, showRecipe = true }: BrewLogCardProps) {
  const { t, locale } = useTranslation();

  const excerpt = log.notes && log.notes.length > NOTES_EXCERPT_LENGTH
    ? `${log.notes.slice(0, NOTES_EXCERPT_LENGTH)}…`
    : log.notes;

  return (
    <div className='card p-4'>
      <div className='flex items-center justify-between gap-2 mb-2'>
        {showRecipe && (
          <Link
            to={`/recipes/${log.recipeSlug}`}
            className='font-semibold truncate hover:underline'
            style={{ color: 'var(--text-primary)' }}
          >
            {log.recipeTitle}
          </Link>
        )}
        <span className='flex items-center gap-3 shrink-0'>
          <span className='text-sm' style={{ color: 'var(--text-tertiary)' }}>
            {formatDate(log.brewedAt, locale)}
          </span>
          <Link
            to={`/brew-logs/${log.id}/edit`}
            className='text-sm hover:underline'
            style={{ color: 'var(--accent-primary)' }}
          >
            {t('brewLog.card.edit')}
          </Link>
        </span>
      </div>
      <div
        className='flex flex-wrap gap-x-4 gap-y-1 text-sm'
        style={{ color: 'var(--text-secondary)' }}
      >
        {log.yieldActual !== null && (
          <span>
            {t('brewLog.card.yieldActual')}: {log.yieldActual} g
          </span>
        )}
        {log.doseActual !== null && (
          <span>
            {t('brewLog.card.doseActual')}: {log.doseActual} g
          </span>
        )}
        {log.personalRating !== null && (
          <span>
            {t('brewLog.card.rating')}: {log.personalRating}/10
          </span>
        )}
      </div>
      {excerpt && (
        <p className='text-sm mt-2' style={{ color: 'var(--text-secondary)' }}>
          <span className='font-medium'>{t('brewLog.card.notes')}:</span> {excerpt}
        </p>
      )}
    </div>
  );
}
