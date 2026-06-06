import type { ReactNode } from 'react';

/**
 * Renders a labelled wrapper around an inline form control (input,
 * select, etc.) for the recipe-list filter sidebar.
 */
export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label
        className='block text-sm font-medium mb-1'
        style={{ color: 'var(--text-secondary)' }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
