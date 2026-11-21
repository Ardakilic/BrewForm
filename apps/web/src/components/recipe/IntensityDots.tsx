import { clamp } from '../../utils/chart/index.ts';
import { useSafeT } from '../../utils/safe-translation.ts';

interface IntensityDotsProps {
  intensity: number; // 1, 2, or 3
  className?: string;
}

/** Number of dot slots (the maximum intensity). */
const MAX_INTENSITY = 3;

/**
 * Renders 3 dot slots filled up to `intensity`.
 * Filled dots use --accent-primary; empty dots use a muted border.
 *
 * The intensity is rounded and clamped to an integer in `[0, 3]` (`NaN` → 0)
 * for both the filled-dot count and the accessible label, so out-of-range
 * props never announce "Intensity 5 of 3" or "Intensity NaN of 3".
 */
export function IntensityDots({ intensity, className }: IntensityDotsProps) {
  const t = useSafeT();
  const level = Math.round(clamp(intensity, 0, MAX_INTENSITY));
  return (
    <div
      className={className}
      role="img"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}
      aria-label={t('a11y.intensity').replace('{intensity}', String(level))}
    >
      {[0, 1, 2].map((slot) => {
        const filled = slot < level;
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
