import { useTranslation } from '../../contexts/I18nContext.tsx';

/** Props accepted by {@link PaginationControls}. */
interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Override for the Previous button label; defaults to `t('common.previous')`. */
  previousLabel?: string;
  /** Override for the Next button label; defaults to `t('common.next')`. */
  nextLabel?: string;
  /** Override for the page label; defaults to `t('common.pagination')`. */
  pageLabel?: string;
  /**
   * `hide` (default) omits a boundary button; `disable` keeps both buttons
   * rendered but disabled on the first/last page.
   */
  variant?: 'hide' | 'disable';
  /** Whether to render the "Page X of Y" label between the buttons. */
  showPageLabel?: boolean;
}

/**
 * Renders Previous / current-page / Next pagination controls. The three label
 * props are optional overrides that default to the shared `common.*` i18n
 * strings. `pageLabel` is expanded by substituting `{page}` and `{total}`.
 */
export function PaginationControls(
  {
    page,
    totalPages,
    onPageChange,
    previousLabel,
    nextLabel,
    pageLabel,
    variant = 'hide',
    showPageLabel = true,
  }: PaginationControlsProps,
) {
  const { t } = useTranslation();
  const prevLabel = previousLabel ?? t('common.previous');
  const nextLabelText = nextLabel ?? t('common.next');
  const pageText = (pageLabel ?? t('common.pagination'))
    .replace('{page}', String(page))
    .replace('{total}', String(totalPages));

  const showPrev = variant === 'disable' || page > 1;
  const showNext = variant === 'disable' || page < totalPages;

  return (
    <div className='flex justify-center gap-2 mt-8'>
      {showPrev && (
        <button
          type='button'
          onClick={() => onPageChange(page - 1)}
          disabled={variant === 'disable' && page <= 1}
          className='btn-secondary'
        >
          {prevLabel}
        </button>
      )}
      {showPageLabel && (
        <span
          className='py-2 px-4 text-sm'
          style={{ color: 'var(--text-secondary)' }}
        >
          {pageText}
        </span>
      )}
      {showNext && (
        <button
          type='button'
          onClick={() => onPageChange(page + 1)}
          disabled={variant === 'disable' && page >= totalPages}
          className='btn-secondary'
        >
          {nextLabelText}
        </button>
      )}
    </div>
  );
}
