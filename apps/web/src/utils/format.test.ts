/**
 * Tests for locale-aware formatting helpers.
 *
 * Feature: wave-5-debt-clearance (T4.4)
 * Validates en vs tr output for both formatDate and formatNumber.
 */
import { describe, expect, it } from 'vitest';
import { formatDate, formatNumber } from './format.ts';

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
});
