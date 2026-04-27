import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  convertGramsToOunces,
  convertOuncesToGrams,
  convertMlToFlOz,
  convertFlOzToMl,
  convertCtoF,
  convertFtoC,
  formatWeight,
  formatVolume,
  formatTemperature,
} from './conversion.ts';

describe('Unit Conversions', () => {
  describe('convertGramsToOunces', () => {
    it('should convert grams to ounces correctly', () => {
      expect(convertGramsToOunces(28.3495)).toBeCloseTo(1, 3);
      expect(convertGramsToOunces(0)).toBe(0);
      expect(convertGramsToOunces(100)).toBeCloseTo(3.527, 2);
    });
  });

  describe('convertOuncesToGrams', () => {
    it('should convert ounces to grams correctly', () => {
      expect(convertOuncesToGrams(1)).toBeCloseTo(28.3495, 3);
      expect(convertOuncesToGrams(0)).toBe(0);
    });
  });

  describe('convertMlToFlOz', () => {
    it('should convert milliliters to fluid ounces', () => {
      expect(convertMlToFlOz(29.5735)).toBeCloseTo(1, 3);
      expect(convertMlToFlOz(0)).toBe(0);
    });
  });

  describe('convertFlOzToMl', () => {
    it('should convert fluid ounces to milliliters', () => {
      expect(convertFlOzToMl(1)).toBeCloseTo(29.5735, 3);
      expect(convertFlOzToMl(0)).toBe(0);
    });
  });

  describe('convertCtoF', () => {
    it('should convert Celsius to Fahrenheit', () => {
      expect(convertCtoF(0)).toBe(32);
      expect(convertCtoF(100)).toBe(212);
      expect(convertCtoF(93)).toBeCloseTo(199.4, 1);
    });

    it('should handle negative temperatures', () => {
      expect(convertCtoF(-40)).toBe(-40);
    });
  });

  describe('convertFtoC', () => {
    it('should convert Fahrenheit to Celsius', () => {
      expect(convertFtoC(32)).toBe(0);
      expect(convertFtoC(212)).toBe(100);
    });

    it('should handle negative temperatures', () => {
      expect(convertFtoC(-40)).toBe(-40);
    });
  });

  describe('formatWeight', () => {
    it('should format metric weight', () => {
      expect(formatWeight(18, 'metric')).toBe('18.0 g');
    });

    it('should format imperial weight', () => {
      expect(formatWeight(28.3495, 'imperial')).toBe('1.0 oz');
    });

    it('should format zero weight', () => {
      expect(formatWeight(0, 'metric')).toBe('0.0 g');
    });
  });

  describe('formatVolume', () => {
    it('should format metric volume', () => {
      expect(formatVolume(36, 'metric')).toBe('36 ml');
    });

    it('should format imperial volume', () => {
      expect(formatVolume(29.5735, 'imperial')).toBe('1.0 fl oz');
    });
  });

  describe('formatTemperature', () => {
    it('should format Celsius', () => {
      expect(formatTemperature(93, 'celsius')).toBe('93.0\u00B0C');
    });

    it('should format Fahrenheit', () => {
      expect(formatTemperature(93, 'fahrenheit')).toBe('199.4\u00B0F');
    });
  });
});