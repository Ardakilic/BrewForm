import { type KeyboardEvent, type MouseEvent, type ReactNode, useId, useState } from 'react';
import { clamp, sanitizeNumber } from '../../utils/chart/index.ts';
import { formatDecimal } from '../../utils/format.ts';
import { useSafeLocale, useSafeT } from '../../utils/safe-translation.ts';

interface Props {
  /** Current rating value 1–10 (5 stars, each star = 2 points, half-star = 1 point) */
  value: number | null;
  /** Number of community ratings to display below the stars */
  count?: number;
  /** Called with a 1–10 value when the user commits a rating (key, click or blur) */
  onRate?: (rating: number) => void;
  /** When false the stars are a read-only labelled image. Default: true */
  interactive?: boolean;
  /** A submission is in flight: the slider keeps focus but is `aria-disabled` and ignores input */
  busy?: boolean;
  /**
   * The latest submission result (the fetcher's `data`). Each new result seen while not `busy`
   * means a submission settled: the committed value is dropped and the saved `value` shows.
   */
  result?: unknown;
  /** Accessible name of the interactive slider (default: the "Rating" label) */
  label?: string;
}

const STARS = 5;
const MAX_VALUE = 10;
const STAR_PATH =
  'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';

/**
 * Normalizes a stored rating for display: sanitized, clamped to `[1, 10]` and
 * rounded to the nearest half star; `null`, non-finite and ≤ 0 values become
 * `0` (not rated).
 *
 * @param value - The raw 1–10 rating.
 * @returns An integer in `[1, 10]`, or `0` for not rated.
 */
function normalizeRating(value: unknown): number {
  const v = sanitizeNumber(value, 0);
  if (v <= 0) return 0;
  return Math.round(clamp(v, 1, MAX_VALUE));
}

/** Next whole star above `v` (snapping a half star up), capped at 5 stars. */
function wholeStarUp(v: number): number {
  if (v <= 0) return 2;
  return Math.min(MAX_VALUE, v % 2 === 1 ? v + 1 : v + 2);
}

/** Next whole star below `v` (snapping a half star down), never below the minimum. */
function wholeStarDown(v: number): number {
  if (v <= 2) return v;
  return v % 2 === 1 ? v - 1 : v - 2;
}

/** Single star SVG — supports full, half, and empty fill states via `--rating-star`. */
function Star({ index, activeValue }: { index: number; activeValue: number }) {
  // Star `index` (1-based) covers values (2i-1) and 2i on the 1–10 scale.
  const fill = activeValue >= index * 2 ? 'full' : activeValue >= index * 2 - 1 ? 'half' : 'empty';

  return (
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      className="block"
      aria-hidden="true"
      data-fill={fill}
    >
      {/* Empty / outline */}
      <path
        d={STAR_PATH}
        fill="var(--bg-tertiary)"
        stroke="var(--text-tertiary)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* Half fill — clip right half */}
      {fill === 'half' && (
        <path
          d={STAR_PATH}
          fill="var(--rating-star)"
          stroke="none"
          style={{ clipPath: 'inset(0 50% 0 0)' }}
        />
      )}
      {/* Full fill */}
      {fill === 'full' && <path d={STAR_PATH} fill="var(--rating-star)" stroke="none" />}
    </svg>
  );
}

/** The five stars for a 1–10 value, each wrapped for pointer hit-testing. */
function Stars({ activeValue }: { activeValue: number }) {
  return (
    <>
      {Array.from({ length: STARS }, (_, i) => i + 1).map((starIndex) => (
        <span key={starIndex} data-star={starIndex} className="leading-[0]">
          <Star index={starIndex} activeValue={activeValue} />
        </span>
      ))}
    </>
  );
}

/** A keyboard draft: the pending value, the saved value it was based on, and whether it is uncommitted. */
interface Draft {
  value: number;
  base: number;
  dirty: boolean;
}

/**
 * Five-star rating on the stored 1–10 half-star scale.
 *
 * - Read-only (`interactive={false}`): one `role="img"` named "Rated N out of
 *   5 stars" (or "Not rated") with aria-hidden stars and a localized numeric
 *   label; fill and label derive from the same rounded value.
 * - Interactive: one focusable `role="slider"` (0–10, 0 = not rated). Arrows
 *   move ±1 whole star, Shift+arrows ±½ star, digits 1–5 pick a star,
 *   Home/End pick ½ and 5 stars; Enter/Space commit, Escape reverts, and blur
 *   commits an uncommitted value once. Pointer hover previews and a click
 *   commits the half or whole star under the pointer. While `busy`, the
 *   slider keeps focus with `aria-disabled="true"` and ignores input.
 * - A committed value is shown while its submission is pending; each new
 *   `result` seen while not `busy` drops the committed draft, so a failed
 *   submission shows the saved rating again (the rollback) and a successful
 *   one shows the new saved value from the parent. Keying on the result's
 *   identity, not on a `busy` true → false render, also catches a failure that
 *   settles before a busy render was committed (router updates are
 *   transitions, so React may skip the intermediate state).
 */
export function StarRating({
  value,
  count,
  onRate,
  interactive = true,
  busy = false,
  result,
  label,
}: Props) {
  const t = useSafeT();
  const locale = useSafeLocale();
  const hintId = useId();
  const [hovered, setHovered] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  // "Store information from previous renders": a new result while idle means a submission
  // settled, so drop the committed draft and show the saved value (rolled back after a failure).
  // A result that arrives while still busy (the fetcher revalidating) waits for idle.
  const [settledResult, setSettledResult] = useState(result);
  if (!busy && result !== settledResult) {
    setSettledResult(result);
    setDraft((d) => (d && !d.dirty ? null : d));
  }

  const saved = normalizeRating(value);
  /** Formats a 1–10 value as stars with the locale separator (7 → "3.5"). */
  const stars = (v: number) => formatDecimal(v / 2, locale, 1);

  const countLine: ReactNode =
    count !== undefined ? (
      <p className="text-xs mt-0.5 text-[color:var(--text-secondary)]">
        {count === 0
          ? t('recipe.rating.noVotes')
          : t('recipe.rating.voteCount').replace('{count}', String(count))}
      </p>
    ) : null;

  if (!interactive) {
    const name =
      saved > 0
        ? t('a11y.rating.value').replace('{value}', stars(saved))
        : t('a11y.rating.notRated');
    return (
      <div>
        <div
          role="img"
          aria-label={name}
          className="flex flex-wrap items-center gap-1 cursor-default select-none"
        >
          <Stars activeValue={saved} />
          <span
            aria-hidden="true"
            className="ml-1 text-sm font-medium tabular-nums text-[color:var(--text-secondary)]"
          >
            {saved > 0 ? stars(saved) : '—'}
          </span>
        </div>
        {countLine}
      </div>
    );
  }

  // A draft only applies while the saved value it was based on is unchanged.
  const active = draft && draft.base === saved ? draft : null;
  const current = active?.value ?? saved;
  const displayValue = hovered > 0 ? hovered : current;

  /** Commits the pending keyboard value once. */
  function commit() {
    if (!active?.dirty || active.value <= 0) return;
    onRate?.(active.value);
    setDraft({ ...active, dirty: false });
  }

  /** Handles the slider keys (ignored while busy). */
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (busy) return;
    let next: number;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = e.shiftKey ? Math.min(MAX_VALUE, Math.max(1, current + 1)) : wholeStarUp(current);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = e.shiftKey ? Math.max(1, current - 1) : wholeStarDown(current);
        break;
      case 'Home':
        next = 1;
        break;
      case 'End':
        next = MAX_VALUE;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit();
        return;
      case 'Escape':
        if (active) {
          e.preventDefault();
          setDraft(null);
        }
        return;
      default:
        if (!/^[1-5]$/.test(e.key)) return;
        next = Number(e.key) * 2;
    }
    e.preventDefault();
    setHovered(0);
    setDraft({ value: next, base: saved, dirty: true });
  }

  /** The 1–10 value under the pointer (left half of a star = half star), or 0 off the stars. */
  function valueFromPointer(e: MouseEvent<HTMLDivElement>): number {
    const starEl = (e.target as Element).closest<HTMLElement>('[data-star]');
    if (!starEl) return 0;
    const starIndex = Number(starEl.dataset.star);
    const rect = starEl.getBoundingClientRect();
    const isLeftHalf = e.clientX - rect.left < rect.width / 2;
    return isLeftHalf ? starIndex * 2 - 1 : starIndex * 2;
  }

  const valueText =
    current > 0
      ? t('a11y.rating.slider').replace('{value}', stars(current))
      : t('a11y.rating.notRated');

  return (
    <div>
      <div
        role="slider"
        tabIndex={0}
        aria-label={label ?? t('recipe.rating')}
        aria-valuemin={0}
        aria-valuemax={MAX_VALUE}
        aria-valuenow={current}
        aria-valuetext={valueText}
        aria-describedby={hintId}
        aria-disabled={busy ? true : undefined}
        className={`flex flex-wrap items-center gap-1 select-none rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-primary)] ${
          busy ? 'cursor-progress opacity-70' : 'cursor-pointer'
        }`}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        onMouseMove={(e) => {
          if (!busy) setHovered(valueFromPointer(e));
        }}
        onMouseLeave={() => setHovered(0)}
        onClick={(e) => {
          if (busy) return;
          const picked = valueFromPointer(e);
          if (picked <= 0) return;
          onRate?.(picked);
          setDraft({ value: picked, base: saved, dirty: false });
        }}
      >
        <Stars activeValue={displayValue} />
        <span
          aria-hidden="true"
          className="ml-1 text-sm font-medium tabular-nums text-[color:var(--text-secondary)]"
        >
          {displayValue > 0 ? stars(displayValue) : ''}
        </span>
      </div>
      <span id={hintId} className="sr-only">
        {t('a11y.rating.keyboardHint')}
      </span>
      {countLine}
    </div>
  );
}
