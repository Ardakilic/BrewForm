import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { formatDate, isDateBefore } from './date.ts';

describe('Date Utilities', () => {
  describe('formatDate', () => {
    it('should format a Date object with default format', () => {
      const date = new Date('2026-04-25');
      const result = formatDate(date);
      expect(result).toBe('2026-04-25');
    });

    it('should format an ISO date string', () => {
      const result = formatDate('2026-04-25');
      expect(result).toBe('2026-04-25');
    });

    it('should format with custom format', () => {
      const result = formatDate('2026-04-25', 'dd/MM/yyyy');
      expect(result).toBe('25/04/2026');
    });

    it('should return empty string for invalid date', () => {
      expect(formatDate('not-a-date')).toBe('');
    });
  });

  describe('isDateBefore', () => {
    it('should return true when first date is before second', () => {
      expect(isDateBefore('2026-04-10', '2026-04-15')).toBe(true);
    });

    it('should return false when first date is after second', () => {
      expect(isDateBefore('2026-04-15', '2026-04-10')).toBe(false);
    });

    it('should return false for same dates', () => {
      expect(isDateBefore('2026-04-10', '2026-04-10')).toBe(false);
    });

    it('should work with Date objects', () => {
      expect(isDateBefore(new Date('2026-01-01'), new Date('2026-12-31'))).toBe(true);
    });
  });
});
