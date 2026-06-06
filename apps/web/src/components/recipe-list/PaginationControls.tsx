/** Props accepted by {@link PaginationControls}. */
interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  previousLabel: string;
  nextLabel: string;
  /** Page label containing `{page}` and `{total}` placeholders. */
  pageLabel: string;
}

/**
 * Renders Previous / current-page / Next pagination controls for the
 * recipe list. `pageLabel` is expanded by substituting the placeholders
 * `{page}` and `{total}` with the corresponding values.
 */
export function PaginationControls(
  { page, totalPages, onPageChange, previousLabel, nextLabel, pageLabel }: PaginationControlsProps,
) {
  return (
    <div className='flex justify-center gap-2 mt-8'>
      {page > 1 && (
        <button
          type='button'
          onClick={() => onPageChange(page - 1)}
          className='btn-secondary'
        >
          {previousLabel}
        </button>
      )}
      <span
        className='py-2 px-4 text-sm'
        style={{ color: 'var(--text-secondary)' }}
      >
        {pageLabel.replace('{page}', String(page)).replace('{total}', String(totalPages))}
      </span>
      {page < totalPages && (
        <button
          type='button'
          onClick={() => onPageChange(page + 1)}
          className='btn-secondary'
        >
          {nextLabel}
        </button>
      )}
    </div>
  );
}
