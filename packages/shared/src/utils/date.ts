function toPlainDate(date: Date | string): Temporal.PlainDate {
  if (typeof date === 'string') {
    return Temporal.PlainDate.from(date);
  }
  if (isNaN(date.getTime())) {
    throw new RangeError('Invalid Date');
  }
  return new Temporal.PlainDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function formatPlainDate(d: Temporal.PlainDate, fmt: string): string {
  return fmt
    .replaceAll('yyyy', String(d.year).padStart(4, '0'))
    .replaceAll('MM', String(d.month).padStart(2, '0'))
    .replaceAll('dd', String(d.day).padStart(2, '0'));
}

export function formatDate(date: Date | string, dateFormat: string = 'yyyy-MM-dd'): string {
  try {
    return formatPlainDate(toPlainDate(date), dateFormat);
  } catch {
    return '';
  }
}

export function isDateBefore(date1: Date | string, date2: Date | string): boolean {
  const d1 = toPlainDate(date1);
  const d2 = toPlainDate(date2);
  return Temporal.PlainDate.compare(d1, d2) < 0;
}
