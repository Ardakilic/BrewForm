import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { VendorOutputSchema } from './vendor.ts';

function wire<T>(payload: T): unknown {
  return JSON.parse(JSON.stringify(payload));
}

describe('VendorOutputSchema', () => {
  it('parses a representative vendor row and round-trips', () => {
    const payload = {
      id: 'vendor-1',
      name: 'Acme Roasters',
      website: 'https://acme.example',
      description: null,
      createdBy: 'user-1',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      deletedAt: null,
    };
    const result = VendorOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });
});
