// Feature: complete-openapi-docs, Property 8: Response-helper output always validates against its envelope schema
//
// For any payload, the envelope produced by the error() helper validates against
// ErrorEnvelopeSchema, the envelope produced by success(data) validates against
// successEnvelope(dataSchema), and the envelope produced by paginated(items, meta)
// validates against paginatedEnvelope(itemSchema), each with zero validation
// errors — including when PaginationMeta carries any valid in-bounds values.
//
// Validates: Requirements 6.1, 6.2, 6.3, 6.4, 12.3
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { z } from 'zod';
import fc from 'npm:fast-check';
import {
  ErrorEnvelopeSchema,
  paginatedEnvelope,
  successEnvelope,
} from './response.ts';

// ---------------------------------------------------------------------------
// Generators that mirror the runtime helpers in
// `apps/api/src/utils/response/index.ts`.
// ---------------------------------------------------------------------------

/** Mirrors error(c, code, message, status, details?). */
function errorEnvelopeArb(): fc.Arbitrary<unknown> {
  return fc.record({
    code: fc.string(),
    message: fc.string(),
    requestId: fc.string(),
    details: fc.option(
      fc.array(fc.record({ field: fc.string(), message: fc.string() })),
      { nil: undefined },
    ),
  }).map((error) => ({ success: false as const, error }));
}

/** Arbitrary JSON-serializable data payload. */
function dataArb(): fc.Arbitrary<unknown> {
  return fc.jsonValue();
}

/** Mirrors success(c, data) → { success:true, data, meta:{ requestId } }. */
function successEnvelopeArb(): fc.Arbitrary<unknown> {
  return fc.record({
    data: dataArb(),
    requestId: fc.string(),
  }).map(({ data, requestId }) => ({
    success: true as const,
    data,
    meta: { requestId },
  }));
}

/** Valid in-bounds PaginationMeta (page≥1, perPage≥1, total≥0, totalPages≥0). */
function paginationMetaArb(): fc.Arbitrary<
  { page: number; perPage: number; total: number; totalPages: number }
> {
  return fc.record({
    page: fc.integer({ min: 1, max: 1_000_000 }),
    perPage: fc.integer({ min: 1, max: 1_000_000 }),
    total: fc.integer({ min: 0, max: 1_000_000 }),
    totalPages: fc.integer({ min: 0, max: 1_000_000 }),
  });
}

/** Mirrors paginated(c, items, pagination). */
function paginatedEnvelopeArb(): fc.Arbitrary<unknown> {
  return fc.record({
    data: fc.array(dataArb()),
    requestId: fc.string(),
    pagination: paginationMetaArb(),
  }).map(({ data, requestId, pagination }) => ({
    success: true as const,
    data,
    meta: { requestId, pagination },
  }));
}

describe('Property 8: response-helper output validates against its envelope schema', () => {
  it('error() output always parses against ErrorEnvelopeSchema', () => {
    fc.assert(
      fc.property(errorEnvelopeArb(), (payload) => {
        expect(ErrorEnvelopeSchema.safeParse(payload).success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('success() output always parses against successEnvelope(z.unknown())', () => {
    const schema = successEnvelope(z.unknown());
    fc.assert(
      fc.property(successEnvelopeArb(), (payload) => {
        expect(schema.safeParse(payload).success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('paginated() output always parses against paginatedEnvelope(z.unknown())', () => {
    const schema = paginatedEnvelope(z.unknown());
    fc.assert(
      fc.property(paginatedEnvelopeArb(), (payload) => {
        expect(schema.safeParse(payload).success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
