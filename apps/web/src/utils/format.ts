/**
 * Locale-aware formatting helpers driven by the I18nContext locale.
 *
 * Call sites pass the active `locale` from `useTranslation()` so dates and
 * numbers render in the user's language rather than the browser default
 * (e.g. en → "3/15/2026" / "1,234.5", tr → "15.03.2026" / "1.234,5").
 */

/** Formats a date for the given locale (defaults to `en`). Accepts a `Date` or anything `new Date()` can parse. */
export function formatDate(date: Date | string | number, locale: string = 'en'): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString(locale);
}

/** Formats a number for the given locale (defaults to `en`), applying locale grouping/decimal separators. */
export function formatNumber(n: number, locale: string = 'en'): string {
  return n.toLocaleString(locale);
}
