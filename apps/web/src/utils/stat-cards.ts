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

export function buildStatCards(
  version: {
    groundWeightGrams?: number | null;
    extractionVolumeMl?: number | null;
    extractionTimeSeconds?: number | null;
    brewRatio?: number | null;
    temperatureCelsius?: number | null;
    tds?: number | null;
  },
  unitSystem: 'metric' | 'imperial' = 'metric',
): StatCardItem[] {
  const dose: StatCardItem = {
    label: 'recipe.stat.dose',
    value: version.groundWeightGrams != null
      ? formatWeight(version.groundWeightGrams, unitSystem)
      : '—g',
  };

  const yieldCard: StatCardItem = {
    label: 'recipe.stat.yield',
    value: version.extractionVolumeMl != null
      ? formatVolume(version.extractionVolumeMl, unitSystem)
      : '—ml',
  };

  const time: StatCardItem = {
    label: 'recipe.stat.time',
    value: version.extractionTimeSeconds != null ? `${version.extractionTimeSeconds}s` : '—s',
  };

  const ratio: StatCardItem = {
    label: 'recipe.stat.ratio',
    value: version.brewRatio != null ? `1:${version.brewRatio}` : '1:—',
  };

  const temp: StatCardItem = {
    label: 'recipe.stat.temp',
    value: version.temperatureCelsius != null
      ? formatTemperature(
        version.temperatureCelsius,
        unitSystem === 'imperial' ? 'fahrenheit' : 'celsius',
      )
      : '—°C',
  };

  const cards: StatCardItem[] = [dose, yieldCard, time, ratio, temp];

  if (
    version.tds != null &&
    version.extractionVolumeMl != null &&
    version.groundWeightGrams != null
  ) {
    const ey = computeExtractionYieldFromTds(
      version.tds,
      version.extractionVolumeMl,
      version.groundWeightGrams,
    );
    if (ey !== null) {
      cards.push({
        label: 'recipe.stat.extractionYield',
        value: `${ey.toFixed(1)}%`,
      });
    }
  }

  return cards;
}
