/** Props accepted by {@link ErrorState}. */
interface ErrorStateProps {
  /**
   * The error message. Messages containing newlines are rendered as a
   * bulleted list (one item per non-empty line).
   */
  message: string;
  /** Extra classes appended to the banner (e.g. `mt-4` or `mb-4`). */
  className?: string;
}

/**
 * Standard themed error banner: `role='alert'` so screen readers announce it,
 * tinted with the `--error-bg`/`--error` theme vars (defined per theme in
 * globals.css) and edged with a subtle error-colored border.
 */
export function ErrorState({ message, className = '' }: ErrorStateProps) {
  const lines = message.split('\n').filter((line) => line !== '');
  return (
    <div
      role='alert'
      className={`rounded p-3 text-sm ${className}`.trim()}
      style={{
        backgroundColor: 'var(--error-bg)',
        color: 'var(--error)',
        border: '1px solid color-mix(in srgb, var(--error) 30%, transparent)',
      }}
    >
      {lines.length > 1
        ? (
          <ul className='list-disc pl-4 space-y-1'>
            {lines.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        )
        : message}
    </div>
  );
}
