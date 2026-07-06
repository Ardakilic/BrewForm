import type { ReactNode } from 'react';

interface SectionProps {
  title: string;
  children: ReactNode;
}

/**
 * Form section layout primitive. Renders a `<div className='card'>` wrapper
 * with a section heading. The `title` prop is already translated by the caller
 * (this component does not call `t()`).
 */
export function Section({ title, children }: SectionProps) {
  return (
    <div className='card'>
      <h2 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>{title}</h2>
      {children}
    </div>
  );
}
