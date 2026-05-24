/**
 * Validation utilities shared between API and frontend.
 *
 * Functions in this module perform domain-level validation that goes
 * beyond simple schema checks — date ordering, brew-method/drink-type
 * compatibility, and "soft" warnings that hint at potential issues
 * without blocking submission.
 */

import { BREW_METHODS } from '../constants/brew-methods.ts';
import { DRINK_TYPES } from '../constants/drink-types.ts';

/**
 * Validates that the grind date is not earlier than the roast date.
 *
 * @returns `true` if grindDate is on or after roastDate, `false` otherwise.
 */
export function validateGrindDateNotBeforeRoastDate(grindDate: string, roastDate: string): boolean {
  return new Date(grindDate) >= new Date(roastDate);
}

/**
 * Checks whether the given brew method can produce the given drink type.
 *
 * Consult {@link BREW_METHODS} and {@link DRINK_TYPES} constants for
 * the compatibility matrix.
 *
 * @returns `true` if the combination is compatible, `false` if either
 *          value is unrecognised or the combination is invalid.
 */
export function validateBrewMethodCompatibility(brewMethod: string, drinkType: string): boolean {
  const method = BREW_METHODS.find((m) => m.value === brewMethod);
  if (!method) return false;
  const drink = DRINK_TYPES.find((d) => d.value === drinkType);
  if (!drink) return false;
  return (drink.compatibleMethods as readonly string[]).includes(brewMethod as string);
}

/**
 * A non-blocking warning about a potential issue in recipe data.
 *
 * Soft warnings are advisory — they do not prevent saving but
 * are shown to the user as suggestions for improvement.
 */
export interface SoftWarning {
  /** The form field the warning relates to */
  field: string;
  /** Human-readable warning message */
  message: string;
}

/**
 * Generates advisory warnings for recipe creation/editing.
 *
 * Checks include:
 * - Espresso ratio outliers (< 1:1.5 or > 1:3)
 * - Unusually short or long espresso extraction times
 * - Brew temperature outside common range for espresso
 * - Missing grind size
 * - Missing product or brand name
 * - Milk preparations on non-milk drink types
 * - Missing equipment
 *
 * @returns An array of {@link SoftWarning} objects (empty if no issues found).
 */
export function validateSoftWarnings(data: {
  brewMethod?: string;
  extractionTimeSeconds?: number;
  temperatureCelsius?: number;
  groundWeightGrams?: number;
  extractionVolumeMl?: number;
  drinkType?: string;
  additionalPreparations?: Array<{ name: string; type: string; preparationType?: string }>;
  grindSize?: string;
  productName?: string;
  coffeeBrand?: string;
  vendorId?: string;
  roastDate?: string;
  equipmentIds?: string[];
}): SoftWarning[] {
  const warnings: SoftWarning[] = [];

  if (data.brewMethod === 'espresso_machine' && data.groundWeightGrams && data.extractionVolumeMl) {
    const ratio = data.extractionVolumeMl / data.groundWeightGrams;
    if (ratio < 1.5) {
      warnings.push({
        field: 'extractionVolumeMl',
        message: 'Espresso ratio is below typical range (< 1:1.5)',
      });
    } else if (ratio > 3) {
      warnings.push({
        field: 'extractionVolumeMl',
        message: 'Espresso ratio is above typical range (> 1:3)',
      });
    }
  }

  if (data.brewMethod === 'espresso_machine' && data.extractionTimeSeconds) {
    if (data.extractionTimeSeconds < 15) {
      warnings.push({
        field: 'extractionTimeSeconds',
        message: 'Extraction time is unusually short for espresso',
      });
    } else if (data.extractionTimeSeconds > 60) {
      warnings.push({
        field: 'extractionTimeSeconds',
        message: 'Extraction time is unusually long for espresso',
      });
    }
  }

  if (data.brewMethod === 'espresso_machine' && data.temperatureCelsius) {
    if (data.temperatureCelsius < 88 || data.temperatureCelsius > 96) {
      warnings.push({
        field: 'temperatureCelsius',
        message: 'Brew temperature is outside common range for espresso (88-96\u00B0C)',
      });
    }
  }

  if (data.grindSize === undefined || data.grindSize === null) {
    warnings.push({
      field: 'grindSize',
      message: 'Grind size is a helpful detail — consider adding it',
    });
  }

  if (!data.productName && !data.coffeeBrand) {
    warnings.push({
      field: 'productName',
      message: 'Adding a product name or coffee brand helps identify this recipe',
    });
  }

  const milkDrinks = ['latte', 'flat_white', 'cappuccino', 'cortado', 'macchiato'];
  if (data.drinkType && !milkDrinks.includes(data.drinkType)) {
    const hasMilkPrep = data.additionalPreparations?.some(
      (p) => p.type === 'milk' || p.preparationType === 'milk',
    );
    if (hasMilkPrep) {
      warnings.push({
        field: 'additionalPreparations',
        message: 'This drink type typically does not include milk preparations',
      });
    }
  }

  if (data.brewMethod && data.equipmentIds && data.equipmentIds.length === 0) {
    warnings.push({
      field: 'equipmentIds',
      message: 'Consider adding equipment to this recipe for better detail',
    });
  }

  return warnings;
}
