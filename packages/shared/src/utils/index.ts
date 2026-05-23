/**
 * Unit conversion and formatting utilities for canonical metric storage.
 * All numeric values are stored in metric (grams, mL, Celsius, seconds).
 * These functions convert between metric and imperial for UI display.
 */
export {
  convertFlOzToMl,
  convertFtoC,
  convertGramsToOunces,
  convertMlToFlOz,
  convertOuncesToGrams,
  formatTemperature,
  formatVolume,
  formatWeight,
} from './conversion.ts';

/** Coffee brewing metrics: brew ratio, extraction yield, flow rate. */
export {
  computeBrewRatio,
  computeExtractionYield,
  computeExtractionYieldFromTds,
  computeFlowRate,
} from './metrics.ts';
/** Recipe validation: hard (blocks save) and soft (warnings only) checks. */
export {
  validateBrewMethodCompatibility,
  validateGrindDateNotBeforeRoastDate,
  validateSoftWarnings,
} from './validation.ts';
export { formatDate, isDateBefore } from './date.ts';
export { ensureUniqueSlug, generateSlug } from './slug.ts';
export { escapeHtml, escapeHtmlAttr } from './html.ts';
export { generateUniqueUsername } from './username.ts';
