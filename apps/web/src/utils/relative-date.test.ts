/**
 * Tests for relative-date utility
 *
 * Feature: recipe-detail-redesign
 * **Validates: Requirements 16.2, 16.3**
 *
 * Covers: same-day, 1-day, and multi-day differences for all three label functions.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  daysBetween,
  roastDateLabel,
  packageOpenDateLabel,
  grindDateLabel,
} from './relative-date';

describe('daysBetween', () => {
  it('returns 0 for the same date', () => {
    const d = new Date('2024-01-15T10:00:00Z');
    expect(daysBetween(d, d)).toBe(0);
  });

  it('returns 0 for the same calendar day at different times', () => {
    const a = new Date('2024-01-15T00:00:00Z');
    const b = new Date('2024-01-15T23:59:59Z');
    expect(daysBetween(a, b)).toBe(0);
  });

  it('returns 1 for adjacent days', () => {
    const a = new Date('2024-01-15T00:00:00Z');
    const b = new Date('2024-01-16T00:00:00Z');
    expect(daysBetween(a, b)).toBe(1);
  });

  it('returns the correct count for multi-day differences', () => {
    const a = new Date('2024-01-01T00:00:00Z');
    const b = new Date('2024-01-15T00:00:00Z');
    expect(daysBetween(a, b)).toBe(14);
  });

  it('is symmetric — order of arguments does not matter', () => {
    const a = new Date('2024-01-01T00:00:00Z');
    const b = new Date('2024-01-10T00:00:00Z');
    expect(daysBetween(a, b)).toBe(daysBetween(b, a));
  });

  it('handles month boundaries correctly', () => {
    const a = new Date('2024-01-31T00:00:00Z');
    const b = new Date('2024-02-01T00:00:00Z');
    expect(daysBetween(a, b)).toBe(1);
  });

  it('handles year boundaries correctly', () => {
    const a = new Date('2023-12-31T00:00:00Z');
    const b = new Date('2024-01-01T00:00:00Z');
    expect(daysBetween(a, b)).toBe(1);
  });
});

describe('roastDateLabel', () => {
  it('returns "today" when roast date and brew date are the same calendar day', () => {
    const date = new Date('2024-03-10T08:00:00Z');
    expect(roastDateLabel(date, date)).toBe('today');
  });

  it('returns "today" for same calendar day at different times', () => {
    const roast = new Date('2024-03-10T06:00:00Z');
    const brew = new Date('2024-03-10T14:00:00Z');
    expect(roastDateLabel(roast, brew)).toBe('today');
  });

  it('returns "1 days post-roast" for a 1-day difference', () => {
    const roast = new Date('2024-03-09T00:00:00Z');
    const brew = new Date('2024-03-10T00:00:00Z');
    expect(roastDateLabel(roast, brew)).toBe('1 days post-roast');
  });

  it('returns "X days post-roast" for a multi-day difference', () => {
    const roast = new Date('2024-03-01T00:00:00Z');
    const brew = new Date('2024-03-10T00:00:00Z');
    expect(roastDateLabel(roast, brew)).toBe('9 days post-roast');
  });
});

describe('packageOpenDateLabel', () => {
  it('returns "today" when package open date and brew date are the same calendar day', () => {
    const date = new Date('2024-03-10T08:00:00Z');
    expect(packageOpenDateLabel(date, date)).toBe('today');
  });

  it('returns "today" for same calendar day at different times', () => {
    const opened = new Date('2024-03-10T07:00:00Z');
    const brew = new Date('2024-03-10T15:00:00Z');
    expect(packageOpenDateLabel(opened, brew)).toBe('today');
  });

  it('returns "1 days since opened" for a 1-day difference', () => {
    const opened = new Date('2024-03-09T00:00:00Z');
    const brew = new Date('2024-03-10T00:00:00Z');
    expect(packageOpenDateLabel(opened, brew)).toBe('1 days since opened');
  });

  it('returns "X days since opened" for a multi-day difference', () => {
    const opened = new Date('2024-02-25T00:00:00Z');
    const brew = new Date('2024-03-10T00:00:00Z');
    expect(packageOpenDateLabel(opened, brew)).toBe('14 days since opened');
  });
});

describe('grindDateLabel', () => {
  it('returns "today" when grind date and brew date are the same calendar day', () => {
    const date = new Date('2024-03-10T08:00:00Z');
    expect(grindDateLabel(date, date)).toBe('today');
  });

  it('returns "today" for same calendar day at different times', () => {
    const grind = new Date('2024-03-10T05:00:00Z');
    const brew = new Date('2024-03-10T09:00:00Z');
    expect(grindDateLabel(grind, brew)).toBe('today');
  });

  it('returns "1 days ago" for a 1-day difference', () => {
    const grind = new Date('2024-03-09T00:00:00Z');
    const brew = new Date('2024-03-10T00:00:00Z');
    expect(grindDateLabel(grind, brew)).toBe('1 days ago');
  });

  it('returns "X days ago" for a multi-day difference', () => {
    const grind = new Date('2024-03-07T00:00:00Z');
    const brew = new Date('2024-03-10T00:00:00Z');
    expect(grindDateLabel(grind, brew)).toBe('3 days ago');
  });
});

/**
 * Property 3: Relative date calculation (PBT)
 * Validates: Requirements 5.2, 5.3, 5.4
 *
 * For any two dates A (reference date) and B (brew date) where A ≤ B, the
 * relative date function SHALL return "today" when A and B are the same
 * calendar day, and "X days {qualifier}" where X equals the number of
 * calendar days between A and B when they differ, and X is always a
 * positive integer.
 */
describe('Property 3: Relative date calculation (PBT)', () => {
  const dateArb = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') });

  /**
   * Helper: strip time component to midnight UTC so two dates on the same
   * calendar day compare equal regardless of their time-of-day.
   */
  function toMidnightUTC(d: Date): Date {
    return new Date(d.toISOString().slice(0, 10) + 'T00:00:00.000Z');
  }

  /**
   * Helper: extract the leading integer from a label like "7 days post-roast".
   * Returns NaN if the label does not start with a number.
   */
  function leadingInt(label: string): number {
    return parseInt(label.split(' ')[0], 10);
  }

  it('same-day property: all three label functions return "today" when both arguments are the same date', () => {
    fc.assert(
      fc.property(dateArb, (date) => {
        expect(roastDateLabel(date, date)).toBe('today');
        expect(packageOpenDateLabel(date, date)).toBe('today');
        expect(grindDateLabel(date, date)).toBe('today');
      }),
    );
  });

  it('non-zero days property: for different calendar days, all three label functions return a string containing a positive integer (not "today")', () => {
    // Generate two dates that land on different calendar days by using two
    // independent date arbitraries and filtering out same-day pairs.
    fc.assert(
      fc.property(
        dateArb,
        dateArb,
        fc.context(),
        (dateA, dateB, ctx) => {
          const a = toMidnightUTC(dateA);
          const b = toMidnightUTC(dateB);
          // Skip same-day pairs — they are covered by the same-day property.
          fc.pre(a.getTime() !== b.getTime());

          ctx.log(`dateA=${a.toISOString()}, dateB=${b.toISOString()}`);

          for (const label of [
            roastDateLabel(dateA, dateB),
            packageOpenDateLabel(dateA, dateB),
            grindDateLabel(dateA, dateB),
          ]) {
            expect(label).not.toBe('today');
            const days = leadingInt(label);
            expect(Number.isInteger(days)).toBe(true);
            expect(days).toBeGreaterThan(0);
          }
        },
      ),
    );
  });

  it('roastDateLabel suffix property: for different calendar days, roastDateLabel returns a string ending with "days post-roast"', () => {
    fc.assert(
      fc.property(dateArb, dateArb, (dateA, dateB) => {
        const a = toMidnightUTC(dateA);
        const b = toMidnightUTC(dateB);
        fc.pre(a.getTime() !== b.getTime());

        const label = roastDateLabel(dateA, dateB);
        expect(label.endsWith('days post-roast')).toBe(true);
      }),
    );
  });

  it('packageOpenDateLabel suffix property: for different calendar days, packageOpenDateLabel returns a string ending with "days since opened"', () => {
    fc.assert(
      fc.property(dateArb, dateArb, (dateA, dateB) => {
        const a = toMidnightUTC(dateA);
        const b = toMidnightUTC(dateB);
        fc.pre(a.getTime() !== b.getTime());

        const label = packageOpenDateLabel(dateA, dateB);
        expect(label.endsWith('days since opened')).toBe(true);
      }),
    );
  });

  it('grindDateLabel suffix property: for different calendar days, grindDateLabel returns a string ending with "days ago"', () => {
    fc.assert(
      fc.property(dateArb, dateArb, (dateA, dateB) => {
        const a = toMidnightUTC(dateA);
        const b = toMidnightUTC(dateB);
        fc.pre(a.getTime() !== b.getTime());

        const label = grindDateLabel(dateA, dateB);
        expect(label.endsWith('days ago')).toBe(true);
      }),
    );
  });

  it('symmetry property for daysBetween: daysBetween(a, b) === daysBetween(b, a) for all date pairs', () => {
    fc.assert(
      fc.property(dateArb, dateArb, (dateA, dateB) => {
        expect(daysBetween(dateA, dateB)).toBe(daysBetween(dateB, dateA));
      }),
    );
  });
});
