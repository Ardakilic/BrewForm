import type { ReactNode } from 'react';

interface OwnedItemCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  onDelete: () => void;
  deleteLabel: string;
}

export function OwnedItemCard(
  { title, subtitle, meta, onDelete, deleteLabel }: OwnedItemCardProps,
) {
  return (
    <div className='card'>
      <div className='flex items-start justify-between'>
        <div>
          <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>
            {title}
          </h3>
          {subtitle}
          {meta && (
            <div className='flex gap-2 mt-1 text-xs' style={{ color: 'var(--text-tertiary)' }}>
              {meta}
            </div>
          )}
        </div>
        <button
          type='button'
          onClick={onDelete}
          className='text-sm'
          style={{ color: 'var(--error)' }}
        >
          {deleteLabel}
        </button>
      </div>
    </div>
  );
}
