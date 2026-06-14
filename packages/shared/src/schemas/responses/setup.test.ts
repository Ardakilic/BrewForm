import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { SetupOutputSchema } from './setup.ts';

function wire<T>(payload: T): unknown {
  return JSON.parse(JSON.stringify(payload));
}

describe('SetupOutputSchema', () => {
  it('parses a representative setup row and round-trips', () => {
    const payload = {
      id: 'setup-1',
      name: 'Espresso bench',
      userId: 'user-1',
      brewerDetails: 'Lever machine',
      grinder: 'EK43',
      portafilterId: 'eq-1',
      basketId: null,
      puckScreenId: null,
      paperFilterId: null,
      tamperId: null,
      isDefault: true,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      deletedAt: null,
    };
    const result = SetupOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });
});
