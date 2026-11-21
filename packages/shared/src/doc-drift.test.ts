/**
 * Fixture tests for the repository's documentation guards (doc-drift-check and
 * code-documentation capabilities). Each case runs a root `scripts/*.ts` file with plain `node`
 * (Node 26 type stripping, no install step) through `node:child_process`, exactly as the
 * `doc-drift` CI job and `pnpm run docs:check` do, and asserts the exit code and the reported
 * `file:line` entries:
 * - `scripts/docblock-scan.ts` against `__fixtures__/docblock/{pass,fail}`;
 * - one run of each script against the repository root.
 */
import { spawnSync } from 'node:child_process';
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
