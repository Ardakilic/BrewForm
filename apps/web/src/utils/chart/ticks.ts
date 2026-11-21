/**
 * Axis tick generation: numeric nice ticks and bounded duration ticks.
 *
 * Both follow d3 conventions (steps of a power of ten × {1, 2, 5}; a d3-time
 * style ladder for durations) without the dependency, and both cost the same
 * for any input magnitude.
 */

import { overlaps, type TextAnchor } from './layout.ts';
import { estimateTextWidth } from './text.ts';

/** The narrowest container a chart must support, in px (covers every viewport ≥ 320px). */
export const MIN_CHART_WIDTH_PX = 200;

/** Default tick label font size in px (`0.65rem`). */
export const DEFAULT_TICK_FONT_PX = 10.4;

/** Default minimum gap between neighbouring tick labels, in px. */
export const DEFAULT_TICK_GAP_PX = 6;

/** Default maximum number of ticks on an axis. */
export const DEFAULT_MAX_TICKS = 8;

/** Mantissas of a nice numeric step. */
const NICE_MANTISSAS = [1, 2, 5] as const;

/**
 * Largest accepted multiple index `|k|` of a step. Up to 2^52 the index is an
 * exact integer and the step is at least one ulp of every tick it builds, so
 * `k++` always advances and neighbouring ticks never collapse into one double.
 */
const MAX_MULTIPLE_INDEX = 2 ** 52;

/** Tolerance, as a fraction of the range, for ticks that float noise puts just outside it. */
const RANGE_TOLERANCE = 1e-9;

/**
 * Builds the ticks `valueAt(first) … valueAt(last)` when they are usable.
 *
 * Returns `null` (so the caller tries the next, larger step) when an index is
 * not an exact integer (past {@link MAX_MULTIPLE_INDEX}, `NaN` or infinite),
 * when there are more than `maxCount` multiples, when none lies inside
 * `[lo, hi]` (with {@link RANGE_TOLERANCE}), or when the values are not
 * strictly ascending (a step below float resolution).
 */
function collectMultiples(
  first: number,
  last: number,
  maxCount: number,
  valueAt: (k: number) => number,
  lo: number,
  hi: number,
): number[] | null {
  if (!(Math.abs(first) <= MAX_MULTIPLE_INDEX && Math.abs(last) <= MAX_MULTIPLE_INDEX)) {
    return null;
  }
  if (last - first + 1 > maxCount) return null;
  const tolerance = (hi - lo) * RANGE_TOLERANCE;
  const out: number[] = [];
  for (let k = first; k <= last; k++) {
    const value = valueAt(k);
    if (value >= lo - tolerance && value <= hi + tolerance) out.push(value);
  }
  if (out.length === 0) return null;
  for (let i = 1; i < out.length; i++) if (!(out[i] > out[i - 1])) return null;
  return out;
}

/**
 * Counts and (when few enough) builds the multiples of `m × 10^exponent` in `[lo, hi]`.
 *
 * Negative exponents divide by an integer inverse step so values such as
 * `0.15` come out exact instead of accumulating float drift. Both branches
 * reject a non-finite step and go through {@link collectMultiples}, so every
 * loop is bounded by `maxCount`.
 *
 * @returns The ticks, or `null` when this step is unusable (too many
 *   multiples, none in range, or below float resolution).
 */
function multiplesInRange(
  lo: number,
  hi: number,
  m: number,
  exponent: number,
  maxCount: number,
): number[] | null {
  const eps = 1e-9;
  if (exponent >= 0) {
    const step = m * 10 ** exponent;
    if (!Number.isFinite(step)) return null;
    const first = Math.ceil(lo / step - eps);
    const last = Math.floor(hi / step + eps);
    return collectMultiples(first, last, maxCount, (k) => k * step + 0, lo, hi);
  }
  const inverse = 10 ** -exponent / m;
  if (!Number.isFinite(inverse)) return null;
  const first = Math.ceil(lo * inverse - eps);
  const last = Math.floor(hi * inverse + eps);
  return collectMultiples(first, last, maxCount, (k) => k / inverse + 0, lo, hi);
}

/**
 * Returns "nice" numeric ticks for `[min, max]`: every multiple of the
 * smallest step of the form {1, 2, 5} × 10^k that yields between 1 and
 * `maxCount` ticks inside the range.
 *
 * Reversed bounds are swapped. Non-finite bounds or a `maxCount` below 1
 * return `[]`; an empty range returns `[min]`; a range whose width overflows
 * (`max - min` is infinite) returns `[]`. When no nice step fits (possible for
 * `maxCount` 1, e.g. `[0.6, 0.8]`, or for a range a few subnormals wide) it
 * returns the lower bound alone. It always terminates: steps finer than the
 * float resolution of the bounds are skipped, and at most 40 decades are tried.
 *
 * @param min - One end of the range.
 * @param max - The other end of the range.
 * @param maxCount - The maximum number of ticks.
 * @returns Finite, strictly ascending tick values within the range.
 */
export function niceTicks(min: number, max: number, maxCount: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(maxCount >= 1)) return [];
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (lo === hi) return [lo];
  if (!Number.isFinite(hi - lo)) return [];
  const count = Math.floor(maxCount);
  // Start one decade below the step that would give `count` ticks, so the first
  // acceptable candidate is the smallest one. The logarithms are subtracted
  // because `(hi - lo) / count` underflows to 0 for a subnormal range.
  let exponent = Math.floor(Math.log10(hi - lo) - Math.log10(count)) - 1;
  for (let guard = 0; guard < 40; guard++, exponent++) {
    for (const m of NICE_MANTISSAS) {
      const ticks = multiplesInRange(lo, hi, m, exponent, count);
      if (ticks) return ticks;
    }
  }
  return [lo];
}

/** One duration-axis tick. */
export interface DurationTick {
  /** Position on the axis in seconds. */
  value: number;
  /** The formatted label. */
  label: string;
  /** Position as a percentage of the total, in `[0, 100]`. */
  pct: number;
  /** Label anchor: first `start`, last `end`, the rest `middle`. */
  anchor: TextAnchor;
}

/** Options for {@link durationTicks}. */
export interface DurationTickOptions {
  /** Formats a nice tick in the step's unit (e.g. `2h` for 7200 with a 7200 step; `0` at the origin). */
  formatTick: (seconds: number, stepSeconds: number) => string;
  /** Formats the end tick as the compact total (e.g. `4m 50s`). */
  formatTotal: (seconds: number) => string;
  /** Axis width in px used for the collision check (default {@link MIN_CHART_WIDTH_PX}). */
  widthPx?: number;
  /** Tick label font size in px (default {@link DEFAULT_TICK_FONT_PX}). */
  fontSizePx?: number;
  /** Minimum gap between labels in px (default {@link DEFAULT_TICK_GAP_PX}). */
  gapPx?: number;
  /** Maximum tick count (default {@link DEFAULT_MAX_TICKS}). */
  maxCount?: number;
}

/** Time ladder in seconds: 1–30 s, 1–30 min, 1–12 h, 1 day. */
const TIME_LADDER = [
  1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400,
] as const;

const DAY_SECONDS = 86400;

/**
 * Lists candidate steps in ascending order: the time ladder, then the
 * closed-form `86400 × {2, 5, 10} × 10^k`, starting at the decade that can
 * first satisfy `maxCount` so huge totals cost the same as small ones.
 */
function candidateSteps(total: number, maxCount: number): number[] {
  const steps: number[] = [...TIME_LADDER];
  const k0 = Math.max(0, Math.floor(Math.log10(total / maxCount / DAY_SECONDS / 10)));
  for (let k = k0; k < k0 + 6; k++) {
    for (const m of [2, 5, 10]) steps.push(DAY_SECONDS * m * 10 ** k);
  }
  return steps;
}

/** A labelled tick with its estimated px box on the axis. */
interface PlacedTick {
  value: number;
  label: string;
  left: number;
  right: number;
}

/** Places labels on a `widthPx` axis: first left-anchored, last right-anchored, rest centred. */
function place(
  items: { value: number; label: string }[],
  total: number,
  widthPx: number,
  fontSizePx: number,
): PlacedTick[] {
  return items.map((item, i) => {
    const w = estimateTextWidth(item.label, fontSizePx);
    if (i === 0) return { ...item, left: 0, right: w };
    if (i === items.length - 1) return { ...item, left: widthPx - w, right: widthPx };
    const centre = (item.value / total) * widthPx;
    return { ...item, left: centre - w / 2, right: centre + w / 2 };
  });
}

/** True when two placed labels are closer than `gapPx`. */
function collide(a: PlacedTick, b: PlacedTick, gapPx: number): boolean {
  const box = (p: PlacedTick) => ({ x: p.left, y: 0, width: p.right - p.left, height: 1 });
  return overlaps(box(a), box(b), gapPx);
}

/** True when every label lies in `[0, widthPx]` and no neighbours collide. */
function fits(placed: PlacedTick[], widthPx: number, gapPx: number): boolean {
  for (const p of placed) {
    if (p.left < -1e-9 || p.right > widthPx + 1e-9) return false;
  }
  for (let i = 1; i < placed.length; i++) {
    if (collide(placed[i - 1], placed[i], gapPx)) return false;
  }
  return true;
}

/** Converts placed ticks into the public shape. */
function toTicks(placed: PlacedTick[], total: number): DurationTick[] {
  return placed.map((p, i) => ({
    value: p.value,
    label: p.label,
    pct: i === placed.length - 1 ? 100 : (p.value / total) * 100,
    anchor: i === 0 ? 'start' : i === placed.length - 1 ? 'end' : 'middle',
  }));
}

/**
 * Generates a bounded duration axis for `[0, totalSeconds]`.
 *
 * Picks the smallest step from the ladder (1, 2, 5, 10, 15, 30 s; 1, 2, 5, 10,
 * 15, 30 min; 1, 2, 3, 6, 12 h; 1 d; then 86400 × {2, 5, 10} × 10^k) whose
 * labels fit: at most `maxCount` ticks, always 0 and the total, no label
 * outside `[0, widthPx]`, and at least `gapPx` between neighbours. Nice ticks
 * are labelled in the step's unit; the end tick is the compact total. When the
 * last nice tick collides with the end label, it is dropped.
 *
 * Because label widths are fixed in px, ticks that fit at a width also fit at
 * every wider width, so callers compute once at {@link MIN_CHART_WIDTH_PX}.
 *
 * @param totalSeconds - The axis length in seconds.
 * @param options - Formatters and geometry.
 * @returns 2–`maxCount` ascending ticks, or `[]` for a missing, non-finite or ≤ 0 total.
 */
export function durationTicks(totalSeconds: number, options: DurationTickOptions): DurationTick[] {
  if (typeof totalSeconds !== 'number' || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return [];
  }
  const total = totalSeconds;
  const widthPx = options.widthPx ?? MIN_CHART_WIDTH_PX;
  const fontSizePx = options.fontSizePx ?? DEFAULT_TICK_FONT_PX;
  const gapPx = options.gapPx ?? DEFAULT_TICK_GAP_PX;
  const maxCount = Math.max(2, Math.floor(options.maxCount ?? DEFAULT_MAX_TICKS));
  const end = { value: total, label: options.formatTotal(total) };

  for (const step of candidateSteps(total, maxCount)) {
    const niceCount = Math.ceil(total / step); // multiples k·step with k·step < total
    if (niceCount + 1 > maxCount) continue;
    const items = Array.from({ length: niceCount }, (_, k) => ({
      value: k * step,
      label: options.formatTick(k * step, step),
    }));
    items.push(end);
    let placed = place(items, total, widthPx, fontSizePx);
    // Drop the last nice tick (never the origin) when it collides with the end label.
    if (placed.length > 2 && collide(placed[placed.length - 2], placed[placed.length - 1], gapPx)) {
      placed = [...placed.slice(0, -2), placed[placed.length - 1]];
    }
    if (fits(placed, widthPx, gapPx)) return toTicks(placed, total);
  }

  // Unreachable for widths ≥ the minimum; keep the axis readable anyway.
  return toTicks(
    place([{ value: 0, label: options.formatTick(0, total) }, end], total, widthPx, fontSizePx),
    total,
  );
}
