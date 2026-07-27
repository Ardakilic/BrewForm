import type { ReactNode } from 'react';

/** Props accepted by {@link EmptyState}. */
interface EmptyStateProps {
  /** The empty-state message. */
  message: string;
  /** Optional action rendered beneath the message (e.g. a clear-filters button). */
  action?: ReactNode;
}

/**
 * Standard centered empty-state block: `text-center py-12` with tertiary text.
 * An optional `action` (button/link) is rendered below the message.
 */
export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className='text-center py-12' style={{ color: 'var(--text-tertiary)' }}>
      <p className={action ? 'mb-2' : undefined}>{message}</p>
      {action}
    </div>
  );
}
