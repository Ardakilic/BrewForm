import type { ReactNode } from 'react';

interface FieldProps {
  /** Label content — a translated string, or rich content (e.g. an "optional" hint). */
  label: ReactNode;
  required?: boolean;
  /** Explicit label/control association — pass the control's `id` here and on the control. */
  htmlFor?: string;
  /** Field-level error message rendered beneath the control (`text-xs` + `var(--error)`). */
  error?: string;
  /** Help text rendered beneath the control (`text-xs` + `var(--text-tertiary)`). */
  help?: string;
  children: ReactNode;
}

/**
 * Form field layout primitive. Renders a `<label>` (with optional required
 * indicator) wrapping the field children, plus optional `error`/`help` lines.
 * Association with the control is implicit (wrapping) or explicit via
 * `htmlFor` + a matching `id` on the control. The `label` prop is already
 * translated by the caller (this component does not call `t()`).
 */
export function Field({ label, required, htmlFor, error, help, children }: FieldProps) {
  return (
    <label
      className='block mb-1'
      htmlFor={htmlFor}
      style={{ color: 'var(--text-secondary)' }}
    >
      <span className='label-text text-sm font-medium'>
        {label}
        {required && ' *'}
      </span>
      {children}
      {error && (
        <span className='block text-xs mt-1' style={{ color: 'var(--error)' }}>{error}</span>
      )}
      {help && (
        <span className='block text-xs mt-1' style={{ color: 'var(--text-tertiary)' }}>
          {help}
        </span>
      )}
    </label>
  );
}
