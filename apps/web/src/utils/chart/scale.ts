/**
 * Value-sanitizing helpers shared by every chart, meter and rating display.
 *
 * Data-driven geometry (percent widths, radii, filled counts) must never see
 * `NaN`, `Infinity` or a value outside its range, so every such value is
 * passed through these helpers before it reaches a style or an SVG attribute.
 */

/**
 * Returns `value` when it is a finite number, otherwise `fallback`.
 *
 * `NaN`, `±Infinity`, `null`, `undefined`, strings (even numeric-looking ones)
 * and every other non-number map to `fallback`.
 *
 * @param value - Any input, typically a prop of unknown quality.
 * @param fallback - Returned for non-finite or non-number input (default `0`).
 * @returns A finite number.
 */
export function sanitizeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Clamps `value` into `[min, max]`, never returning a value outside it.
 *
 * - `min`/`max` are swapped when reversed; a `NaN` bound is treated as `0`.
 * - `+Infinity` maps to the upper bound and `-Infinity` to the lower bound.
 * - Every other non-finite or non-number input is sanitized to `0` first
 *   (and then pulled into range).
 *
 * @param value - The value to clamp.
 * @param min - One bound of the range.
 * @param max - The other bound of the range.
 * @returns A number in `[min(min, max), max(min, max)]`.
 */
export function clamp(value: unknown, min: number, max: number): number {
  let lo = Number.isNaN(min) ? 0 : min;
  let hi = Number.isNaN(max) ? 0 : max;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (value === Number.POSITIVE_INFINITY) return hi;
  if (value === Number.NEGATIVE_INFINITY) return lo;
  const v = sanitizeNumber(value);
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Clamps a percentage into `[0, 100]`; equivalent to `clamp(value, 0, 100)`.
 *
 * @param value - The percentage to clamp.
 * @returns A number in `[0, 100]`.
 */
export function clampPct(value: unknown): number {
  return clamp(value, 0, 100);
}

/**
 * Divides `numerator` by `denominator`, returning `fallback` instead of a
 * non-finite result.
 *
 * The fallback is used when either operand is not a finite number, when the
 * denominator is `0` (or `-0`), and when the quotient overflows to `±Infinity`.
 *
 * @param numerator - The dividend.
 * @param denominator - The divisor.
 * @param fallback - Returned instead of a non-finite quotient (default `0`).
 * @returns A finite quotient or `fallback`.
 */
export function safeRatio(numerator: unknown, denominator: unknown, fallback = 0): number {
  const n = sanitizeNumber(numerator, Number.NaN);
  const d = sanitizeNumber(denominator, Number.NaN);
  if (Number.isNaN(n) || Number.isNaN(d) || d === 0) return fallback;
  const q = n / d;
  return Number.isFinite(q) ? q : fallback;
}
