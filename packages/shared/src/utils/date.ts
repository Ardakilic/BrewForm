interface PlainYMD {
  year: number;
  month: number;
  day: number;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toPlainDate(date: Date | string): PlainYMD {
  if (typeof date === 'string') {
    // Parse the leading YYYY-MM-DD directly (no `new Date()` round-trip, which
    // would shift the calendar day in timezones behind UTC). `Temporal` is
    // unavailable on Node 24 (Deno-only global), so plain parsing replaces it.
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
    if (!m) throw new RangeError('Invalid Date');
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
      throw new RangeError('Invalid Date');
    }
    return { year, month, day };
  }
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Invalid Date');
  }
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

function formatPlainDate(d: PlainYMD, fmt: string): string {
  return fmt
    .replaceAll('yyyy', String(d.year).padStart(4, '0'))
    .replaceAll('MM', String(d.month).padStart(2, '0'))
    .replaceAll('dd', String(d.day).padStart(2, '0'));
}

/** Formats a Date or ISO date string using yyyy/MM/dd tokens (default "yyyy-MM-dd"); returns '' for invalid input. */
export function formatDate(date: Date | string, dateFormat: string = 'yyyy-MM-dd'): string {
  try {
    return formatPlainDate(toPlainDate(date), dateFormat);
  } catch {
    return '';
  }
}

/** Returns true when date1 falls on an earlier calendar day than date2 (time of day ignored); false for invalid input. */
export function isDateBefore(date1: Date | string, date2: Date | string): boolean {
  try {
    const d1 = toPlainDate(date1);
    const d2 = toPlainDate(date2);
    return Date.UTC(d1.year, d1.month - 1, d1.day) < Date.UTC(d2.year, d2.month - 1, d2.day);
  } catch {
    return false;
  }
}
