/**
 * Locale-aware formatting helpers driven by the I18nContext locale.
 *
 * Call sites pass the active `locale` from `useTranslation()` (or
 * `useSafeLocale()`) so dates, numbers and durations render in the user's
 * language rather than the browser default (e.g. en → "3/15/2026" / "1,234.5" /
 * "4m 30s", tr → "15.03.2026" / "1.234,5" / "4 dk 30 sn").
 */

import { t } from '@brewform/shared/i18n';
import { sanitizeNumber } from './chart/scale.ts';

/** Formats a date for the given locale (defaults to `en`). Accepts a `Date` or anything `new Date()` can parse. */
export function formatDate(date: Date | string | number, locale: string = 'en'): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString(locale);
}

/** Formats a number for the given locale (defaults to `en`), applying locale grouping/decimal separators. */
export function formatNumber(n: number, locale: string = 'en'): string {
  return n.toLocaleString(locale);
}

/** Cached `Intl.NumberFormat` instances keyed by `locale|maxFractionDigits`. */
const decimalFormatters = new Map<string, Intl.NumberFormat>();

/**
 * Formats `value` with at most `maxFractionDigits` fraction digits, using the
 * locale's decimal and grouping separators (`2.2222223` → `2.2` en / `2,2` tr).
 *
 * Trailing zeros are dropped (`4` stays `4`). Non-finite input renders as `0`
 * so a chart or stat never shows `NaN` or `∞`.
 *
 * @param value - The number to format.
 * @param locale - The active locale (default `en`).
 * @param maxFractionDigits - The maximum number of fraction digits (default `1`).
 * @returns The localized decimal string.
 */
export function formatDecimal(value: number, locale: string = 'en', maxFractionDigits = 1): string {
  const key = `${locale}|${maxFractionDigits}`;
  let formatter = decimalFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits });
    decimalFormatters.set(key, formatter);
  }
  return formatter.format(sanitizeNumber(value) + 0);
}

/** Below this, a positive value rounds to 0 at one fraction digit. */
const ONE_DECIMAL_HALF_STEP = 0.05;

/** Cached two-significant-digit `Intl.NumberFormat` instances keyed by locale. */
const significantFormatters = new Map<string, Intl.NumberFormat>();

/**
 * Formats a flow rate in ml/s (the number only: the `recipe.brewTimeline.flowRate` template adds
 * the unit). It matches `formatDecimal(value, locale, 1)`, except that a positive rate the
 * one-decimal form would round to 0 keeps two significant digits, so a real flow never reads
 * "0 ml/s" (500 ml over 12 h: `0.012` en, `0,012` tr). Zero, negative and non-finite input
 * format as `formatDecimal` does.
 *
 * @param value - The flow rate in ml/s.
 * @param locale - The active locale (default `en`).
 * @returns The localized number.
 */
export function formatFlowRate(value: number, locale: string = 'en'): string {
  const v = sanitizeNumber(value);
  if (v <= 0 || v >= ONE_DECIMAL_HALF_STEP) return formatDecimal(v, locale, 1);
  let formatter = significantFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { maximumSignificantDigits: 2 });
    significantFormatters.set(locale, formatter);
  }
  return formatter.format(v);
}

/** Duration unit keys under `chart.duration.*`. */
type DurationUnit = 'seconds' | 'minutes' | 'hours';

/**
 * Fills the `chart.duration.<unit>` template (`{n}s`, `{n} sn`, …) with a
 * locale-formatted number.
 */
function durationUnit(unit: DurationUnit, n: number, locale: string): string {
  return t(`chart.duration.${unit}`, locale).replace('{n}', formatDecimal(n, locale, 1));
}

/**
 * Splits a duration into at most two localized unit parts, taking the unit
 * text from the `chart.duration.*` i18n keys: `['4m', '30s']` (en),
 * `['4 dk', '30 sn']` (tr), `['12h']`.
 *
 * The input is rounded to whole seconds; at one hour or more the seconds are
 * rounded into the minutes. Hours are never rolled up into days. Negative and
 * non-finite input yields zero seconds, so no part carries a minus sign.
 *
 * @param seconds - The duration in seconds.
 * @param locale - The active locale (default `en`).
 * @returns One or two unit parts, largest unit first.
 */
export function formatDurationParts(seconds: number, locale: string = 'en'): string[] {
  const total = Math.max(0, Math.round(sanitizeNumber(seconds)));
  if (total < 60) return [durationUnit('seconds', total, locale)];
  if (total < 3600) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    const minutes = durationUnit('minutes', m, locale);
    return s > 0 ? [minutes, durationUnit('seconds', s, locale)] : [minutes];
  }
  const totalMinutes = Math.round(total / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const hours = durationUnit('hours', h, locale);
  return m > 0 ? [hours, durationUnit('minutes', m, locale)] : [hours];
}

/**
 * Formats a duration compactly with at most two units: `45s`, `4m 30s`,
 * `12h`, `1h 30m` (en); `45 sn`, `4 dk 30 sn`, `12 sa` (tr). See
 * {@link formatDurationParts} for rounding and sanitizing.
 *
 * @param seconds - The duration in seconds.
 * @param locale - The active locale (default `en`).
 * @returns The compact duration string.
 */
export function formatDuration(seconds: number, locale: string = 'en'): string {
  return formatDurationParts(seconds, locale).join(' ');
}

/**
 * Formats a duration-axis tick in the unit of the axis step, so every nice
 * tick on an axis shares one unit (`formatDurationTick(7200, 7200, 'en')` →
 * `2h`). Steps under a minute label seconds, steps under an hour label
 * minutes, and longer steps label hours. The origin is a bare `0`.
 *
 * @param seconds - The tick position in seconds.
 * @param stepSeconds - The axis step in seconds.
 * @param locale - The active locale (default `en`).
 * @returns The tick label.
 */
export function formatDurationTick(
  seconds: number,
  stepSeconds: number,
  locale: string = 'en',
): string {
  const value = sanitizeNumber(seconds);
  if (value === 0) return '0';
  const step = sanitizeNumber(stepSeconds, 1);
  if (step < 60) return durationUnit('seconds', value, locale);
  if (step < 3600) return durationUnit('minutes', value / 60, locale);
  return durationUnit('hours', value / 3600, locale);
}
