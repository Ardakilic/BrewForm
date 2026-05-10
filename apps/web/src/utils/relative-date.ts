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
  // Strip time by parsing the ISO date string back to midnight UTC
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

/**
 * Returns a relative label for a roast date relative to the brew date.
 * - Same calendar day: "today"
 * - Otherwise: "X days post-roast"
 */
export function roastDateLabel(roastDate: Date, brewDate: Date): string {
  if (isSameCalendarDay(roastDate, brewDate)) {
    return "today";
  }
  const days = daysBetween(roastDate, brewDate);
  return `${days} days post-roast`;
}

/**
 * Returns a relative label for a package open date relative to the brew date.
 * - Same calendar day: "today"
 * - Otherwise: "X days since opened"
 */
export function packageOpenDateLabel(packageOpenDate: Date, brewDate: Date): string {
  if (isSameCalendarDay(packageOpenDate, brewDate)) {
    return "today";
  }
  const days = daysBetween(packageOpenDate, brewDate);
  return `${days} days since opened`;
}

/**
 * Returns a relative label for a grind date relative to the brew date.
 * - Same calendar day: "today"
 * - Otherwise: "X days ago"
 */
export function grindDateLabel(grindDate: Date, brewDate: Date): string {
  if (isSameCalendarDay(grindDate, brewDate)) {
    return "today";
  }
  const days = daysBetween(grindDate, brewDate);
  return `${days} days ago`;
}
