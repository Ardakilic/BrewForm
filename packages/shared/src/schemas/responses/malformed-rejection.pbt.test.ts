// Feature: complete-openapi-docs, Property 10: Malformed payloads are rejected
//
// For any envelope or Output Schema, a payload that omits a required field,
// supplies a field of the wrong type, or supplies a PaginationMeta value outside
// its bounds (e.g. page < 1, total < 0) is reported as invalid.
//
// Validates: Requirements 6.6, 8.5, 12.5
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import fc from 'npm:fast-check';
import { PaginationMetaSchema } from '../response.ts';
import { BeanOutputSchema } from './bean.ts';

// ---------------------------------------------------------------------------
// A valid Bean payload generator (wire shape). Used as the base that the
// property then corrupts in three distinct ways.
// ---------------------------------------------------------------------------
const ts = fc.date({ noInvalidDate: true }).map((d) => d.toISOString());
const nstr = fc.option(fc.string(), { nil: null });

const validBeanArb = fc.record({
  id: fc.string(),
  name: fc.string(),
  brand: nstr,
  vendorId: nstr,
  roaster: nstr,
  roastLevel: nstr,
  processing: nstr,
  origin: nstr,
  userId: fc.string(),
  createdAt: ts,
  updatedAt: ts,
  deletedAt: fc.option(ts, { nil: null }),
});

/** Non-string, non-null values that are invalid for a `z.string()` field. */
const wrongTypeArb = fc.oneof(
  fc.integer(),
  fc.boolean(),
  fc.array(fc.string()),
  fc.record({ nested: fc.string() }),
);

describe('Property 10: malformed payloads are rejected', () => {
  it('rejects a payload with a dropped required field', () => {
    fc.assert(
      fc.property(
        validBeanArb,
        fc.nat(),
        (bean, idx) => {
          const keys = Object.keys(bean);
          const keyToDrop = keys[idx % keys.length];
          const corrupted = { ...bean } as Record<string, unknown>;
          delete corrupted[keyToDrop];
          expect(BeanOutputSchema.safeParse(corrupted).success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects a payload with a required string field retyped to a wrong type', () => {
    // `id` and `userId` are non-nullable strings — a non-string value must fail.
    fc.assert(
      fc.property(
        validBeanArb,
        fc.constantFrom('id', 'userId', 'name'),
        wrongTypeArb,
        (bean, key, wrongValue) => {
          const corrupted = { ...bean, [key]: wrongValue };
          expect(BeanOutputSchema.safeParse(corrupted).success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects PaginationMeta with out-of-bounds values (page < 1, total < 0, or perPage < 1)', () => {
    const invalidMetaArb = fc.oneof(
      // page < 1
      fc.record({
        page: fc.integer({ max: 0 }),
        perPage: fc.integer({ min: 1, max: 1000 }),
        total: fc.integer({ min: 0, max: 1000 }),
        totalPages: fc.integer({ min: 0, max: 1000 }),
      }),
      // total < 0
      fc.record({
        page: fc.integer({ min: 1, max: 1000 }),
        perPage: fc.integer({ min: 1, max: 1000 }),
        total: fc.integer({ max: -1 }),
        totalPages: fc.integer({ min: 0, max: 1000 }),
      }),
      // perPage < 1
      fc.record({
        page: fc.integer({ min: 1, max: 1000 }),
        perPage: fc.integer({ max: 0 }),
        total: fc.integer({ min: 0, max: 1000 }),
        totalPages: fc.integer({ min: 0, max: 1000 }),
      }),
    );
    fc.assert(
      fc.property(invalidMetaArb, (meta) => {
        expect(PaginationMetaSchema.safeParse(meta).success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
