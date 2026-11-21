/**
 * Fixture tests for the repository's documentation guards (doc-drift-check and
 * code-documentation capabilities). Each case runs a root `scripts/*.ts` file with plain `node`
 * (Node 26 type stripping, no install step) through `node:child_process`, exactly as the
 * `doc-drift` CI job and `pnpm run docs:check` do, and asserts the exit code and the reported
 * `file:line` entries:
 * - `scripts/docblock-scan.ts` against `__fixtures__/docblock/{pass,fail}`;
 * - `scripts/doc-drift-check.ts` against `__fixtures__/doc-drift/<case>` (one passing tree and one
 *   failing tree per rule: token, allowlist reason, stale allowlist entry, archived capability,
 *   Purpose placeholder, broken link, code remnant, stale idiom);
 * - one run of each script against the repository root. The doc-drift repository case fails
 *   until the wave-6 archive (tasks.md group 28) syncs the specs and backfills every Purpose.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Repository root, resolved from this file (`packages/shared/src/`). */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Fixture trees shared by the cases below. */
const FIXTURES = fileURLToPath(new URL('./__fixtures__/', import.meta.url));

/** Generous per-test timeout: each case spawns a Node process that walks a file tree. */
const SPAWN_TIMEOUT_MS = 60_000;

/** Exit code and captured output of one script run. */
interface ScriptRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Runs `node scripts/<script> <args…>` from the repository root and captures its output. */
function runScript(script: string, args: string[]): ScriptRun {
  const result = spawnSync(process.execPath, [join(REPO_ROOT, 'scripts', script), ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** One missing-docblock entry of the scanner's `--json` report. */
interface DocblockFinding {
  path: string;
  line: number;
  name: string;
  doc: string;
}

/** Runs the docblock scanner in `--check --json` mode against `root`. */
function scanDocblocks(root: string): {
  run: ScriptRun;
  report: { exportCount: number; missing: DocblockFinding[] };
} {
  const run = runScript('docblock-scan.ts', ['--check', '--json', '--root', root]);
  return { run, report: JSON.parse(run.stdout) };
}

describe('scripts/docblock-scan.ts', () => {
  it(
    'passes documented exports of every form (declaration, export default X, export { X })',
    () => {
      const { run, report } = scanDocblocks(join(FIXTURES, 'docblock/pass'));
      expect(run.status).toBe(0);
      expect(report.missing).toEqual([]);
      // documentedConst, documentedFn, DocumentedType, router, localThing, renamedThing
      expect(report.exportCount).toBe(6);
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    'fails undocumented export const, export default X and export { X }, ignoring // and /* */',
    () => {
      const { run, report } = scanDocblocks(join(FIXTURES, 'docblock/fail'));
      expect(run.status).toBe(1);
      expect(report.missing.map((f) => `${f.path}:${f.line} ${f.name} (${f.doc})`)).toEqual([
        'packages/shared/src/default-export.ts:1 router (none)',
        'packages/shared/src/line-comment.ts:2 lineCommented (line-comment)',
        'packages/shared/src/line-comment.ts:5 blockCommented (block-comment)',
        'packages/shared/src/named-export.ts:1 localThing (none)',
        'packages/shared/src/undocumented-const.ts:1 bareConst (none)',
      ]);
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    '--check lists file:line symbol for each missing docblock and exits 1',
    () => {
      const run = runScript('docblock-scan.ts', [
        '--check',
        '--root',
        join(FIXTURES, 'docblock/fail'),
      ]);
      expect(run.status).toBe(1);
      expect(run.stdout).toContain('packages/shared/src/undocumented-const.ts:1 bareConst\n');
      expect(run.stdout).toContain('packages/shared/src/default-export.ts:1 router\n');
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    'reports zero missing docblocks in the repository',
    () => {
      const run = runScript('docblock-scan.ts', ['--check']);
      expect(run.stdout).toMatch(/, 0 without a \/\*\* \*\/ docblock/);
      expect(run.status).toBe(0);
    },
    SPAWN_TIMEOUT_MS,
  );
});

/** One finding of the doc-drift `--json` report. */
interface DriftFinding {
  file: string;
  line: number;
  rule: string;
  detail: string;
}

/** Runs the doc-drift check in `--json` mode against fixture `name`. */
function checkDrift(name: string): { run: ScriptRun; findings: DriftFinding[] } {
  const run = runScript('doc-drift-check.ts', [
    '--root',
    join(FIXTURES, 'doc-drift', name),
    '--json',
  ]);
  const report = JSON.parse(run.stdout) as { findings: DriftFinding[] };
  return { run, findings: report.findings };
}

/** `file:line: rule` keys of a report, in reported order. */
function keys(findings: DriftFinding[]): string[] {
  return findings.map((f) => `${f.file}:${f.line}: ${f.rule}`);
}

/**
 * The source line a finding points at, read from fixture `name`. Assertions compare a finding's
 * `detail` with this line instead of spelling the removed-tooling tokens out here: this test file
 * sits inside the code-remnant scan of the repository run.
 */
function fixtureLine(name: string, finding: DriftFinding): string {
  const text = readFileSync(join(FIXTURES, 'doc-drift', name, finding.file), 'utf8');
  return text.split('\n')[finding.line - 1] ?? '';
}

describe('scripts/doc-drift-check.ts', () => {
  it(
    'passes a clean tree (allowlisted history, retired capability, excluded change records)',
    () => {
      const { run, findings } = checkDrift('pass');
      expect(findings).toEqual([]);
      expect(run.status).toBe(0);
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    'rejects removed-tooling tokens in docs and specs but not ordinary words',
    () => {
      const { run, findings } = checkDrift('fail-token');
      expect(run.status).toBe(1);
      expect(keys(findings)).toEqual([
        'docs/setup.md:3: token',
        'openspec/specs/widget/spec.md:9: token',
      ]);
      for (const f of findings) expect(fixtureLine('fail-token', f)).toContain(f.detail);
      // The "denotes" line (4) is not reported.
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    'rejects an allowlist entry without a reason',
    () => {
      const { run, findings } = checkDrift('fail-allowlist-reason');
      expect(run.status).toBe(1);
      expect(keys(findings)).toEqual(['scripts/doc-drift-allowlist.json:4: allowlist-reason']);
      expect(findings[0]?.detail).toContain('docs/history/**');
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    'rejects an allowlist entry that matches no file',
    () => {
      const { run, findings } = checkDrift('fail-allowlist-stale');
      expect(run.status).toBe(1);
      expect(keys(findings)).toEqual(['scripts/doc-drift-allowlist.json:8: allowlist-stale']);
      expect(findings[0]?.detail).toContain('docs/requirements-audit-report.md');
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    'rejects an archived capability missing from openspec/specs',
    () => {
      const { run, findings } = checkDrift('fail-archived-capability');
      expect(run.status).toBe(1);
      expect(keys(findings)).toEqual([
        'openspec/changes/archive/2026-07-28-f08-recipe-comparison/specs/recipe-comparison/spec.md:1: archived-capability',
      ]);
      expect(findings[0]?.detail).toContain('recipe-comparison');
      expect(findings[0]?.detail).toContain('2026-07-28-f08-recipe-comparison');
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    'rejects a "Purpose: TBD" placeholder left by an archive',
    () => {
      const { run, findings } = checkDrift('fail-purpose');
      expect(run.status).toBe(1);
      expect(keys(findings)).toEqual(['openspec/specs/deploy-guide/spec.md:4: purpose']);
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    'rejects broken relative links, skipping URLs, anchors and fenced code',
    () => {
      const { run, findings } = checkDrift('fail-link');
      expect(run.status).toBe(1);
      expect(keys(findings)).toEqual([
        'plans/FEATURE_SUGGESTIONS.md:3: link',
        'plans/FEATURE_SUGGESTIONS.md:11: link',
      ]);
      expect(findings.map((f) => f.detail)).toEqual([
        'plans/F01-recipe-collections.md',
        './F02-missing.md',
      ]);
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    'rejects removed-runtime remnants in code and configuration',
    () => {
      const { run, findings } = checkDrift('fail-code-remnant');
      expect(run.status).toBe(1);
      expect(keys(findings)).toEqual([
        'apps/api/src/legacy.js:1: code-remnant',
        // One finding per match: the image's org and its name are both reported.
        'compose.yml:3: code-remnant',
        'compose.yml:3: code-remnant',
        'docker-entrypoint.sh:2: code-remnant',
      ]);
      for (const f of findings) expect(fixtureLine('fail-code-remnant', f)).toContain(f.detail);
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    'rejects the stale soft-delete idiom and the removed lint rule names',
    () => {
      const { run, findings } = checkDrift('fail-stale-idiom');
      expect(run.status).toBe(1);
      expect(keys(findings)).toEqual([
        'AGENTS.md:5: stale-idiom',
        'AGENTS.md:5: stale-idiom',
        'docs/architecture.md:5: stale-idiom',
      ]);
      expect(findings.map((f) => f.detail)).toEqual([
        'no-import-prefix',
        'no-unversioned-import',
        'eq(table.deletedAt, null)',
      ]);
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    'prints file:line: rule: detail and exits 1 without --json',
    () => {
      const run = runScript('doc-drift-check.ts', [
        '--root',
        join(FIXTURES, 'doc-drift', 'fail-token'),
      ]);
      expect(run.status).toBe(1);
      expect(run.stdout).toMatch(/^docs\/setup\.md:3: token: \S+$/m);
      expect(run.stdout).toMatch(/^openspec\/specs\/widget\/spec\.md:9: token: \S+$/m);
    },
    SPAWN_TIMEOUT_MS,
  );

  // Expected to fail until the wave-6 archive (tasks.md group 28): the deltas must reach
  // openspec/specs and every "Purpose: TBD" must be backfilled first.
  it(
    'passes on the repository root',
    () => {
      const run = runScript('doc-drift-check.ts', []);
      expect(run.status, run.stdout + run.stderr).toBe(0);
    },
    SPAWN_TIMEOUT_MS,
  );
});
