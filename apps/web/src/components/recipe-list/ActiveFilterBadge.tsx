import { useSafeT } from '../../utils/safe-translation.ts';

/**
 * Renders a removable active-filter badge for the recipe-list sidebar.
 *
 * The badge surfaces the filter's `label`, its current `value`, and a
 * small `✕` button that invokes `onRemove` when clicked.
 */
export function ActiveFilterBadge(
  { label, value, onRemove }: { label: string; value: string; onRemove: () => void },
) {
  const t = useSafeT();
  return (
    <div>
      <span
        className='block text-xs font-medium mb-1'
        style={{ color: 'var(--text-secondary)' }}
      >
        {label}
      </span>
      <div className='flex items-center gap-2'>
        <span
          className='text-sm truncate'
          style={{ color: 'var(--text-primary)' }}
        >
          {value}
        </span>
        <button
          type='button'
          onClick={onRemove}
          className='text-xs flex-shrink-0'
          style={{ color: 'var(--text-tertiary)' }}
          aria-label={t('a11y.filter.remove').replace('{label}', label)}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
