/**
 * Extracts the ISO date string (YYYY-MM-DD) from a Date, using UTC.
 */
function toISODateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Calculates the number of calendar days between two dates.
 * Uses ISO date string (YYYY-MM-DD) comparison — UTC-based, ignores time-of-day.
 * Returns a positive integer (or 0 for same calendar day).
 */
export function daysBetween(dateA: Date, dateB: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const a = Date.parse(toISODateString(dateA));
  const b = Date.parse(toISODateString(dateB));
  return Math.abs(Math.round((b - a) / msPerDay));
}

/**
 * Returns true if two dates fall on the same calendar day (YYYY-MM-DD), UTC-based.
 */
function isSameCalendarDay(a: Date, b: Date): boolean {
  return toISODateString(a) === toISODateString(b);
}

// ---------------------------------------------------------------------------
// Structured result types — callers translate using t()
// ---------------------------------------------------------------------------

export type RelativeDateResult =
  | { type: 'today' }
  | { type: 'daysPostRoast'; days: number }
  | { type: 'daysSinceOpened'; days: number }
  | { type: 'daysAgo'; days: number };

/**
 * Returns structured relative info for a roast date.
 * Callers translate using:
 *   type === 'today'         → t('common.today')
 *   type === 'daysPostRoast' → t('recipe.bean.daysPostRoast', { days })
 */
export function roastDateResult(roastDate: Date, brewDate: Date): RelativeDateResult {
  if (isSameCalendarDay(roastDate, brewDate)) return { type: 'today' };
  return { type: 'daysPostRoast', days: daysBetween(roastDate, brewDate) };
}

/**
 * Returns structured relative info for a package open date.
 * Callers translate using:
 *   type === 'today'           → t('common.today')
 *   type === 'daysSinceOpened' → t('recipe.bean.daysSinceOpened', { days })
 */
export function packageOpenDateResult(packageOpenDate: Date, brewDate: Date): RelativeDateResult {
  if (isSameCalendarDay(packageOpenDate, brewDate)) return { type: 'today' };
  return { type: 'daysSinceOpened', days: daysBetween(packageOpenDate, brewDate) };
}

/**
 * Returns structured relative info for a grind date.
 * Callers translate using:
 *   type === 'today'    → t('common.today')
 *   type === 'daysAgo'  → t('recipe.bean.daysAgo', { days })
 */
export function grindDateResult(grindDate: Date, brewDate: Date): RelativeDateResult {
  if (isSameCalendarDay(grindDate, brewDate)) return { type: 'today' };
  return { type: 'daysAgo', days: daysBetween(grindDate, brewDate) };
}

// ---------------------------------------------------------------------------
// Legacy string helpers — kept for backward compatibility with existing tests
// and any other callers. These return English strings.
// ---------------------------------------------------------------------------

/** @deprecated Use roastDateResult() + t() for localized output */
export function roastDateLabel(roastDate: Date, brewDate: Date): string {
  const r = roastDateResult(roastDate, brewDate);
  if (r.type === 'today') return 'today';
  return `${r.days} days post-roast`;
}

/** @deprecated Use packageOpenDateResult() + t() for localized output */
export function packageOpenDateLabel(packageOpenDate: Date, brewDate: Date): string {
  const r = packageOpenDateResult(packageOpenDate, brewDate);
  if (r.type === 'today') return 'today';
  return `${r.days} days since opened`;
}

/** @deprecated Use grindDateResult() + t() for localized output */
export function grindDateLabel(grindDate: Date, brewDate: Date): string {
  const r = grindDateResult(grindDate, brewDate);
  if (r.type === 'today') return 'today';
  return `${r.days} days ago`;
}
