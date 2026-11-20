import { t } from '@brewform/shared/i18n';
import {
  computeExtractionYieldFromTds,
  formatTemperature,
  formatVolume,
  formatWeight,
} from '@brewform/shared/utils';
import { formatDecimal, formatDurationParts } from './format.ts';

/** No-break space: keeps a number and its unit on one line inside a stat card. */
const NBSP = '\u00A0';

/** A single label/value pair rendered as a recipe stat card. */
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
 * Formats the brew time for a stat card: the compact two-unit duration with a
 * no-break space inside each number+unit pair, so a narrow card wraps only
 * between units (`4 dk` / `30 sn`) and never splits a number from its unit.
 */
function formatCardDuration(seconds: number, locale: string): string {
  return formatDurationParts(seconds, locale)
    .map((part) => part.replaceAll(' ', NBSP))
    .join(' ');
}

/**
 * Builds the label/value pairs for the recipe stat cards (dose, yield,
 * time, ratio, temperature) in the given unit system, using an em-dash
 * placeholder for missing values; appends extraction yield when TDS,
 * volume, and dose are all present.
 *
 * Time, ratio and extraction yield are localized for `locale`: the time is a
 * compact duration (`12h` / `12 sa`), the ratio is `1:` plus one decimal
 * (`1:2.2` / `1:2,2`) and the extraction yield has one decimal.
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
  locale: string = 'en',
): StatCardItem[] {
  const v = version ?? {};
  const dose: StatCardItem = {
    label: 'recipe.stat.dose',
    value:
      v.groundWeightGrams != null
        ? formatWeight(v.groundWeightGrams, unitSystem)
        : getUnitPlaceholder('weight', unitSystem),
  };

  const yieldCard: StatCardItem = {
    label: 'recipe.stat.yield',
    value:
      v.extractionVolumeMl != null
        ? formatVolume(v.extractionVolumeMl, unitSystem)
        : getUnitPlaceholder('volume', unitSystem),
  };

  const time: StatCardItem = {
    label: 'recipe.stat.time',
    value:
      v.extractionTimeSeconds != null
        ? formatCardDuration(v.extractionTimeSeconds, locale)
        : t('chart.duration.seconds', locale).replace('{n}', '—'),
  };

  const ratio: StatCardItem = {
    label: 'recipe.stat.ratio',
    value: v.brewRatio != null ? `1:${formatDecimal(v.brewRatio, locale, 1)}` : '1:—',
  };

  const temp: StatCardItem = {
    label: 'recipe.stat.temp',
    value:
      v.temperatureCelsius != null
        ? formatTemperature(
            v.temperatureCelsius,
            unitSystem === 'imperial' ? 'fahrenheit' : 'celsius',
          )
        : getUnitPlaceholder('temp', unitSystem),
  };

  const cards: StatCardItem[] = [dose, yieldCard, time, ratio, temp];

  if (v.tds != null && v.extractionVolumeMl != null && v.groundWeightGrams != null) {
    // `tds` is `numeric` in Postgres → serialized as a string by postgres-js;
    // parse to a number before computing extraction yield.
    const tdsNum = typeof v.tds === 'number' ? v.tds : parseFloat(v.tds);
    if (!Number.isNaN(tdsNum)) {
      const ey = computeExtractionYieldFromTds(tdsNum, v.extractionVolumeMl, v.groundWeightGrams);
      if (ey !== null) {
        cards.push({
          label: 'recipe.stat.extractionYield',
          value: `${formatDecimal(ey, locale, 1)}%`,
        });
      }
    }
  }

  return cards;
}
