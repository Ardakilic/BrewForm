import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { CoffeeVarietyOutputSchema } from './coffee-variety.ts';

function wire<T>(payload: T): unknown {
  return JSON.parse(JSON.stringify(payload));
}

describe('CoffeeVarietyOutputSchema', () => {
  it('parses a representative variety row (with array columns) and round-trips', () => {
    const payload = {
      id: 'cv-1',
      name: 'Geisha',
      category: 'heirloom',
      species: 'Coffea arabica',
      origin: 'Ethiopia',
      spread: null,
      altitudeRangeM: '1600-2000',
      cupProfile: 'Floral, jasmine',
      body: 'light',
      acidity: 'high',
      caffeinePct: '1.2',
      processingCompatibility: ['washed', 'natural'],
      diseaseResistance: 'low',
      yield: 'low',
      plantSize: 'tall',
      notes: null,
      subVarieties: ['Panama Geisha'],
      fermentation: null,
      dryingTimeDays: '15',
      dryingMethod: 'raised beds',
      mucilageRetentionPct: '0',
      priceRange: 'high',
      processing: 'washed',
      typeLabel: 'Heirloom',
      notableFarms: ['Hacienda La Esmeralda'],
      notableRegions: ['Boquete'],
      regionalVariants: [],
      globalSharePct: '0.5',
      isSystem: true,
      createdBy: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      deletedAt: null,
    };
    const result = CoffeeVarietyOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });

  it('accepts null array columns', () => {
    const payload = {
      id: 'cv-2',
      name: 'Bourbon',
      category: 'cultivar',
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
      isSystem: true,
      createdBy: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      deletedAt: null,
    };
    expect(CoffeeVarietyOutputSchema.safeParse(payload).success).toBe(true);
  });
});
