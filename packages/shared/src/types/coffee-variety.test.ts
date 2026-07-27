/**
 * Type-consistency test for the {@link CoffeeVariety} interface.
 *
 * Verifies that timestamp fields accept `Date` objects at compile time and
 * runtime, serving as a regression guard against accidental reversion to
 * `string`.
 */
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import type { CoffeeVariety } from './coffee-variety.ts';

describe('CoffeeVariety type consistency', () => {
  it('accepts Date objects for timestamp fields', () => {
    const now = new Date();
    const variety: CoffeeVariety = {
      id: 'test-variety-id',
      name: 'Test Variety',
      category: 'variety',
      species: null,
      origin: null,
      spread: null,
      altitudeRangeM: null,
      cupProfile: null,
      body: null,
      acidity: null,
      caffeinePct: null,
      processingCompatibility: null,
      diseaseResistance: null,
      yield: null,
      plantSize: null,
      notes: null,
      subVarieties: null,
      fermentation: null,
      dryingTimeDays: null,
      dryingMethod: null,
      mucilageRetentionPct: null,
      priceRange: null,
      processing: null,
      typeLabel: null,
      notableFarms: null,
      notableRegions: null,
      regionalVariants: null,
      globalSharePct: null,
      isSystem: false,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    expect(variety.createdAt).toBeInstanceOf(Date);
    expect(variety.updatedAt).toBeInstanceOf(Date);
    expect(variety.deletedAt).toBeNull();
  });

  it('accepts a Date for deletedAt when soft-deleted', () => {
    const now = new Date();
    const variety: CoffeeVariety = {
      id: 'test-variety-id',
      name: 'Test Variety',
      category: 'variety',
      species: null,
      origin: null,
      spread: null,
      altitudeRangeM: null,
      cupProfile: null,
      body: null,
      acidity: null,
      caffeinePct: null,
      processingCompatibility: null,
      diseaseResistance: null,
      yield: null,
      plantSize: null,
      notes: null,
      subVarieties: null,
      fermentation: null,
      dryingTimeDays: null,
      dryingMethod: null,
      mucilageRetentionPct: null,
      priceRange: null,
      processing: null,
      typeLabel: null,
      notableFarms: null,
      notableRegions: null,
      regionalVariants: null,
      globalSharePct: null,
      isSystem: false,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: now,
    };

    expect(variety.deletedAt).toBeInstanceOf(Date);
  });
});
