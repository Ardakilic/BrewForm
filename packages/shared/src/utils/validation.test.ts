import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  validateBrewMethodCompatibility,
  validateGrindDateNotBeforeRoastDate,
  validateSoftWarnings,
} from './validation.ts';

describe('Validation', () => {
  describe('validateGrindDateNotBeforeRoastDate', () => {
    it('should return true when grind date is after roast date', () => {
      expect(validateGrindDateNotBeforeRoastDate('2026-04-10', '2026-03-15')).toBe(true);
    });

    it('should return true when grind date equals roast date', () => {
      expect(validateGrindDateNotBeforeRoastDate('2026-03-15', '2026-03-15')).toBe(true);
    });

    it('should return false when grind date is before roast date', () => {
      expect(validateGrindDateNotBeforeRoastDate('2026-03-10', '2026-03-15')).toBe(false);
    });
  });

  describe('validateBrewMethodCompatibility', () => {
    it('should accept compatible brew method and drink type', () => {
      expect(validateBrewMethodCompatibility('espresso_machine', 'espresso')).toBe(true);
      expect(validateBrewMethodCompatibility('v60', 'pour_over')).toBe(true);
      expect(validateBrewMethodCompatibility('french_press', 'french_press')).toBe(true);
    });

    it('should reject incompatible brew method and drink type', () => {
      expect(validateBrewMethodCompatibility('turkish_coffee', 'espresso')).toBe(false);
      expect(validateBrewMethodCompatibility('v60', 'latte')).toBe(false);
    });

    it('should reject invalid brew method', () => {
      // @ts-expect-error — testing runtime defense against invalid input
      expect(validateBrewMethodCompatibility('invalid_method', 'espresso')).toBe(false);
    });

    it('should reject invalid drink type', () => {
      // @ts-expect-error — testing runtime defense against invalid input
      expect(validateBrewMethodCompatibility('espresso_machine', 'invalid_drink')).toBe(false);
    });
  });

  describe('validateSoftWarnings', () => {
    it('should warn about low espresso ratio', () => {
      const warnings = validateSoftWarnings({
        brewMethod: 'espresso_machine',
        groundWeightGrams: 18,
        extractionVolumeMl: 22,
      });
      expect(warnings.some((w) => w.field === 'extractionVolumeMl')).toBe(true);
    });

    it('should warn about high espresso ratio', () => {
      const warnings = validateSoftWarnings({
        brewMethod: 'espresso_machine',
        groundWeightGrams: 18,
        extractionVolumeMl: 60,
      });
      expect(warnings.some((w) => w.field === 'extractionVolumeMl')).toBe(true);
    });

    it('should warn about short espresso extraction time', () => {
      const warnings = validateSoftWarnings({
        brewMethod: 'espresso_machine',
        extractionTimeSeconds: 10,
      });
      expect(warnings.some((w) => w.field === 'extractionTimeSeconds')).toBe(true);
    });

    it('should warn about long espresso extraction time', () => {
      const warnings = validateSoftWarnings({
        brewMethod: 'espresso_machine',
        extractionTimeSeconds: 65,
      });
      expect(warnings.some((w) => w.field === 'extractionTimeSeconds')).toBe(true);
    });

    it('should warn about espresso temperature outside range', () => {
      const lowTemp = validateSoftWarnings({
        brewMethod: 'espresso_machine',
        temperatureCelsius: 85,
      });
      expect(lowTemp.some((w) => w.field === 'temperatureCelsius')).toBe(true);

      const highTemp = validateSoftWarnings({
        brewMethod: 'espresso_machine',
        temperatureCelsius: 98,
      });
      expect(highTemp.some((w) => w.field === 'temperatureCelsius')).toBe(true);
    });

    it('should return no warnings for normal espresso', () => {
      const warnings = validateSoftWarnings({
        brewMethod: 'espresso_machine',
        groundWeightGrams: 18,
        extractionVolumeMl: 36,
        extractionTimeSeconds: 28,
        temperatureCelsius: 93,
        grindSize: 'fine',
        productName: 'Ethiopia Yirgacheffe',
      });
      expect(warnings.length).toBe(0);
    });

    it('should warn about missing grind size', () => {
      const warnings = validateSoftWarnings({
        brewMethod: 'v60',
      });
      expect(warnings.some((w) => w.field === 'grindSize')).toBe(true);
    });

    it('should warn about missing product name and coffee brand', () => {
      const warnings = validateSoftWarnings({
        brewMethod: 'v60',
        grindSize: 'medium',
      });
      expect(warnings.some((w) => w.field === 'productName')).toBe(true);
    });

    it('should not warn about product name when coffee brand is provided', () => {
      const warnings = validateSoftWarnings({
        brewMethod: 'v60',
        grindSize: 'medium',
        coffeeBrand: 'Blue Bottle',
      });
      expect(warnings.some((w) => w.field === 'productName')).toBe(false);
    });

    it('should warn about milk preparations on non-milk drink type', () => {
      const warnings = validateSoftWarnings({
        brewMethod: 'espresso_machine',
        drinkType: 'espresso',
        additionalPreparations: [{ name: 'Steamed Milk', type: 'milk', preparationType: 'milk' }],
      });
      expect(warnings.some((w) => w.field === 'additionalPreparations')).toBe(true);
    });

    it('should not warn about milk preparations on milk drink type', () => {
      const warnings = validateSoftWarnings({
        brewMethod: 'espresso_machine',
        drinkType: 'latte',
        additionalPreparations: [{ name: 'Steamed Milk', type: 'milk', preparationType: 'milk' }],
      });
      expect(warnings.some((w) => w.field === 'additionalPreparations')).toBe(false);
    });
  });
});
