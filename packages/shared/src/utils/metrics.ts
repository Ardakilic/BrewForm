export function computeBrewRatio(doseGrams: number, yieldGrams: number): number | null {
  if (!doseGrams || !yieldGrams || doseGrams <= 0) return null;
  return yieldGrams / doseGrams;
}

export function computeFlowRate(yieldGrams: number, extractionTimeSeconds: number): number | null {
  if (!yieldGrams || !extractionTimeSeconds || extractionTimeSeconds <= 0) return null;
  return yieldGrams / extractionTimeSeconds;
}

export function computeExtractionYield(doseGrams: number, yieldGrams: number): number | null {
  if (!doseGrams || !yieldGrams || doseGrams <= 0) return null;
  return ((yieldGrams - doseGrams) / doseGrams) * 100;
}