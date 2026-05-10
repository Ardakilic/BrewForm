interface IntensityDotsProps {
  intensity: number; // 1, 2, or 3
  className?: string;
}

/**
 * Renders 3 dot slots filled up to `intensity`.
 * Filled dots use --accent-primary; empty dots use a muted border.
 */
export function IntensityDots({ intensity, className }: IntensityDotsProps) {
  return (
    <div
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}
      aria-label={`Intensity ${intensity} of 3`}
    >
      {Array.from({ length: 3 }, (_, i) => {
        const filled = i < intensity;
        return (
          <span
            key={i}
            aria-hidden='true'
            style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: filled ? 'var(--accent-primary)' : 'transparent',
              border: filled ? 'none' : '1px solid var(--text-tertiary)',
              flexShrink: 0,
            }}
          />
        );
      })}
    </div>
  );
}
