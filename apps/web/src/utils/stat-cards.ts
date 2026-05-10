export interface StatCardItem {
  label: string; // e.g. "DOSE" — always uppercase
  value: string; // e.g. "18g" or "—g" (dash when null)
}

/**
 * Formats a numeric value for display.
 * Whole numbers are shown as integers (18.0 → "18"),
 * non-whole numbers are shown with one decimal place (18.5 → "18.5").
 */
function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Builds exactly 5 stat cards from a recipe version object.
 * Always returns cards in this order: DOSE, YIELD, TIME, RATIO, TEMP
 * Uses "—" placeholder for null/undefined values, preserving the unit suffix.
 */
export function buildStatCards(version: {
  groundWeightGrams?: number | null;
  extractionVolumeMl?: number | null;
  extractionTimeSeconds?: number | null;
  brewRatio?: number | null;
  temperatureCelsius?: number | null;
}): StatCardItem[] {
  const dash = "—";

  const dose: StatCardItem = {
    label: "recipe.stat.dose",
    value:
      version.groundWeightGrams != null
        ? `${formatNumber(version.groundWeightGrams)}g`
        : `${dash}g`,
  };

  const yieldCard: StatCardItem = {
    label: "recipe.stat.yield",
    value:
      version.extractionVolumeMl != null
        ? `${formatNumber(version.extractionVolumeMl)}ml`
        : `${dash}ml`,
  };

  const time: StatCardItem = {
    label: "recipe.stat.time",
    value:
      version.extractionTimeSeconds != null
        ? `${formatNumber(version.extractionTimeSeconds)}s`
        : `${dash}s`,
  };

  const ratio: StatCardItem = {
    label: "recipe.stat.ratio",
    value:
      version.brewRatio != null
        ? `1:${formatNumber(version.brewRatio)}`
        : `1:${dash}`,
  };

  const temp: StatCardItem = {
    label: "recipe.stat.temp",
    value:
      version.temperatureCelsius != null
        ? `${formatNumber(version.temperatureCelsius)}°C`
        : `${dash}°C`,
  };

  return [dose, yieldCard, time, ratio, temp];
}
