import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { computeBrewRatio, computeFlowRate, computeExtractionYield } from './metrics.ts';

describe('Brew Metrics', () => {
  describe('computeBrewRatio', () => {
    it('should compute brew ratio correctly', () => {
      expect(computeBrewRatio(18, 36)).toBe(2);
      expect(computeBrewRatio(15, 250)).toBeCloseTo(16.67, 1);
    });

    it('should return null for zero dose', () => {
      expect(computeBrewRatio(0, 36)).toBeNull();
    });

    it('should return null for null dose', () => {
      expect(computeBrewRatio(null as unknown as number, 36)).toBeNull();
    });

    it('should return null for zero yield', () => {
      expect(computeBrewRatio(18, 0)).toBeNull();
    });
  });

  describe('computeFlowRate', () => {
    it('should compute flow rate correctly', () => {
      expect(computeFlowRate(36, 28)).toBeCloseTo(1.29, 1);
      expect(computeFlowRate(250, 210)).toBeCloseTo(1.19, 1);
    });

    it('should return null for zero time', () => {
      expect(computeFlowRate(36, 0)).toBeNull();
    });

    it('should return null for zero yield', () => {
      expect(computeFlowRate(0, 28)).toBeNull();
    });
  });

  describe('computeExtractionYield', () => {
    it('should compute extraction yield correctly', () => {
      expect(computeExtractionYield(18, 36)).toBeCloseTo(100, 1);
      expect(computeExtractionYield(18, 19.8)).toBeCloseTo(10, 1);
      expect(computeExtractionYield(15, 16.5)).toBeCloseTo(10, 1);
    });

    it('should return null for zero dose', () => {
      expect(computeExtractionYield(0, 36)).toBeNull();
    });

    it('should return null for zero yield', () => {
      expect(computeExtractionYield(18, 0)).toBeNull();
    });

    it('should return negative yield when output is less than input', () => {
      expect(computeExtractionYield(18, 9)).toBeCloseTo(-50, 1);
    });
  });
});