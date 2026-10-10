/**
 * Coverage gate for the BrewForm coverage scope (wave-5 task 8.6).
 *
 * `vitest run --coverage` produces the profile and this script needs a single,
 * scope-aware LINE-coverage number that fails the build below a threshold. This
 * script runs the vitest coverage command (lcov reporter) in each in-scope
 * workspace, parses the lcov, and computes the aggregate line coverage over the
 * coverage scope ONLY:
 *
 *   - apps/api/src/
 *   - packages/shared/src/
 *
 * (NOT apps/web, NOT packages/db — those are outside the coverage scope).
 * Test files are excluded from the number, so it reflects production code. If
 * the percentage is below the threshold the script exits non-zero, failing CI.
 *
 * Usage:
 *   pnpm run test-coverage
 *   tsx scripts/coverage-gate.ts            # threshold defaults to 85
 *   tsx scripts/coverage-gate.ts 90         # explicit threshold (arg)
 *   COVERAGE_THRESHOLD=90 tsx scripts/coverage-gate.ts   # via env
 *
 * The parser and decision logic are exported as pure functions so they are
 * unit-tested without spawning the coverage command (see coverage-gate.test.ts).
 *
 * @module
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Per-file line-coverage record extracted from an lcov report. */
export interface FileCoverage {
  file: string;
  linesFound: number;
  linesHit: number;
}

/** Aggregate line-coverage summary over a set of files. */
export interface CoverageSummary {
  linesFound: number;
  linesHit: number;
  /** Line coverage percentage (0–100); 0 when no lines are found. */
  percent: number;
  /** Number of files contributing to the summary. */
  files: number;
}

/** Path markers identifying the coverage scope. */
export const COVERAGE_SCOPE_MARKERS = ['apps/api/src/', 'packages/shared/src/'] as const;
/** Coverage threshold applied when none is supplied (arg or env). */
export const DEFAULT_THRESHOLD = 85;

/**
 * Parses lcov text into per-file line-coverage records.
 *
 * Only the `SF` (source file), `LF` (lines found), and `LH` (lines hit) records
 * are needed for a line-coverage gate; all other record types (`DA`, `FN`,
 * `BRDA`, …) are ignored. A record is emitted on each `end_of_record`.
 *
 * @param lcov Raw lcov report text (e.g. from `vitest --coverage`).
 * @returns One {@linkcode FileCoverage} per source file in the report.
 */
export function parseLcovRecords(lcov: string): FileCoverage[] {
  const records: FileCoverage[] = [];
  let file: string | null = null;
  let linesFound = 0;
  let linesHit = 0;
  for (const rawLine of lcov.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('SF:')) {
      file = line.slice(3);
      linesFound = 0;
      linesHit = 0;
    } else if (line.startsWith('LF:')) {
      linesFound = Number(line.slice(3));
    } else if (line.startsWith('LH:')) {
      linesHit = Number(line.slice(3));
    } else if (line === 'end_of_record') {
      if (file !== null) {
        records.push({ file, linesFound, linesHit });
      }
      file = null;
      linesFound = 0;
      linesHit = 0;
    }
  }
  return records;
}

/**
 * Reports whether a source-file path belongs to the coverage scope.
 *
 * Handles both plain paths and `file://` URLs (lcov emits the latter), matching
 * on the scope path segment so the absolute prefix is irrelevant.
 *
 * @param file Source-file path or URL from an lcov `SF` record.
 * @returns `true` when the file is under `apps/api/src/` or `packages/shared/src/`.
 */
export function isInScope(file: string): boolean {
  const normalized = file.replace(/^file:\/\//, '');
  return COVERAGE_SCOPE_MARKERS.some((marker) => normalized.includes(marker));
}

/**
 * Aggregates per-file records into a single line-coverage summary.
 *
 * @param files Per-file coverage records to aggregate.
 * @returns The summed lines found/hit, the percentage, and the file count.
 */
export function summarize(files: FileCoverage[]): CoverageSummary {
  let linesFound = 0;
  let linesHit = 0;
  for (const file of files) {
    linesFound += file.linesFound;
    linesHit += file.linesHit;
  }
  const percent = linesFound === 0 ? 0 : (linesHit / linesFound) * 100;
  return { linesFound, linesHit, percent, files: files.length };
}

/**
 * Computes aggregate line coverage over the coverage scope from a raw lcov report.
 *
 * @param lcov Raw lcov report text (e.g. from `vitest --coverage`).
 * @returns The summary restricted to files under the coverage scope.
 */
export function computeLineCoverage(lcov: string): CoverageSummary {
  return summarize(parseLcovRecords(lcov).filter((record) => isInScope(record.file)));
}

/**
 * Decides whether a measured percentage satisfies the gate.
 *
 * @param percent Measured line-coverage percentage.
 * @param threshold Minimum acceptable percentage.
 * @returns `true` when `percent` meets or exceeds `threshold`.
 */
export function passes(percent: number, threshold: number): boolean {
  return percent >= threshold;
}

/**
 * Resolves the coverage threshold from an explicit argument, then the
 * `COVERAGE_THRESHOLD` env var, then {@linkcode DEFAULT_THRESHOLD}. Invalid or
 * out-of-range values fall back to the default rather than failing silently.
 *
 * @param arg Optional threshold passed as the first CLI argument.
 * @returns The resolved threshold percentage (0–100).
 */
export function resolveThreshold(arg?: string): number {
  const raw = arg ?? process.env.COVERAGE_THRESHOLD ?? String(DEFAULT_THRESHOLD);
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return DEFAULT_THRESHOLD;
  }
  return value;
}

/**
 * Runs the vitest coverage command (lcov reporter) in each in-scope workspace
 * and returns the concatenated lcov report text.
 *
 * @returns The lcov report covering the in-scope workspaces.
 */
function collectLcov(): string {
  const repoRoot = join(import.meta.dirname!, '..');
  const reports: string[] = [];
  const workspaces: Record<string, string> = {
    '@brewform/api': 'apps/api',
    '@brewform/shared': 'packages/shared',
  };
  for (const [pkg, dir] of Object.entries(workspaces)) {
    const result = spawnSync(
      'pnpm',
      ['--filter', pkg, 'exec', 'vitest', 'run', '--coverage', '--coverage.reporter=lcov'],
      { cwd: repoRoot, stdio: 'inherit', encoding: 'utf8' },
    );
    if (result.status !== 0) {
      console.error(`Coverage gate: vitest coverage failed for ${pkg}.`);
      process.exit(1);
    }
    reports.push(readFileSync(join(repoRoot, dir, 'coverage', 'lcov.info'), 'utf8'));
  }
  return reports.join('\n');
}

if (import.meta.main) {
  const threshold = resolveThreshold(process.argv[2]);
  const summary = computeLineCoverage(collectLcov());

  console.log(
    `Coverage gate: line coverage ${summary.percent.toFixed(2)}% ` +
      `(${summary.linesHit}/${summary.linesFound} lines across ${summary.files} files)`,
  );
  console.log(
    `Coverage gate: threshold ${threshold}% (scope: ${COVERAGE_SCOPE_MARKERS.join(', ')})`,
  );

  if (!passes(summary.percent, threshold)) {
    console.error(`Coverage gate FAILED: ${summary.percent.toFixed(2)}% is below ${threshold}%.`);
    process.exit(1);
  }
  console.log('Coverage gate passed.');
}
