import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import fc from 'npm:fast-check@3.22.0';
import enJson from './en.json' with { type: 'json' };
import trJson from './tr.json' with { type: 'json' };

describe('i18n key parity', () => {
  it('PBT: for any key K in en.json, a corresponding key exists in tr.json', () => {
    const enKeys = Object.keys(enJson);

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: enKeys.length - 1 }),
        (index) => {
          const key = enKeys[index];
          expect(trJson[key as keyof typeof trJson]).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });
});
