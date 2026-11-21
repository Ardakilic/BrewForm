/**
 * Tests for stat-cards utility
 *
 * Feature: recipe-detail-redesign
 * **Validates: Requirements 16.2, 16.3**
 *
 * Covers: all combinations of null/present values for the 5 stat card fields.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { estimateTextWidth } from './chart/index.ts';
import { buildStatCards } from './stat-cards.ts';

// ─── Unit Tests ───────────────────────────────────────────────────────────────

describe('buildStatCards — unit tests', () => {
  it('returns exactly 5 cards when all values are present', () => {
    const cards = buildStatCards({
      groundWeightGrams: 18,
      extractionVolumeMl: 36,
      extractionTimeSeconds: 30,
      brewRatio: 2,
      temperatureCelsius: 93,
    });
    expect(cards).toHaveLength(5);
  });

  it('returns correct values and units when all values are present', () => {
    const cards = buildStatCards({
      groundWeightGrams: 18,
      extractionVolumeMl: 36,
      extractionTimeSeconds: 30,
      brewRatio: 2,
      temperatureCelsius: 93,
    });
    expect(cards[0]).toEqual({ label: 'recipe.stat.dose', value: '18.0 g' });
    expect(cards[1]).toEqual({ label: 'recipe.stat.yield', value: '36 ml' });
    expect(cards[2]).toEqual({ label: 'recipe.stat.time', value: '30s' });
    expect(cards[3]).toEqual({ label: 'recipe.stat.ratio', value: '1:2' });
    expect(cards[4]).toEqual({ label: 'recipe.stat.temp', value: '93.0°C' });
  });

  it('returns imperial units when unitSystem is imperial', () => {
    const cards = buildStatCards(
      {
        groundWeightGrams: 18,
        extractionVolumeMl: 36,
        extractionTimeSeconds: 30,
        brewRatio: 2,
        temperatureCelsius: 93,
      },
      'imperial',
    );
    expect(cards[0]).toEqual({ label: 'recipe.stat.dose', value: '0.6 oz' });
    expect(cards[1]).toEqual({ label: 'recipe.stat.yield', value: '1.2 fl oz' });
    expect(cards[2]).toEqual({ label: 'recipe.stat.time', value: '30s' });
    expect(cards[3]).toEqual({ label: 'recipe.stat.ratio', value: '1:2' });
    expect(cards[4]).toEqual({ label: 'recipe.stat.temp', value: '199.4°F' });
  });

  it('returns exactly 5 cards when all values are null', () => {
    const cards = buildStatCards({
      groundWeightGrams: null,
      extractionVolumeMl: null,
      extractionTimeSeconds: null,
      brewRatio: null,
      temperatureCelsius: null,
    });
    expect(cards).toHaveLength(5);
  });

  it('uses dash placeholder with unit suffix when all values are null', () => {
    const cards = buildStatCards({
      groundWeightGrams: null,
      extractionVolumeMl: null,
      extractionTimeSeconds: null,
      brewRatio: null,
      temperatureCelsius: null,
    });
    expect(cards[0]).toEqual({ label: 'recipe.stat.dose', value: '—g' });
    expect(cards[1]).toEqual({ label: 'recipe.stat.yield', value: '—ml' });
    expect(cards[2]).toEqual({ label: 'recipe.stat.time', value: '—s' });
    expect(cards[3]).toEqual({ label: 'recipe.stat.ratio', value: '1:—' });
    expect(cards[4]).toEqual({ label: 'recipe.stat.temp', value: '—°C' });
  });

  it('handles mixed null and present values correctly', () => {
    const cards = buildStatCards({
      groundWeightGrams: 18,
      extractionVolumeMl: null,
      extractionTimeSeconds: 30,
      brewRatio: null,
      temperatureCelsius: 93,
    });
    expect(cards[0]).toEqual({ label: 'recipe.stat.dose', value: '18.0 g' });
    expect(cards[1]).toEqual({ label: 'recipe.stat.yield', value: '—ml' });
    expect(cards[2]).toEqual({ label: 'recipe.stat.time', value: '30s' });
    expect(cards[3]).toEqual({ label: 'recipe.stat.ratio', value: '1:—' });
    expect(cards[4]).toEqual({ label: 'recipe.stat.temp', value: '93.0°C' });
  });

  it('always returns exactly 5 cards regardless of input', () => {
    expect(buildStatCards({})).toHaveLength(5);
    expect(buildStatCards({ groundWeightGrams: 18 })).toHaveLength(5);
    expect(
      buildStatCards({
        groundWeightGrams: 18,
        extractionVolumeMl: 36,
        extractionTimeSeconds: 30,
        brewRatio: 2,
        temperatureCelsius: 93,
      }),
    ).toHaveLength(5);
  });

  it('labels are always uppercase in fixed order: DOSE, YIELD, TIME, RATIO, TEMP', () => {
    const cards = buildStatCards({});
    expect(cards.map((c) => c.label)).toEqual([
      'recipe.stat.dose',
      'recipe.stat.yield',
      'recipe.stat.time',
      'recipe.stat.ratio',
      'recipe.stat.temp',
    ]);
  });

  it('formats RATIO as "1:2" not "2" when brewRatio is 2', () => {
    const cards = buildStatCards({ brewRatio: 2 });
    expect(cards[3].value).toBe('1:2');
  });

  it('displays whole numbers with one decimal from formatWeight: 18 → "18.0 g"', () => {
    const cards = buildStatCards({ groundWeightGrams: 18.0 });
    expect(cards[0].value).toBe('18.0 g');
  });

  it('displays non-whole numbers with one decimal: 18.5 → "18.5 g"', () => {
    const cards = buildStatCards({ groundWeightGrams: 18.5 });
    expect(cards[0].value).toBe('18.5 g');
  });

  it('displays non-whole ratio with one decimal: 1.5 → "1:1.5"', () => {
    const cards = buildStatCards({ brewRatio: 1.5 });
    expect(cards[3].value).toBe('1:1.5');
  });

  it('displays non-whole temperature with one decimal: 92.5 → "92.5°C"', () => {
    const cards = buildStatCards({ temperatureCelsius: 92.5 });
    expect(cards[4].value).toBe('92.5°C');
  });
});

// ─── Property-Based Tests ─────────────────────────────────────────────────────

/**
 * Property 2: Stat card data transformation
 * Validates: Requirements 4.1, 4.2, 4.5, 10.5
 */
describe('buildStatCards — property-based tests', () => {
  // Arbitrary for a nullable number field
  const nullableNumber = fc.option(fc.float({ noNaN: true, noDefaultInfinity: true }), {
    nil: null,
  });

  // Arbitrary for a recipe version with all nullable stat fields
  const recipeVersionArb = fc.record({
    groundWeightGrams: nullableNumber,
    extractionVolumeMl: nullableNumber,
    extractionTimeSeconds: nullableNumber,
    brewRatio: nullableNumber,
    temperatureCelsius: nullableNumber,
  });

  it('always returns exactly 5 items for any combination of nullable numbers', () => {
    fc.assert(
      fc.property(recipeVersionArb, (version) => {
        const cards = buildStatCards(version);
        return cards.length === 5;
      }),
      { numRuns: 200 },
    );
  });

  it('labels are always in the fixed order [DOSE, YIELD, TIME, RATIO, TEMP]', () => {
    fc.assert(
      fc.property(recipeVersionArb, (version) => {
        const cards = buildStatCards(version);
        const labels = cards.map((c) => c.label);
        return (
          labels[0] === 'recipe.stat.dose' &&
          labels[1] === 'recipe.stat.yield' &&
          labels[2] === 'recipe.stat.time' &&
          labels[3] === 'recipe.stat.ratio' &&
          labels[4] === 'recipe.stat.temp'
        );
      }),
      { numRuns: 200 },
    );
  });

  it('null values always produce "—" in the value string', () => {
    fc.assert(
      fc.property(recipeVersionArb, (version) => {
        const cards = buildStatCards(version);

        if (version.groundWeightGrams === null) {
          if (!cards[0].value.includes('—')) return false;
        }
        if (version.extractionVolumeMl === null) {
          if (!cards[1].value.includes('—')) return false;
        }
        if (version.extractionTimeSeconds === null) {
          if (!cards[2].value.includes('—')) return false;
        }
        if (version.brewRatio === null) {
          if (!cards[3].value.includes('—')) return false;
        }
        if (version.temperatureCelsius === null) {
          if (!cards[4].value.includes('—')) return false;
        }

        return true;
      }),
      { numRuns: 200 },
    );
  });

  it('non-null values never produce "—" in the value string', () => {
    fc.assert(
      fc.property(recipeVersionArb, (version) => {
        const cards = buildStatCards(version);

        if (version.groundWeightGrams !== null) {
          if (cards[0].value.includes('—')) return false;
        }
        if (version.extractionVolumeMl !== null) {
          if (cards[1].value.includes('—')) return false;
        }
        if (version.extractionTimeSeconds !== null) {
          if (cards[2].value.includes('—')) return false;
        }
        if (version.brewRatio !== null) {
          if (cards[3].value.includes('—')) return false;
        }
        if (version.temperatureCelsius !== null) {
          if (cards[4].value.includes('—')) return false;
        }

        return true;
      }),
      { numRuns: 200 },
    );
  });
});

// ─── TDS / Extraction Yield (M6) ────────────────────────────────────────────

describe('buildStatCards — TDS / extraction yield (M6)', () => {
  it('returns 5 cards when tds is null', () => {
    const cards = buildStatCards({
      groundWeightGrams: 18,
      extractionVolumeMl: 36,
      tds: null,
    });
    expect(cards).toHaveLength(5);
  });

  it('returns 6 cards when tds is provided with valid volume and dose', () => {
    const cards = buildStatCards({
      groundWeightGrams: 15,
      extractionVolumeMl: 250,
      tds: '1.35',
    });
    expect(cards).toHaveLength(6);
    expect(cards[5]).toEqual({
      label: 'recipe.stat.extractionYield',
      value: '22.5%',
    });
  });

  it('returns 5 cards when tds is provided but extractionVolumeMl is null', () => {
    const cards = buildStatCards({
      groundWeightGrams: 15,
      extractionVolumeMl: null,
      tds: '1.35',
    });
    expect(cards).toHaveLength(5);
  });

  it('returns 5 cards when tds is provided but groundWeightGrams is null', () => {
    const cards = buildStatCards({
      groundWeightGrams: null,
      extractionVolumeMl: 250,
      tds: '1.35',
    });
    expect(cards).toHaveLength(5);
  });
});

// ─── Locale-aware time / ratio / extraction yield (wave-6 t6, task 19.22) ────

/** Replaces no-break spaces so values compare against plain-space strings. */
const plain = (value: string) => value.replaceAll('\u00A0', ' ');

describe('buildStatCards — locale-aware formatting (wave-6 t6)', () => {
  it('formats a 12-hour brew time as 12h (en) / 12 sa (tr), not 43200s', () => {
    expect(buildStatCards({ extractionTimeSeconds: 43200 }, 'metric', 'en')[2].value).toBe('12h');
    expect(plain(buildStatCards({ extractionTimeSeconds: 43200 }, 'metric', 'tr')[2].value)).toBe(
      '12 sa',
    );
  });

  it('formats two-unit times with a no-break space inside each number+unit pair', () => {
    expect(buildStatCards({ extractionTimeSeconds: 270 }, 'metric', 'en')[2].value).toBe('4m 30s');
    const tr = buildStatCards({ extractionTimeSeconds: 270 }, 'metric', 'tr')[2].value;
    expect(tr).toBe('4\u00A0dk 30\u00A0sn');
    expect(plain(tr)).toBe('4 dk 30 sn');
  });

  it('rounds the ratio to one decimal with the locale separator (1:2.2 / 1:2,2)', () => {
    expect(buildStatCards({ brewRatio: 2.2222223 }, 'metric', 'en')[3].value).toBe('1:2.2');
    expect(buildStatCards({ brewRatio: 2.2222223 }, 'metric', 'tr')[3].value).toBe('1:2,2');
  });

  it('localizes the extraction yield decimal (tr 22,5%)', () => {
    const cards = buildStatCards(
      { groundWeightGrams: 15, extractionVolumeMl: 250, tds: '1.35' },
      'metric',
      'tr',
    );
    expect(cards[5].value).toBe('22,5%');
  });

  it('localizes the missing-time placeholder unit (en —s, tr — sn)', () => {
    expect(buildStatCards({}, 'metric', 'en')[2].value).toBe('—s');
    expect(buildStatCards({}, 'metric', 'tr')[2].value).toBe('— sn');
  });

  it('defaults to the en locale', () => {
    expect(buildStatCards({ extractionTimeSeconds: 43200, brewRatio: 2.2222223 })[2].value).toBe(
      '12h',
    );
  });
});

describe('buildStatCards — stat value geometry (md card ≈ 100px)', () => {
  // The md 5-column grid leaves ≈ 100px inside a card (134.4px − 32px padding − 2px border).
  // The values this change formats (time, ratio, extraction yield) must never overflow it:
  // each run that cannot wrap (split at regular spaces only; number+unit pairs use a
  // no-break space) must estimate ≤ 100px at 24px bold. Seeded values plus edge cases.
  const MD_CARD_INNER_PX = 100;
  const TIMES = [25, 26, 27, 28, 100, 150, 180, 195, 200, 210, 240, 270, 300, 3599, 5400, 43200];
  const RATIOS = [2, 2.2222223, 5, 6, 14, 14.71, 15, 15.63, 16, 16.25, 16.67];

  it.each(['en', 'tr'])('every formatted time/ratio/yield run fits at 24px bold (%s)', (locale) => {
    const values: string[] = [];
    for (const extractionTimeSeconds of TIMES) {
      values.push(buildStatCards({ extractionTimeSeconds }, 'metric', locale)[2].value);
    }
    for (const brewRatio of RATIOS) {
      values.push(buildStatCards({ brewRatio }, 'metric', locale)[3].value);
    }
    for (const tds of ['1.35', '1.2', '9.99']) {
      const cards = buildStatCards(
        { groundWeightGrams: 15, extractionVolumeMl: 250, tds },
        'metric',
        locale,
      );
      values.push(cards[5].value);
    }
    for (const value of values) {
      for (const run of value.split(' ')) {
        const width = estimateTextWidth(run, 24, { bold: true });
        expect(
          width,
          `"${plain(run)}" (from "${plain(value)}") is ${width.toFixed(1)}px`,
        ).toBeLessThanOrEqual(MD_CARD_INNER_PX);
      }
    }
  });
});
