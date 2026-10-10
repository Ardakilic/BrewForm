import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import enJson from './en.json' with { type: 'json' };
import trJson from './tr.json' with { type: 'json' };

describe('i18n key parity', () => {
  it('en and tr expose identical key sets', () => {
    const enKeys = Object.keys(enJson).sort();
    const trKeys = Object.keys(trJson).sort();
    expect(enKeys).toEqual(trKeys);
  });

  it('every locale value is a string', () => {
    for (const [_key, value] of Object.entries(enJson)) {
      expect(typeof value).toBe('string');
    }
    for (const [_key, value] of Object.entries(trJson)) {
      expect(typeof value).toBe('string');
    }
  });

  it('PBT: for any key K in en.json, a corresponding key exists in tr.json', () => {
    const enKeys = Object.keys(enJson);

    fc.assert(
      fc.property(fc.integer({ min: 0, max: enKeys.length - 1 }), (index) => {
        const key = enKeys[index];
        expect(trJson[key as keyof typeof trJson]).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });
});
