/**
 * BrewForm Unit Conversion Utilities
 * All conversions are UI-layer only - canonical storage is always metric
 */

// ============================================
// Constants
// ============================================

const GRAMS_PER_OUNCE = 28.3495;
const ML_PER_FL_OZ = 29.5735;
const FAHRENHEIT_OFFSET = 32;
const FAHRENHEIT_RATIO = 9 / 5;

// ============================================
// Weight Conversions
// ============================================

/**
 * Convert grams to ounces (for display)
 */
export function gramsToOunces(grams: number): number {
  return grams / GRAMS_PER_OUNCE;
}

/**
 * Convert ounces to grams (for storage)
 */
export function ouncesToGrams(ounces: number): number {
  return ounces * GRAMS_PER_OUNCE;
}

/**
 * Format weight for display
 */
export function formatWeight(
  grams: number,
  unit: 'metric' | 'imperial' = 'metric',
  precision = 1
): string {
  if (unit === 'imperial') {
    const ounces = gramsToOunces(grams);
    return `${ounces.toFixed(precision)} oz`;
  }
  return `${grams.toFixed(precision)} g`;
}

// ============================================
// Volume Conversions
// ============================================

/**
 * Convert milliliters to fluid ounces (for display)
 */
export function mlToFlOz(ml: number): number {
  return ml / ML_PER_FL_OZ;
}

/**
 * Convert fluid ounces to milliliters (for storage)
 */
export function flOzToMl(flOz: number): number {
  return flOz * ML_PER_FL_OZ;
}

/**
 * Format volume for display
 */
export function formatVolume(
  ml: number,
  unit: 'metric' | 'imperial' = 'metric',
  precision = 1
): string {
  if (unit === 'imperial') {
    const flOz = mlToFlOz(ml);
    return `${flOz.toFixed(precision)} fl oz`;
  }
  return `${ml.toFixed(precision)} ml`;
}

// ============================================
// Temperature Conversions
// ============================================

/**
 * Convert Celsius to Fahrenheit (for display)
 */
export function celsiusToFahrenheit(celsius: number): number {
  return celsius * FAHRENHEIT_RATIO + FAHRENHEIT_OFFSET;
}

/**
 * Convert Fahrenheit to Celsius (for storage)
 */
export function fahrenheitToCelsius(fahrenheit: number): number {
  return (fahrenheit - FAHRENHEIT_OFFSET) / FAHRENHEIT_RATIO;
}

/**
 * Format temperature for display
 */
export function formatTemperature(
  celsius: number,
  unit: 'metric' | 'imperial' = 'metric',
  precision = 0
): string {
  if (unit === 'imperial') {
    const fahrenheit = celsiusToFahrenheit(celsius);
    return `${fahrenheit.toFixed(precision)}°F`;
  }
  return `${celsius.toFixed(precision)}°C`;
}

// ============================================
// Time Formatting
// ============================================

/**
 * Format seconds for display
 */
export function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }
  
  const hours = Math.floor(seconds / 3600);
  const remainingMinutes = Math.floor((seconds % 3600) / 60);
  return remainingMinutes > 0 
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`;
}

/**
 * Parse time string to seconds
 */
export function parseTimeToSeconds(timeStr: string): number | null {
  // Handle "Xs" format
  const secondsMatch = timeStr.match(/^(\d+)s$/i);
  if (secondsMatch) {
    return Number.parseInt(secondsMatch[1], 10);
  }

  // Handle "Xm" or "Xm Ys" format
  const minutesMatch = timeStr.match(/^(\d+)m(?:\s*(\d+)s)?$/i);
  if (minutesMatch) {
    const minutes = Number.parseInt(minutesMatch[1], 10);
    const seconds = minutesMatch[2] ? Number.parseInt(minutesMatch[2], 10) : 0;
    return minutes * 60 + seconds;
  }

  // Handle "Xh" or "Xh Ym" format
  const hoursMatch = timeStr.match(/^(\d+)h(?:\s*(\d+)m)?$/i);
  if (hoursMatch) {
    const hours = Number.parseInt(hoursMatch[1], 10);
    const minutes = hoursMatch[2] ? Number.parseInt(hoursMatch[2], 10) : 0;
    return hours * 3600 + minutes * 60;
  }

  return null;
}

// ============================================
// Brew Metrics
// ============================================

/**
 * Calculate brew ratio
 */
export function calculateBrewRatio(doseGrams: number, yieldGrams: number): number {
  return yieldGrams / doseGrams;
}

/**
 * Format brew ratio for display
 */
export function formatBrewRatio(doseGrams: number, yieldGrams: number): string {
  const ratio = calculateBrewRatio(doseGrams, yieldGrams);
  return `1:${ratio.toFixed(1)}`;
}

/**
 * Calculate flow rate (ml/sec)
 */
export function calculateFlowRate(yieldMl: number, brewTimeSec: number): number {
  return yieldMl / brewTimeSec;
}

/**
 * Format flow rate for display
 */
export function formatFlowRate(yieldMl: number, brewTimeSec: number): string {
  const flowRate = calculateFlowRate(yieldMl, brewTimeSec);
  return `${flowRate.toFixed(2)} ml/s`;
}

/**
 * Calculate extraction yield percentage (simplified)
 * Note: This is a rough estimate; true extraction requires refractometer
 */
export function estimateExtractionYield(
  doseGrams: number,
  yieldGrams: number,
  tds = 1.35 // Typical TDS for espresso
): number {
  return (yieldGrams * tds) / doseGrams;
}

// ============================================
// Unit System Type
// ============================================

export type UnitSystem = 'metric' | 'imperial';

/**
 * Convert input values from user's unit system to canonical (metric) units
 */
export function toCanonicalUnits(
  value: number,
  type: 'weight' | 'volume' | 'temperature',
  fromSystem: UnitSystem
): number {
  if (fromSystem === 'metric') {
    return value;
  }

  switch (type) {
    case 'weight':
      return ouncesToGrams(value);
    case 'volume':
      return flOzToMl(value);
    case 'temperature':
      return fahrenheitToCelsius(value);
  }
}

/**
 * Convert canonical (metric) values to user's display units
 */
export function fromCanonicalUnits(
  value: number,
  type: 'weight' | 'volume' | 'temperature',
  toSystem: UnitSystem
): number {
  if (toSystem === 'metric') {
    return value;
  }

  switch (type) {
    case 'weight':
      return gramsToOunces(value);
    case 'volume':
      return mlToFlOz(value);
    case 'temperature':
      return celsiusToFahrenheit(value);
  }
}

export const units = {
  // Weight
  gramsToOunces,
  ouncesToGrams,
  formatWeight,
  
  // Volume
  mlToFlOz,
  flOzToMl,
  formatVolume,
  
  // Temperature
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  formatTemperature,
  
  // Time
  formatTime,
  parseTimeToSeconds,
  
  // Brew metrics
  calculateBrewRatio,
  formatBrewRatio,
  calculateFlowRate,
  formatFlowRate,
  estimateExtractionYield,
  
  // Conversions
  toCanonicalUnits,
  fromCanonicalUnits,
};

export default units;
