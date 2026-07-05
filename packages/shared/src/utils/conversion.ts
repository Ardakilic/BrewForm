import { UNIT_CONVERSIONS } from '../constants/units.ts';

/** Converts a weight in grams to ounces (1 oz = 28.3495 g). Unrounded. */
export function convertGramsToOunces(grams: number): number {
  return UNIT_CONVERSIONS.gramsToOunces(grams);
}

/** Converts a weight in ounces to grams (1 oz = 28.3495 g). Unrounded. */
export function convertOuncesToGrams(ounces: number): number {
  return UNIT_CONVERSIONS.ouncesToGrams(ounces);
}

/** Converts a volume in milliliters to US fluid ounces (1 fl oz = 29.5735 ml). Unrounded. */
export function convertMlToFlOz(ml: number): number {
  return UNIT_CONVERSIONS.mlToFlOz(ml);
}

/** Converts a volume in US fluid ounces to milliliters (1 fl oz = 29.5735 ml). Unrounded. */
export function convertFlOzToMl(flOz: number): number {
  return UNIT_CONVERSIONS.flOzToMl(flOz);
}

/** Converts a temperature in degrees Celsius to Fahrenheit (F = C * 9/5 + 32). */
export function convertCtoF(celsius: number): number {
  return UNIT_CONVERSIONS.celsiusToFahrenheit(celsius);
}

/** Converts a temperature in degrees Fahrenheit to Celsius (C = (F - 32) * 5/9). */
export function convertFtoC(fahrenheit: number): number {
  return UNIT_CONVERSIONS.fahrenheitToCelsius(fahrenheit);
}

/** Formats a weight stored in grams for display: "12.3 g" (metric) or "0.4 oz" (imperial), 1 decimal place. */
export function formatWeight(grams: number, system: 'metric' | 'imperial'): string {
  if (system === 'imperial') {
    return `${convertGramsToOunces(grams).toFixed(1)} oz`;
  }
  return `${grams.toFixed(1)} g`;
}

/** Formats a volume stored in ml for display: "250 ml" (metric, whole number) or "8.5 fl oz" (imperial, 1 decimal). */
export function formatVolume(ml: number, system: 'metric' | 'imperial'): string {
  if (system === 'imperial') {
    return `${convertMlToFlOz(ml).toFixed(1)} fl oz`;
  }
  return `${ml.toFixed(0)} ml`;
}

/** Formats a temperature stored in Celsius for display in the requested unit, 1 decimal place with a degree sign. */
export function formatTemperature(celsius: number, unit: 'celsius' | 'fahrenheit'): string {
  if (unit === 'fahrenheit') {
    return `${convertCtoF(celsius).toFixed(1)}\u00B0F`;
  }
  return `${celsius.toFixed(1)}\u00B0C`;
}
