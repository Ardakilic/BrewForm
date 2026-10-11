import { useSafeT } from '../../utils/safe-translation.ts';

interface IntensityDotsProps {
  intensity: number; // 1, 2, or 3
  className?: string;
}

/**
 * Renders 3 dot slots filled up to `intensity`.
 * Filled dots use --accent-primary; empty dots use a muted border.
 */
export function IntensityDots({ intensity, className }: IntensityDotsProps) {
  const t = useSafeT();
  return (
    <div
      className={className}
      role="img"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}
      aria-label={t('a11y.intensity').replace('{intensity}', String(intensity))}
    >
      {[0, 1, 2].map((slot) => {
        const filled = slot < intensity;
        return (
          <span
            key={slot}
            aria-hidden="true"
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
