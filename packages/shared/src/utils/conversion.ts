import { UNIT_CONVERSIONS } from '../constants/units.ts';

export function convertGramsToOunces(grams: number): number {
  return UNIT_CONVERSIONS.gramsToOunces(grams);
}

export function convertOuncesToGrams(ounces: number): number {
  return UNIT_CONVERSIONS.ouncesToGrams(ounces);
}

export function convertMlToFlOz(ml: number): number {
  return UNIT_CONVERSIONS.mlToFlOz(ml);
}

export function convertFlOzToMl(flOz: number): number {
  return UNIT_CONVERSIONS.flOzToMl(flOz);
}

export function convertCtoF(celsius: number): number {
  return UNIT_CONVERSIONS.celsiusToFahrenheit(celsius);
}

export function convertFtoC(fahrenheit: number): number {
  return UNIT_CONVERSIONS.fahrenheitToCelsius(fahrenheit);
}

export function formatWeight(grams: number, system: 'metric' | 'imperial'): string {
  if (system === 'imperial') {
    return `${convertGramsToOunces(grams).toFixed(1)} oz`;
  }
  return `${grams.toFixed(1)} g`;
}

export function formatVolume(ml: number, system: 'metric' | 'imperial'): string {
  if (system === 'imperial') {
    return `${convertMlToFlOz(ml).toFixed(1)} fl oz`;
  }
  return `${ml.toFixed(0)} ml`;
}

export function formatTemperature(celsius: number, unit: 'celsius' | 'fahrenheit'): string {
  if (unit === 'fahrenheit') {
    return `${convertCtoF(celsius).toFixed(1)}\u00B0F`;
  }
  return `${celsius.toFixed(1)}\u00B0C`;
}