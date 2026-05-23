import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { computeExtractionYieldFromTds } from './metrics.ts';

describe('computeExtractionYieldFromTds', () => {
  it('computes correctly for a typical pour-over (1.35% TDS, 250ml, 15g)', () => {
    const result = computeExtractionYieldFromTds(1.35, 250, 15);
    expect(result).not.toBeNull();
    expect(Math.abs(result! - 22.5)).toBeLessThan(0.01);
  });

  it('returns 0 when tds is 0 (valid yield)', () => {
    expect(computeExtractionYieldFromTds(0, 250, 15)).toBe(0);
  });

  it('returns null when groundWeight is 0 (division by zero guard)', () => {
    expect(computeExtractionYieldFromTds(1.35, 250, 0)).toBeNull();
  });

  it('returns null when extractionVolume is 0', () => {
    expect(computeExtractionYieldFromTds(1.35, 0, 15)).toBeNull();
  });
});
