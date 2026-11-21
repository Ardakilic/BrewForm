/**
 * Tests for the chart value-sanitizing helpers.
 *
 * Feature: wave-6-audit-remediation (t6, chart-rendering → "Shared chart primitives module")
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clamp, clampPct, safeRatio, sanitizeNumber } from './scale.ts';

describe('sanitizeNumber', () => {
  it('returns finite numbers unchanged', () => {
    expect(sanitizeNumber(3.5)).toBe(3.5);
    expect(sanitizeNumber(-2)).toBe(-2);
    expect(sanitizeNumber(0)).toBe(0);
  });

  it('returns the default fallback (0) for NaN, ±Infinity, null and undefined', () => {
    expect(sanitizeNumber(Number.NaN)).toBe(0);
    expect(sanitizeNumber(Number.POSITIVE_INFINITY)).toBe(0);
    expect(sanitizeNumber(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(sanitizeNumber(null)).toBe(0);
    expect(sanitizeNumber(undefined)).toBe(0);
  });

  it('returns the fallback for strings, even numeric-looking ones', () => {
    expect(sanitizeNumber('5')).toBe(0);
    expect(sanitizeNumber('abc', 7)).toBe(7);
    expect(sanitizeNumber('')).toBe(0);
  });

  it('returns the fallback for other non-numbers', () => {
    expect(sanitizeNumber({}, 1)).toBe(1);
    expect(sanitizeNumber([], 1)).toBe(1);
    expect(sanitizeNumber(true, 1)).toBe(1);
  });

  it('honours a custom fallback', () => {
    expect(sanitizeNumber(Number.NaN, 42)).toBe(42);
    expect(sanitizeNumber(undefined, -1)).toBe(-1);
  });
});

describe('clamp', () => {
  it('leaves an in-range value unchanged', () => {
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('clamps values below and above the range', () => {
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(9, 0, 3)).toBe(3);
  });

  it('sanitizes non-finite input (spec scenario "Non-finite input is sanitized")', () => {
    expect(clamp(Number.NaN, 0, 3)).toBe(0);
    expect(clamp(Number.POSITIVE_INFINITY, 0, 3)).toBe(3);
    expect(clamp(Number.NEGATIVE_INFINITY, 0, 3)).toBe(0);
    expect(clamp(undefined, 0, 3)).toBe(0);
    expect(clamp(null, 0, 3)).toBe(0);
  });

  it('treats strings as non-numbers', () => {
    expect(clamp('2', 0, 3)).toBe(0);
  });

  it('pulls a sanitized fallback of 0 into a range that excludes 0', () => {
    expect(clamp(Number.NaN, 5, 10)).toBe(5);
    expect(clamp(undefined, -10, -5)).toBe(-5);
  });

  it('swaps reversed min/max', () => {
    expect(clamp(5, 3, 0)).toBe(3);
    expect(clamp(-5, 3, 0)).toBe(0);
    expect(clamp(1.5, 3, 0)).toBe(1.5);
    expect(clamp(Number.POSITIVE_INFINITY, 3, 0)).toBe(3);
  });

  it('PBT: output always lies in [min, max] (bounds possibly reversed)', () => {
    const anyValue = fc.oneof(
      fc.double(),
      fc.constantFrom(null, undefined, 'x', '12', Number.NaN),
      fc.integer(),
    );
    const bound = fc.double({ noNaN: true, noDefaultInfinity: true });
    fc.assert(
      fc.property(anyValue, bound, bound, (value, a, b) => {
        const result = clamp(value, a, b);
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        expect(Number.isNaN(result)).toBe(false);
        expect(result).toBeGreaterThanOrEqual(lo);
        expect(result).toBeLessThanOrEqual(hi);
      }),
      { numRuns: 500 },
    );
  });
});

describe('clampPct', () => {
  it('clamps to [0, 100]', () => {
    expect(clampPct(-12)).toBe(0);
    expect(clampPct(140)).toBe(100);
    expect(clampPct(42.5)).toBe(42.5);
  });

  it('maps non-finite input into range', () => {
    expect(clampPct(Number.NaN)).toBe(0);
    expect(clampPct(Number.POSITIVE_INFINITY)).toBe(100);
    expect(clampPct(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(clampPct(undefined)).toBe(0);
  });
});

describe('safeRatio', () => {
  it('divides finite numbers', () => {
    expect(safeRatio(5, 28)).toBeCloseTo(5 / 28);
    expect(safeRatio(-4, 2)).toBe(-2);
  });

  it('returns the fallback (0 by default) for a zero denominator', () => {
    expect(safeRatio(5, 0)).toBe(0);
    expect(safeRatio(5, -0)).toBe(0);
    expect(safeRatio(5, 0, 1)).toBe(1);
  });

  it('returns the fallback for a NaN or infinite denominator', () => {
    expect(safeRatio(5, Number.NaN)).toBe(0);
    expect(safeRatio(5, Number.POSITIVE_INFINITY)).toBe(0);
    expect(safeRatio(5, undefined)).toBe(0);
  });

  it('returns the fallback for a non-finite numerator', () => {
    expect(safeRatio(Number.NaN, 2)).toBe(0);
    expect(safeRatio(Number.POSITIVE_INFINITY, 2, -1)).toBe(-1);
    expect(safeRatio(null, 2)).toBe(0);
  });

  it('returns the fallback when the quotient overflows', () => {
    expect(safeRatio(Number.MAX_VALUE, Number.MIN_VALUE)).toBe(0);
  });
});
