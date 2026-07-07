import {
  computeExtractionYieldFromTds,
  formatTemperature,
  formatVolume,
  formatWeight,
} from '@brewform/shared/utils';

export interface StatCardItem {
  label: string;
  value: string;
}

function getUnitPlaceholder(
  type: 'weight' | 'volume' | 'temp',
  unitSystem: 'metric' | 'imperial',
): string {
  if (unitSystem === 'imperial') {
    if (type === 'weight') return '—oz';
    if (type === 'volume') return '—fl oz';
    if (type === 'temp') return '—°F';
  }
  if (type === 'weight') return '—g';
  if (type === 'volume') return '—ml';
  return '—°C';
}

/**
 * Builds the label/value pairs for the recipe stat cards (dose, yield,
 * time, ratio, temperature) in the given unit system, using an em-dash
 * placeholder for missing values; appends extraction yield when TDS,
 * volume, and dose are all present.
 */
export function buildStatCards(
  version: {
    groundWeightGrams?: number | null;
    extractionVolumeMl?: number | null;
    extractionTimeSeconds?: number | null;
    brewRatio?: number | null;
    temperatureCelsius?: number | null;
    tds?: string | null;
  } | null,
  unitSystem: 'metric' | 'imperial' = 'metric',
): StatCardItem[] {
  const v = version ?? {};
  const dose: StatCardItem = {
    label: 'recipe.stat.dose',
    value: v.groundWeightGrams != null
      ? formatWeight(v.groundWeightGrams, unitSystem)
      : getUnitPlaceholder('weight', unitSystem),
  };

  const yieldCard: StatCardItem = {
    label: 'recipe.stat.yield',
    value: v.extractionVolumeMl != null
      ? formatVolume(v.extractionVolumeMl, unitSystem)
      : getUnitPlaceholder('volume', unitSystem),
  };

  const time: StatCardItem = {
    label: 'recipe.stat.time',
    value: v.extractionTimeSeconds != null ? `${v.extractionTimeSeconds}s` : '—s',
  };

  const ratio: StatCardItem = {
    label: 'recipe.stat.ratio',
    value: v.brewRatio != null ? `1:${v.brewRatio}` : '1:—',
  };

  const temp: StatCardItem = {
    label: 'recipe.stat.temp',
    value: v.temperatureCelsius != null
      ? formatTemperature(
        v.temperatureCelsius,
        unitSystem === 'imperial' ? 'fahrenheit' : 'celsius',
      )
      : getUnitPlaceholder('temp', unitSystem),
  };

  const cards: StatCardItem[] = [dose, yieldCard, time, ratio, temp];

  if (
    v.tds != null &&
    v.extractionVolumeMl != null &&
    v.groundWeightGrams != null
  ) {
    // `tds` is `numeric` in Postgres → serialized as a string by postgres-js;
    // parse to a number before computing extraction yield.
    const tdsNum = typeof v.tds === 'number' ? v.tds : parseFloat(v.tds);
    if (!Number.isNaN(tdsNum)) {
      const ey = computeExtractionYieldFromTds(
        tdsNum,
        v.extractionVolumeMl,
        v.groundWeightGrams,
      );
      if (ey !== null) {
        cards.push({
          label: 'recipe.stat.extractionYield',
          value: `${ey.toFixed(1)}%`,
        });
      }
    }
  }

  return cards;
}
