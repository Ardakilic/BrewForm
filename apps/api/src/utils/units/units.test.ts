/**
 * Units Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import {
  gramsToOunces,
  ouncesToGrams,
  formatWeight,
  mlToFlOz,
  flOzToMl,
  formatVolume,
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  formatTemperature,
  formatTime,
  parseTimeToSeconds,
  calculateBrewRatio,
  formatBrewRatio,
  calculateFlowRate,
  formatFlowRate,
  estimateExtractionYield,
  toCanonicalUnits,
  fromCanonicalUnits,
} from './index.js';

describe('Units Utilities', () => {
  describe('Weight Conversions', () => {
    describe('gramsToOunces', () => {
      it('should convert grams to ounces', () => {
        expect(gramsToOunces(28.3495)).toBeCloseTo(1, 2);
        expect(gramsToOunces(100)).toBeCloseTo(3.527, 2);
        expect(gramsToOunces(0)).toBe(0);
      });
    });

    describe('ouncesToGrams', () => {
      it('should convert ounces to grams', () => {
        expect(ouncesToGrams(1)).toBeCloseTo(28.3495, 2);
        expect(ouncesToGrams(3.527)).toBeCloseTo(100, 0);
        expect(ouncesToGrams(0)).toBe(0);
      });
    });

    describe('formatWeight', () => {
      it('should format in metric', () => {
        expect(formatWeight(18, 'metric')).toBe('18.0 g');
        expect(formatWeight(18.5, 'metric', 2)).toBe('18.50 g');
      });

      it('should format in imperial', () => {
        expect(formatWeight(28.3495, 'imperial')).toBe('1.0 oz');
        expect(formatWeight(100, 'imperial', 2)).toMatch(/oz$/);
      });

      it('should default to metric', () => {
        expect(formatWeight(18)).toBe('18.0 g');
      });
    });
  });

  describe('Volume Conversions', () => {
    describe('mlToFlOz', () => {
      it('should convert ml to fluid ounces', () => {
        expect(mlToFlOz(29.5735)).toBeCloseTo(1, 2);
        expect(mlToFlOz(100)).toBeCloseTo(3.381, 2);
        expect(mlToFlOz(0)).toBe(0);
      });
    });

    describe('flOzToMl', () => {
      it('should convert fluid ounces to ml', () => {
        expect(flOzToMl(1)).toBeCloseTo(29.5735, 2);
        expect(flOzToMl(0)).toBe(0);
      });
    });

    describe('formatVolume', () => {
      it('should format in metric', () => {
        expect(formatVolume(36, 'metric')).toBe('36.0 ml');
        expect(formatVolume(250, 'metric', 0)).toBe('250 ml');
      });

      it('should format in imperial', () => {
        expect(formatVolume(29.5735, 'imperial')).toBe('1.0 fl oz');
      });

      it('should default to metric', () => {
        expect(formatVolume(36)).toBe('36.0 ml');
      });
    });
  });

  describe('Temperature Conversions', () => {
    describe('celsiusToFahrenheit', () => {
      it('should convert Celsius to Fahrenheit', () => {
        expect(celsiusToFahrenheit(0)).toBe(32);
        expect(celsiusToFahrenheit(100)).toBe(212);
        expect(celsiusToFahrenheit(93)).toBeCloseTo(199.4, 1);
      });
    });

    describe('fahrenheitToCelsius', () => {
      it('should convert Fahrenheit to Celsius', () => {
        expect(fahrenheitToCelsius(32)).toBe(0);
        expect(fahrenheitToCelsius(212)).toBe(100);
        expect(fahrenheitToCelsius(200)).toBeCloseTo(93.3, 1);
      });
    });

    describe('formatTemperature', () => {
      it('should format in metric', () => {
        expect(formatTemperature(93, 'metric')).toBe('93°C');
        expect(formatTemperature(93.5, 'metric', 1)).toBe('93.5°C');
      });

      it('should format in imperial', () => {
        expect(formatTemperature(93, 'imperial')).toBe('199°F');
      });

      it('should default to metric', () => {
        expect(formatTemperature(93)).toBe('93°C');
      });
    });
  });

  describe('Time Formatting', () => {
    describe('formatTime', () => {
      it('should format seconds only', () => {
        expect(formatTime(30)).toBe('30s');
        expect(formatTime(59)).toBe('59s');
      });

      it('should format minutes and seconds', () => {
        expect(formatTime(60)).toBe('1m');
        expect(formatTime(90)).toBe('1m 30s');
        expect(formatTime(180)).toBe('3m');
      });

      it('should format hours and minutes', () => {
        expect(formatTime(3600)).toBe('1h');
        expect(formatTime(5400)).toBe('1h 30m');
        expect(formatTime(7200)).toBe('2h');
      });
    });

    describe('parseTimeToSeconds', () => {
      it('should parse seconds format', () => {
        expect(parseTimeToSeconds('30s')).toBe(30);
        expect(parseTimeToSeconds('45S')).toBe(45);
      });

      it('should parse minutes format', () => {
        expect(parseTimeToSeconds('3m')).toBe(180);
        expect(parseTimeToSeconds('3m 30s')).toBe(210);
      });

      it('should parse hours format', () => {
        expect(parseTimeToSeconds('1h')).toBe(3600);
        expect(parseTimeToSeconds('1h 30m')).toBe(5400);
      });

      it('should return null for invalid format', () => {
        expect(parseTimeToSeconds('invalid')).toBeNull();
        expect(parseTimeToSeconds('30')).toBeNull();
        expect(parseTimeToSeconds('')).toBeNull();
      });
    });
  });

  describe('Brew Metrics', () => {
    describe('calculateBrewRatio', () => {
      it('should calculate correct brew ratio', () => {
        expect(calculateBrewRatio(18, 36)).toBe(2);
        expect(calculateBrewRatio(15, 250)).toBeCloseTo(16.67, 1);
        expect(calculateBrewRatio(20, 40)).toBe(2);
      });
    });

    describe('formatBrewRatio', () => {
      it('should format brew ratio as 1:X', () => {
        expect(formatBrewRatio(18, 36)).toBe('1:2.0');
        expect(formatBrewRatio(15, 250)).toBe('1:16.7');
      });
    });

    describe('calculateFlowRate', () => {
      it('should calculate flow rate in ml/sec', () => {
        expect(calculateFlowRate(36, 28)).toBeCloseTo(1.29, 2);
        expect(calculateFlowRate(100, 50)).toBe(2);
      });
    });

    describe('formatFlowRate', () => {
      it('should format flow rate', () => {
        expect(formatFlowRate(36, 28)).toMatch(/ml\/s$/);
        expect(formatFlowRate(100, 50)).toBe('2.00 ml/s');
      });
    });

    describe('estimateExtractionYield', () => {
      it('should estimate extraction yield', () => {
        const result = estimateExtractionYield(18, 36);
        expect(result).toBeCloseTo(2.7, 1);
      });

      it('should use custom TDS', () => {
        const result = estimateExtractionYield(18, 36, 2.0);
        expect(result).toBe(4);
      });
    });
  });

  describe('Unit System Conversions', () => {
    describe('toCanonicalUnits', () => {
      it('should pass through metric values', () => {
        expect(toCanonicalUnits(18, 'weight', 'metric')).toBe(18);
        expect(toCanonicalUnits(36, 'volume', 'metric')).toBe(36);
        expect(toCanonicalUnits(93, 'temperature', 'metric')).toBe(93);
      });

      it('should convert imperial weight to grams', () => {
        expect(toCanonicalUnits(1, 'weight', 'imperial')).toBeCloseTo(28.3495, 2);
      });

      it('should convert imperial volume to ml', () => {
        expect(toCanonicalUnits(1, 'volume', 'imperial')).toBeCloseTo(29.5735, 2);
      });

      it('should convert imperial temperature to Celsius', () => {
        expect(toCanonicalUnits(200, 'temperature', 'imperial')).toBeCloseTo(93.3, 1);
      });
    });

    describe('fromCanonicalUnits', () => {
      it('should pass through metric values', () => {
        expect(fromCanonicalUnits(18, 'weight', 'metric')).toBe(18);
        expect(fromCanonicalUnits(36, 'volume', 'metric')).toBe(36);
        expect(fromCanonicalUnits(93, 'temperature', 'metric')).toBe(93);
      });

      it('should convert grams to imperial weight', () => {
        expect(fromCanonicalUnits(28.3495, 'weight', 'imperial')).toBeCloseTo(1, 2);
      });

      it('should convert ml to imperial volume', () => {
        expect(fromCanonicalUnits(29.5735, 'volume', 'imperial')).toBeCloseTo(1, 2);
      });

      it('should convert Celsius to imperial temperature', () => {
        expect(fromCanonicalUnits(93, 'temperature', 'imperial')).toBeCloseTo(199.4, 1);
      });
    });
  });
});
