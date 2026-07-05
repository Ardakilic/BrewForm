/** Brew ratio = beverage yield (g) / coffee dose (g), e.g. 2.0 for 18g in / 36g out; null when either input is missing or non-positive. */
export function computeBrewRatio(doseGrams: number, yieldGrams: number): number | null {
  if (!doseGrams || !yieldGrams || doseGrams <= 0) return null;
  return yieldGrams / doseGrams;
}

/** Flow rate in g/s = beverage yield (g) / extraction time (s); null when either input is missing or non-positive. */
export function computeFlowRate(yieldGrams: number, extractionTimeSeconds: number): number | null {
  if (!yieldGrams || !extractionTimeSeconds || extractionTimeSeconds <= 0) return null;
  return yieldGrams / extractionTimeSeconds;
}

/** Rough extraction yield in % = (yield g - dose g) / dose g * 100 (weight-based approximation, not TDS-based); null when inputs are missing or dose is non-positive. */
export function computeExtractionYield(doseGrams: number, yieldGrams: number): number | null {
  if (!doseGrams || !yieldGrams || doseGrams <= 0) return null;
  return ((yieldGrams - doseGrams) / doseGrams) * 100;
}

/** Extraction yield in % from a refractometer reading = TDS% * beverage volume (ml) / ground coffee weight (g); null when TDS is negative or volume/weight are non-positive. */
export function computeExtractionYieldFromTds(
  tds: number,
  extractionVolumeMl: number,
  groundWeightGrams: number,
): number | null {
  if (
    typeof tds !== 'number' || typeof extractionVolumeMl !== 'number' ||
    typeof groundWeightGrams !== 'number' || tds < 0 ||
    extractionVolumeMl <= 0 || groundWeightGrams <= 0
  ) {
    return null;
  }
  return (tds / 100) * extractionVolumeMl / groundWeightGrams * 100;
}
