export const CANONICAL_UNITS = {
  weight: 'grams',
  volume: 'milliliters',
  temperature: 'celsius',
  time: 'seconds',
} as const;

export const UNIT_CONVERSIONS = {
  gramsToOunces: (g: number) => g / 28.3495,
  ouncesToGrams: (oz: number) => oz * 28.3495,
  mlToFlOz: (ml: number) => ml / 29.5735,
  flOzToMl: (flOz: number) => flOz * 29.5735,
  celsiusToFahrenheit: (c: number) => (c * 9) / 5 + 32,
  fahrenheitToCelsius: (f: number) => ((f - 32) * 5) / 9,
} as const;