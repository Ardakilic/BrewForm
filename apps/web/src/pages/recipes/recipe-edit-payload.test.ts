import { RecipeUpdateSchema } from '@brewform/shared/schemas';
import { describe, expect, it } from 'vitest';
import {
  buildRecipeUpdatePayload,
  numberOrNull,
  type RecipeEditFormValues,
  textOrNull,
} from './recipe-edit-payload.ts';

const TN1 = '00000000-0000-4000-8000-000000000101';
const TN2 = '00000000-0000-4000-8000-000000000102';
const EQ1 = '00000000-0000-4000-8000-000000000201';
const VAR = '00000000-0000-4000-8000-000000000301';

/** A fully filled edit form. */
const filled: RecipeEditFormValues = {
  title: '  Morning shot ',
  visibility: 'public',
  brewMethod: 'espresso_machine',
  drinkType: 'espresso',
  bumpVersion: false,
  productName: 'Yirgacheffe',
  coffeeBrand: 'Square Mile',
  coffeeProcessing: 'Washed',
  roastDate: '2026-01-02',
  packageOpenDate: '2026-01-05',
  grindDate: '2026-01-06',
  grinder: 'Niche Zero',
  grindSize: '12',
  brewerDetails: 'Lelit Mara X',
  groundWeightGrams: '18',
  extractionTimeSeconds: '28',
  extractionVolumeMl: '36',
  temperatureCelsius: '93',
  tds: '1.35',
  rating: '8',
  emojiTag: 'fire',
  preparationNotes: ' Pull a shot ',
  personalNotes: 'Bright',
  tasteNoteIds: [TN1, TN2],
  tasteNoteIntensities: { [TN1]: 3, [TN2]: 1 },
  equipmentIds: [EQ1],
  coffeeVarietyId: VAR,
};

/** The same form with every optional input cleared. */
const cleared: RecipeEditFormValues = {
  ...filled,
  productName: '',
  coffeeBrand: '',
  coffeeProcessing: '',
  roastDate: '',
  packageOpenDate: '',
  grindDate: '',
  grinder: '',
  grindSize: '   ',
  brewerDetails: '',
  groundWeightGrams: '',
  extractionTimeSeconds: '',
  extractionVolumeMl: '',
  temperatureCelsius: '',
  tds: '',
  rating: '',
  emojiTag: '',
  personalNotes: '',
  tasteNoteIds: [],
  tasteNoteIntensities: { [TN1]: 3 },
  equipmentIds: [],
  coffeeVarietyId: null,
};

describe('textOrNull', () => {
  it('trims text and maps an empty or blank input to null', () => {
    expect(textOrNull(' Niche ')).toBe('Niche');
    expect(textOrNull('')).toBeNull();
    expect(textOrNull('   ')).toBeNull();
  });
});

describe('numberOrNull', () => {
  it('parses numbers and maps an empty or non-numeric input to null', () => {
    expect(numberOrNull('18')).toBe(18);
    expect(numberOrNull('1.35')).toBe(1.35);
    expect(numberOrNull('0')).toBe(0);
    expect(numberOrNull('')).toBeNull();
    expect(numberOrNull('abc')).toBeNull();
  });
});

describe('buildRecipeUpdatePayload', () => {
  it('sends every rendered field with typed values', () => {
    expect(buildRecipeUpdatePayload(filled)).toEqual({
      title: 'Morning shot',
      visibility: 'public',
      brewMethod: 'espresso_machine',
      drinkType: 'espresso',
      bumpVersion: false,
      productName: 'Yirgacheffe',
      coffeeBrand: 'Square Mile',
      coffeeProcessing: 'Washed',
      roastDate: '2026-01-02',
      packageOpenDate: '2026-01-05',
      grindDate: '2026-01-06',
      grinder: 'Niche Zero',
      grindSize: '12',
      brewerDetails: 'Lelit Mara X',
      groundWeightGrams: 18,
      extractionTimeSeconds: 28,
      extractionVolumeMl: 36,
      temperatureCelsius: 93,
      tds: 1.35,
      rating: 8,
      emojiTag: 'fire',
      preparationNotes: 'Pull a shot',
      personalNotes: 'Bright',
      tasteNoteIds: [TN1, TN2],
      tasteNoteIntensities: { [TN1]: 3, [TN2]: 1 },
      equipmentIds: [EQ1],
      coffeeVarietyId: VAR,
    });
  });

  it('sends null for cleared inputs and [] for cleared taste notes and equipment', () => {
    const payload = buildRecipeUpdatePayload(cleared);

    for (const key of [
      'productName',
      'coffeeBrand',
      'coffeeProcessing',
      'roastDate',
      'packageOpenDate',
      'grindDate',
      'grinder',
      'grindSize',
      'brewerDetails',
      'groundWeightGrams',
      'extractionTimeSeconds',
      'extractionVolumeMl',
      'temperatureCelsius',
      'tds',
      'rating',
      'emojiTag',
      'personalNotes',
      'coffeeVarietyId',
    ] as const) {
      expect(payload[key], key).toBeNull();
    }
    expect(payload.tasteNoteIds).toEqual([]);
    expect(payload.tasteNoteIntensities).toEqual({});
    expect(payload.equipmentIds).toEqual([]);
  });

  it('omits the fields the edit form does not render, so the API keeps them', () => {
    const payload = buildRecipeUpdatePayload(filled);

    for (const key of [
      'additionalPreparations',
      'preInfusionTimeSeconds',
      'vendorId',
      'beanId',
      'brewDate',
      'isFavourite',
      'setupId',
    ]) {
      expect(key in payload, key).toBe(false);
    }
  });

  it('keeps only the intensities of the selected taste notes', () => {
    const payload = buildRecipeUpdatePayload({
      ...filled,
      tasteNoteIds: [TN2],
      tasteNoteIntensities: { [TN1]: 3, [TN2]: 2 },
    });

    expect(payload.tasteNoteIntensities).toEqual({ [TN2]: 2 });
  });

  it('carries the bump flag', () => {
    expect(buildRecipeUpdatePayload({ ...filled, bumpVersion: true }).bumpVersion).toBe(true);
  });

  it('produces bodies the shared update schema accepts, filled or cleared', () => {
    for (const values of [filled, cleared]) {
      const payload = buildRecipeUpdatePayload(values);
      const parsed = RecipeUpdateSchema.safeParse(JSON.parse(JSON.stringify(payload)));
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expect(parsed.data).toEqual(payload);
    }
  });
});
