import { useState } from 'react';

interface Props {
  /** Current rating value 1–10 (5 stars, each star = 2 points, half-star = 1 point) */
  value: number | null;
  /** Number of community ratings to display below the stars */
  count?: number;
  /** Called with a 1–10 value when the user clicks a star or half-star */
  onRate?: (rating: number) => void;
  /** When false the stars are display-only (no hover/click). Default: true */
  interactive?: boolean;
}

const STARS = 5;
const STAR_PATH =
  'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';

/** Single star SVG — supports full, half, and empty fill states */
function Star({ index, activeValue }: { index: number; activeValue: number }) {
  // Star `index` (1-based) covers values (2i-1) and 2i on the 1–10 scale.
  const isFull = activeValue >= index * 2;
  const isHalf = !isFull && activeValue >= index * 2 - 1;

  return (
    <svg
      viewBox='0 0 24 24'
      width='28'
      height='28'
      className='block overflow-visible'
    >
      {/* Empty / outline */}
      <path
        d={STAR_PATH}
        fill='var(--bg-tertiary)'
        stroke='var(--text-tertiary)'
        strokeWidth='1.2'
        strokeLinejoin='round'
      />
      {/* Half fill — clip right half */}
      {isHalf && (
        <path
          d={STAR_PATH}
          fill='#f5a623'
          stroke='none'
          style={{ clipPath: 'inset(0 50% 0 0)' }}
        />
      )}
      {/* Full fill */}
      {isFull && <path d={STAR_PATH} fill='#f5a623' stroke='none' />}
    </svg>
  );
}

/**
 * Five-star rating display on a 1–10 half-star scale with hover
 * preview and optional community-vote count; clicking reports the
 * hovered value via `onRate` when `interactive`.
 */
export function StarRating({ value, count, onRate, interactive = true }: Props) {
  const [hovered, setHovered] = useState(0);

  /** Compute the 1–10 value from a mouse event over a star element */
  function valueFromEvent(e: React.MouseEvent<HTMLDivElement>, starIndex: number): number {
    const rect = e.currentTarget.getBoundingClientRect();
    const isLeftHalf = e.clientX - rect.left < rect.width / 2;
    return isLeftHalf ? starIndex * 2 - 1 : starIndex * 2;
  }

  const displayValue = hovered > 0 ? hovered : (value ?? 0);

  /** Convert 1–10 to a "N.N★" label, dropping the decimal if it's .0 */
  function label(v: number): string {
    const stars = v / 2;
    return `${stars % 1 === 0 ? stars.toFixed(0) : stars.toFixed(1)}★`;
  }

  return (
    <div>
      <div
        className={`flex items-center gap-1 ${
          interactive ? 'cursor-pointer' : 'cursor-default'
        } select-none`}
        onMouseLeave={() => interactive && setHovered(0)}
      >
        {Array.from({ length: STARS }, (_, i) => i + 1).map((starIndex) => (
          <div
            key={starIndex}
            className='leading-[0]'
            onMouseMove={(e) => interactive && setHovered(valueFromEvent(e, starIndex))}
            onClick={(e) => interactive && onRate?.(valueFromEvent(e, starIndex))}
          >
            <Star index={starIndex} activeValue={displayValue} />
          </div>
        ))}

        {/* Numeric label */}
        <span className='ml-1 text-sm font-medium tabular-nums text-[color:var(--text-secondary)] min-w-[2.5rem]'>
          {hovered > 0 ? label(hovered) : value ? label(value) : interactive ? '' : '—'}
        </span>
      </div>

      {/* Community count — always shown when prop is provided */}
      {count !== undefined && (
        <p className='text-xs mt-0.5 text-[color:var(--text-tertiary)]'>
          {count === 0
            ? 'No community votes yet'
            : `${count} community ${count === 1 ? 'vote' : 'votes'}`}
        </p>
      )}
    </div>
  );
}
