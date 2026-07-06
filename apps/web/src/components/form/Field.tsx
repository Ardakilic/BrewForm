import type { ReactNode } from 'react';

interface FieldProps {
  label: string;
  required?: boolean;
  children: ReactNode;
}

/**
 * Form field layout primitive. Renders a `<label>` (with optional required
 * indicator) followed by the field children. The `label` prop is already
 * translated by the caller (this component does not call `t()`).
 */
export function Field({ label, required, children }: FieldProps) {
  return (
    <div>
      <label className='block text-sm font-medium mb-1' style={{ color: 'var(--text-secondary)' }}>
        {label}
        {required && ' *'}
      </label>
      {children}
    </div>
  );
}
