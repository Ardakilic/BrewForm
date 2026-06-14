import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { BeanOutputSchema } from './bean.ts';

/** Normalize to JSON wire shape (Dates → ISO strings) before parsing. */
function wire<T>(payload: T): unknown {
  return JSON.parse(JSON.stringify(payload));
}

describe('BeanOutputSchema', () => {
  it('parses a representative bean row and round-trips', () => {
    const payload = {
      id: 'bean-1',
      name: 'Ethiopia Yirgacheffe',
      brand: 'Acme Roasters',
      vendorId: 'vendor-1',
      roaster: null,
      roastLevel: 'light',
      processing: 'washed',
      origin: 'Ethiopia',
      userId: 'user-1',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      deletedAt: null,
    };
    const result = BeanOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });

  it('rejects when a required field (name) is missing', () => {
    const { name: _omit, ...rest } = {
      id: 'bean-1',
      name: 'X',
      brand: null,
      vendorId: null,
      roaster: null,
      roastLevel: null,
      processing: null,
      origin: null,
      userId: 'user-1',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      deletedAt: null,
    };
    expect(BeanOutputSchema.safeParse(rest).success).toBe(false);
  });
});
