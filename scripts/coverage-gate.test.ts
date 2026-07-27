/**
 * Unit tests for the coverage-gate parser and decision logic (wave-5 task 8.6).
 *
 * These are hermetic: they feed a fixture lcov string to the pure functions in
 * `coverage-gate.ts` and never spawn `deno coverage`. The fixture mixes in-scope
 * files (apps/api/src, packages/shared/src) with an out-of-scope file
 * (apps/web/src) to prove the scope filter, and uses `file://` URLs (the form
 * `deno coverage --lcov` emits) to prove URL handling.
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

import {
  computeLineCoverage,
  DEFAULT_THRESHOLD,
  isInDenoScope,
  parseLcovRecords,
  passes,
  resolveThreshold,
  summarize,
} from './coverage-gate.ts';

// Fixture lcov: two in-scope files (api 90/100, shared 40/50) and one
// out-of-scope file (web 10/10). In-scope aggregate = 130/150 = 86.6667%.
const FIXTURE_LCOV = `TN:
SF:file:///app/apps/api/src/a.ts
DA:1,1
DA:2,1
LF:100
LH:90
end_of_record
SF:file:///app/packages/shared/src/b.ts
DA:1,0
LF:50
LH:40
end_of_record
SF:file:///app/apps/web/src/c.ts
LF:10
LH:10
end_of_record
`;

describe('parseLcovRecords', () => {
  it('extracts one record per source file with LF/LH', () => {
    const records = parseLcovRecords(FIXTURE_LCOV);
    expect(records).toHaveLength(3);
    expect(records[0]).toEqual({ file: 'file:///app/apps/api/src/a.ts', linesFound: 100, linesHit: 90 });
    expect(records[1]).toEqual({
      file: 'file:///app/packages/shared/src/b.ts',
      linesFound: 50,
      linesHit: 40,
    });
    expect(records[2]).toEqual({ file: 'file:///app/apps/web/src/c.ts', linesFound: 10, linesHit: 10 });
  });

  it('returns an empty list for empty input', () => {
    expect(parseLcovRecords('')).toEqual([]);
  });

  it('ignores records without a source file', () => {
    const records = parseLcovRecords('LF:5\nLH:5\nend_of_record\n');
    expect(records).toEqual([]);
  });
});

describe('isInDenoScope', () => {
  it('accepts apps/api/src and packages/shared/src (file:// URLs)', () => {
    expect(isInDenoScope('file:///app/apps/api/src/a.ts')).toBe(true);
    expect(isInDenoScope('file:///app/packages/shared/src/b.ts')).toBe(true);
  });

  it('accepts plain absolute paths', () => {
    expect(isInDenoScope('/app/apps/api/src/deep/x.ts')).toBe(true);
    expect(isInDenoScope('/app/packages/shared/src/y.ts')).toBe(true);
  });

  it('rejects files outside the deno scope', () => {
    expect(isInDenoScope('file:///app/apps/web/src/c.ts')).toBe(false);
    expect(isInDenoScope('file:///app/packages/db/src/index.ts')).toBe(false);
    expect(isInDenoScope('https://deno.land/std/foo.ts')).toBe(false);
  });
});

describe('summarize', () => {
  it('sums lines and computes the percentage', () => {
    const summary = summarize([
      { file: 'a', linesFound: 100, linesHit: 90 },
      { file: 'b', linesFound: 50, linesHit: 40 },
    ]);
    expect(summary.linesFound).toBe(150);
    expect(summary.linesHit).toBe(130);
    expect(summary.files).toBe(2);
    expect(summary.percent).toBeCloseTo(86.6667, 3);
  });

  it('reports 0% when no lines are found', () => {
    const summary = summarize([]);
    expect(summary).toEqual({ linesFound: 0, linesHit: 0, percent: 0, files: 0 });
  });
});

describe('computeLineCoverage', () => {
  it('aggregates only the deno scope', () => {
    const summary = computeLineCoverage(FIXTURE_LCOV);
    // apps/web/src/c.ts (10/10) is excluded; api (90/100) + shared (40/50).
    expect(summary.files).toBe(2);
    expect(summary.linesFound).toBe(150);
    expect(summary.linesHit).toBe(130);
    expect(summary.percent).toBeCloseTo(86.6667, 3);
  });
});

describe('passes', () => {
  it('passes at or above the threshold', () => {
    expect(passes(85, 85)).toBe(true);
    expect(passes(86.6667, 85)).toBe(true);
    expect(passes(100, 85)).toBe(true);
  });

  it('fails below the threshold', () => {
    expect(passes(84.9999, 85)).toBe(false);
    expect(passes(0, 85)).toBe(false);
  });
});

describe('resolveThreshold', () => {
  it('prefers an explicit argument', () => {
    expect(resolveThreshold('90')).toBe(90);
    expect(resolveThreshold('0')).toBe(0);
    expect(resolveThreshold('100')).toBe(100);
  });

  it('falls back to the default for invalid or out-of-range values', () => {
    expect(resolveThreshold('not-a-number')).toBe(DEFAULT_THRESHOLD);
    expect(resolveThreshold('-1')).toBe(DEFAULT_THRESHOLD);
    expect(resolveThreshold('101')).toBe(DEFAULT_THRESHOLD);
  });

  it('defaults to 85 when nothing is supplied', () => {
    expect(DEFAULT_THRESHOLD).toBe(85);
  });
});
