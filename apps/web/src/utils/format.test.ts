/**
 * Tests for locale-aware formatting helpers.
 *
 * Feature: wave-5-debt-clearance (T4.4)
 * Validates en vs tr output for both formatDate and formatNumber.
 *
 * Feature: wave-6-audit-remediation (t6, chart-rendering → "Durations and derived
 * metrics render through shared locale-aware formatters")
 * Validates formatDecimal, formatDuration and formatDurationTick in en and tr.
 *
 * Feature: wave-6-review-remediation (group-20 V4): formatFlowRate never shows a
 * positive flow rate as 0.
 */
import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDecimal,
  formatDuration,
  formatDurationParts,
  formatDurationTick,
  formatFlowRate,
  formatNumber,
} from './format.ts';

describe('formatDate', () => {
  // Local-time constructor avoids UTC-offset day shifts in date-only formatting.
  const date = new Date(2026, 2, 15); // 2026-03-15

  it('formats a date in the en locale', () => {
    expect(formatDate(date, 'en')).toBe('3/15/2026');
  });

  it('formats a date in the tr locale', () => {
    expect(formatDate(date, 'tr')).toBe('15.03.2026');
  });

  it('produces different output for en vs tr', () => {
    expect(formatDate(date, 'en')).not.toBe(formatDate(date, 'tr'));
  });

  it('defaults to the en locale when none is given', () => {
    expect(formatDate(date)).toBe('3/15/2026');
  });

  it('accepts a parseable date string', () => {
    expect(formatDate('2026-03-15T12:00:00', 'tr')).toBe('15.03.2026');
  });
});

describe('formatNumber', () => {
  it('formats a number in the en locale', () => {
    expect(formatNumber(1234.5, 'en')).toBe('1,234.5');
  });

  it('formats a number in the tr locale', () => {
    expect(formatNumber(1234.5, 'tr')).toBe('1.234,5');
  });

  it('produces different output for en vs tr', () => {
    expect(formatNumber(1234.5, 'en')).not.toBe(formatNumber(1234.5, 'tr'));
  });

  it('defaults to the en locale when none is given', () => {
    expect(formatNumber(1234.5)).toBe('1,234.5');
  });

  it('groups integers with the tr separator', () => {
    expect(formatNumber(12345, 'tr')).toBe('12.345');
  });
});

describe('formatDecimal', () => {
  it('rounds to the requested fraction digits with the locale decimal separator', () => {
    expect(formatDecimal(2.2222223, 'en', 1)).toBe('2.2');
    expect(formatDecimal(2.2222223, 'tr', 1)).toBe('2,2');
    expect(formatDecimal(1.2857143, 'tr', 1)).toBe('1,3');
  });

  it('drops trailing zeros for whole numbers', () => {
    expect(formatDecimal(4, 'en', 1)).toBe('4');
    expect(formatDecimal(3.5, 'tr', 1)).toBe('3,5');
  });

  it('defaults to en and one fraction digit', () => {
    expect(formatDecimal(7.25)).toBe('7.3');
  });

  it('applies locale grouping', () => {
    expect(formatDecimal(12345.67, 'en', 1)).toBe('12,345.7');
    expect(formatDecimal(12345.67, 'tr', 1)).toBe('12.345,7');
  });

  it('renders non-finite input as 0 instead of NaN/∞', () => {
    expect(formatDecimal(Number.NaN, 'en', 1)).toBe('0');
    expect(formatDecimal(Number.POSITIVE_INFINITY, 'en', 1)).toBe('0');
  });
});

describe('formatFlowRate', () => {
  it('keeps two significant digits for a positive rate one decimal would round to 0 (V4)', () => {
    // Blue Mountain cold brew: 500 ml over 12 h.
    expect(formatFlowRate(500 / 43_200, 'en')).toBe('0.012');
    expect(formatFlowRate(500 / 43_200, 'tr')).toBe('0,012');
    expect(formatFlowRate(0.049, 'en')).toBe('0.049');
    expect(formatFlowRate(0.0004, 'en')).toBe('0.0004');
  });

  it('never formats a positive flow rate as zero', () => {
    for (const value of [1e-9, 0.00001, 0.004, 0.0123, 0.0499, 0.05, 0.07, 0.1]) {
      for (const locale of ['en', 'tr']) {
        expect(formatFlowRate(value, locale)).not.toMatch(/^0(?:[.,]0*)?$/);
      }
    }
  });

  it('rounds every other rate to one decimal, like formatDecimal', () => {
    expect(formatFlowRate(1.2857143, 'en')).toBe('1.3');
    expect(formatFlowRate(1.2857143, 'tr')).toBe('1,3');
    expect(formatFlowRate(0.05, 'en')).toBe('0.1');
    expect(formatFlowRate(2.5)).toBe('2.5');
    expect(formatFlowRate(12.86, 'en')).toBe('12.9');
  });

  it('renders zero and non-finite input as 0', () => {
    expect(formatFlowRate(0, 'en')).toBe('0');
    expect(formatFlowRate(Number.NaN, 'en')).toBe('0');
    expect(formatFlowRate(Number.POSITIVE_INFINITY, 'tr')).toBe('0');
  });
});

describe('formatDuration', () => {
  it.each([
    [45, '45s', '45 sn'],
    [270, '4m 30s', '4 dk 30 sn'],
    [43200, '12h', '12 sa'],
    [5400, '1h 30m', '1 sa 30 dk'],
    [60, '1m', '1 dk'],
    [3599, '59m 59s', '59 dk 59 sn'],
  ])('%s seconds → %s (en) / %s (tr)', (seconds, en, tr) => {
    expect(formatDuration(seconds, 'en')).toBe(en);
    expect(formatDuration(seconds, 'tr')).toBe(tr);
  });

  it('shows at most two units, rounding the smaller one', () => {
    expect(formatDuration(3661, 'en')).toBe('1h 1m');
    expect(formatDuration(3690, 'en')).toBe('1h 2m');
    expect(formatDuration(7199, 'en')).toBe('2h');
  });

  it('rounds to whole seconds', () => {
    expect(formatDuration(44.6, 'en')).toBe('45s');
    expect(formatDuration(59.6, 'en')).toBe('1m');
  });

  it('groups large hour counts by locale', () => {
    expect(formatDuration(2147483647, 'en')).toBe('596,523h 14m');
    expect(formatDuration(2147483647, 'tr')).toBe('596.523 sa 14 dk');
  });

  it('renders zero, negative and non-finite input as 0 seconds (never a minus sign)', () => {
    expect(formatDuration(0, 'en')).toBe('0s');
    expect(formatDuration(-5, 'en')).toBe('0s');
    expect(formatDuration(Number.NaN, 'tr')).toBe('0 sn');
  });

  it('defaults to the en locale', () => {
    expect(formatDuration(90)).toBe('1m 30s');
  });
});

describe('formatDurationParts', () => {
  it('returns one or two localized unit parts, largest first', () => {
    expect(formatDurationParts(270, 'en')).toEqual(['4m', '30s']);
    expect(formatDurationParts(270, 'tr')).toEqual(['4 dk', '30 sn']);
    expect(formatDurationParts(43200, 'tr')).toEqual(['12 sa']);
    expect(formatDurationParts(45, 'en')).toEqual(['45s']);
  });

  it('joins to formatDuration', () => {
    for (const seconds of [0, 45, 270, 3599, 5400, 43200]) {
      expect(formatDurationParts(seconds, 'tr').join(' ')).toBe(formatDuration(seconds, 'tr'));
    }
  });
});

describe('formatDurationTick', () => {
  it('labels a tick in the unit of the step', () => {
    expect(formatDurationTick(7200, 7200, 'en')).toBe('2h');
    expect(formatDurationTick(7200, 7200, 'tr')).toBe('2 sa');
    expect(formatDurationTick(120, 60, 'en')).toBe('2m');
    expect(formatDurationTick(90, 15, 'en')).toBe('90s');
    expect(formatDurationTick(25, 5, 'tr')).toBe('25 sn');
  });

  it('keeps hours for multi-day steps', () => {
    expect(formatDurationTick(172800, 172800, 'en')).toBe('48h');
  });

  it('labels the origin as a bare 0', () => {
    expect(formatDurationTick(0, 7200, 'en')).toBe('0');
    expect(formatDurationTick(0, 5, 'tr')).toBe('0');
  });
});
