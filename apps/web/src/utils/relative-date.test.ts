/**
 * Tests for relative-date utility
 *
 * Feature: recipe-detail-redesign
 * **Validates: Requirements 16.2, 16.3**
 *
 * Covers: same-day, 1-day, and multi-day differences for all three label functions.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { daysBetween, grindDateResult, packageOpenDateResult, roastDateResult } from './relative-date';

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

describe('roastDateResult', () => {
  it('returns { type: "today" } when roast date and brew date are the same calendar day', () => {
    const date = new Date('2024-03-10T08:00:00Z');
    expect(roastDateResult(date, date)).toEqual({ type: 'today' });
  });

  it('returns { type: "today" } for same calendar day at different times', () => {
    const roast = new Date('2024-03-10T06:00:00Z');
    const brew = new Date('2024-03-10T14:00:00Z');
    expect(roastDateResult(roast, brew)).toEqual({ type: 'today' });
  });

  it('returns { type: "daysPostRoast", days: 1 } for a 1-day difference', () => {
    const roast = new Date('2024-03-09T00:00:00Z');
    const brew = new Date('2024-03-10T00:00:00Z');
    expect(roastDateResult(roast, brew)).toEqual({ type: 'daysPostRoast', days: 1 });
  });

  it('returns { type: "daysPostRoast", days: 9 } for a multi-day difference', () => {
    const roast = new Date('2024-03-01T00:00:00Z');
    const brew = new Date('2024-03-10T00:00:00Z');
    expect(roastDateResult(roast, brew)).toEqual({ type: 'daysPostRoast', days: 9 });
  });
});

describe('packageOpenDateResult', () => {
  it('returns { type: "today" } when package open date and brew date are the same calendar day', () => {
    const date = new Date('2024-03-10T08:00:00Z');
    expect(packageOpenDateResult(date, date)).toEqual({ type: 'today' });
  });

  it('returns { type: "today" } for same calendar day at different times', () => {
    const opened = new Date('2024-03-10T07:00:00Z');
    const brew = new Date('2024-03-10T15:00:00Z');
    expect(packageOpenDateResult(opened, brew)).toEqual({ type: 'today' });
  });

  it('returns { type: "daysSinceOpened", days: 1 } for a 1-day difference', () => {
    const opened = new Date('2024-03-09T00:00:00Z');
    const brew = new Date('2024-03-10T00:00:00Z');
    expect(packageOpenDateResult(opened, brew)).toEqual({ type: 'daysSinceOpened', days: 1 });
  });

  it('returns { type: "daysSinceOpened", days: 14 } for a multi-day difference', () => {
    const opened = new Date('2024-02-25T00:00:00Z');
    const brew = new Date('2024-03-10T00:00:00Z');
    expect(packageOpenDateResult(opened, brew)).toEqual({ type: 'daysSinceOpened', days: 14 });
  });
});

describe('grindDateResult', () => {
  it('returns { type: "today" } when grind date and brew date are the same calendar day', () => {
    const date = new Date('2024-03-10T08:00:00Z');
    expect(grindDateResult(date, date)).toEqual({ type: 'today' });
  });

  it('returns { type: "today" } for same calendar day at different times', () => {
    const grind = new Date('2024-03-10T05:00:00Z');
    const brew = new Date('2024-03-10T09:00:00Z');
    expect(grindDateResult(grind, brew)).toEqual({ type: 'today' });
  });

  it('returns { type: "daysAgo", days: 1 } for a 1-day difference', () => {
    const grind = new Date('2024-03-09T00:00:00Z');
    const brew = new Date('2024-03-10T00:00:00Z');
    expect(grindDateResult(grind, brew)).toEqual({ type: 'daysAgo', days: 1 });
  });

  it('returns { type: "daysAgo", days: 3 } for a multi-day difference', () => {
    const grind = new Date('2024-03-07T00:00:00Z');
    const brew = new Date('2024-03-10T00:00:00Z');
    expect(grindDateResult(grind, brew)).toEqual({ type: 'daysAgo', days: 3 });
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
  const dateArb = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
    .filter((d) => !isNaN(d.getTime()));

  /**
   * Helper: strip time component to midnight UTC so two dates on the same
   * calendar day compare equal regardless of their time-of-day.
   */
  function toMidnightUTC(d: Date): Date {
    return new Date(d.toISOString().slice(0, 10) + 'T00:00:00.000Z');
  }



  it('same-day property: all three result functions return { type: "today" } when both arguments are the same date', () => {
    fc.assert(
      fc.property(dateArb, (date) => {
        expect(roastDateResult(date, date)).toEqual({ type: 'today' });
        expect(packageOpenDateResult(date, date)).toEqual({ type: 'today' });
        expect(grindDateResult(date, date)).toEqual({ type: 'today' });
      }),
    );
  });

  it('non-zero days property: for different calendar days, all three result functions return a non-"today" type with positive days', () => {
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

          for (
            const result of [
              roastDateResult(dateA, dateB),
              packageOpenDateResult(dateA, dateB),
              grindDateResult(dateA, dateB),
            ]
          ) {
            expect(result.type).not.toBe('today');
            expect(Number.isInteger(result.days)).toBe(true);
            expect(result.days).toBeGreaterThan(0);
          }
        },
      ),
    );
  });

  it('roastDateResult type property: for different calendar days, roastDateResult returns { type: "daysPostRoast" }', () => {
    fc.assert(
      fc.property(dateArb, dateArb, (dateA, dateB) => {
        const a = toMidnightUTC(dateA);
        const b = toMidnightUTC(dateB);
        fc.pre(a.getTime() !== b.getTime());

        const result = roastDateResult(dateA, dateB);
        expect(result.type).toBe('daysPostRoast');
      }),
    );
  });

  it('packageOpenDateResult type property: for different calendar days, packageOpenDateResult returns { type: "daysSinceOpened" }', () => {
    fc.assert(
      fc.property(dateArb, dateArb, (dateA, dateB) => {
        const a = toMidnightUTC(dateA);
        const b = toMidnightUTC(dateB);
        fc.pre(a.getTime() !== b.getTime());

        const result = packageOpenDateResult(dateA, dateB);
        expect(result.type).toBe('daysSinceOpened');
      }),
    );
  });

  it('grindDateResult type property: for different calendar days, grindDateResult returns { type: "daysAgo" }', () => {
    fc.assert(
      fc.property(dateArb, dateArb, (dateA, dateB) => {
        const a = toMidnightUTC(dateA);
        const b = toMidnightUTC(dateB);
        fc.pre(a.getTime() !== b.getTime());

        const result = grindDateResult(dateA, dateB);
        expect(result.type).toBe('daysAgo');
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
