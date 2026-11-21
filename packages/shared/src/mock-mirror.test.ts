/**
 * @module
 * Mock-mirror guard (capability `model-test-coverage`, "Test files exercise the production module
 * they name"). Every `*.test.ts`/`*.test.tsx` under `apps/<member>/src` and
 * `packages/<member>/src` must import at least one project module (a relative path, `@brewform/*`
 * or `@/*`) other than test support (`test-setup`, `test-helpers`, `test-fixtures/`, another test
 * file). A test that imports nothing from the project can only assert against an inline copy of
 * the code it claims to cover, so it passes whatever production does.
 *
 * Static scan tests read source, config or script files instead of importing a module. They are
 * listed in `STATIC_SCAN_TESTS` with the reason, and the list stays exact: a listed file that
 * imports a project module, or no longer exists, fails too.
 *
 * Fixture sources are built with `importLine()` so this file itself imports no project module.
 */
import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

/** Workspace root, derived from this file (packages/shared/src → up three levels). */
const ROOT = new URL('../../../', import.meta.url);

/** The workspace folders whose members' `src` trees are scanned. */
const MEMBER_PARENTS = ['apps', 'packages'];

/** Test files the guard checks. */
const TEST_FILE_NAME = /\.test\.tsx?$/;

/** Directories never scanned (build output, coverage reports, dependencies). */
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'coverage']);

/** Module specifiers (group 1) of static, re-export, side-effect and dynamic imports. */
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g;

/** A specifier that names a project module: relative, a workspace package or the web `@/` alias. */
const PROJECT_SPECIFIER = /^(?:\.{1,2}\/|@brewform\/|@\/)/;

/** Test support, which never counts as the production module a test exercises. */
const TEST_SUPPORT_SPECIFIER =
  /(?:^|\/)(?:test-setup|test-helpers)(?:\.tsx?)?$|\/test-fixtures\/|\.test\.tsx?$/;

/**
 * Tests that read files instead of importing a module, each with the reason it is a genuine
 * static scan. Keys are paths relative to the workspace root.
 */
const STATIC_SCAN_TESTS: Record<string, string> = {
  'apps/api/src/modules/auth/identifier.enforcement.test.ts':
    'reads the model sources to enforce lower() on identifier comparisons',
  'apps/api/src/modules/health/probe.test.ts':
    'spawns apps/api/scripts/healthcheck.mjs as a process, as the image HEALTHCHECK runs it',
  'apps/api/src/utils/db-error-logging.enforcement.test.ts':
    'reads the API sources to enforce toLoggableError() in error logs',
  'apps/web/src/i18n-literals.test.ts': 'reads the web sources to find hard-coded UI literals',
  'apps/web/src/robots.test.ts': 'reads public/robots.txt',
  'apps/web/src/utils/chart/chart-guards.test.ts':
    'inlines the chart component sources with import.meta.glob(?raw) and scans them',
  'packages/shared/src/compose-config.test.ts': 'reads the compose files',
  'packages/shared/src/doc-drift.test.ts': 'runs scripts/doc-drift-check.ts on fixture trees',
  'packages/shared/src/lint-policy.test.ts':
    'reads every source file for lint suppressions and raw SQL',
  'packages/shared/src/mock-mirror.test.ts': 'this guard: reads every test file',
  'packages/shared/src/workspace.test.ts': 'reads the workspace package.json files',
};

/**
 * Lists the project modules a test source imports, skipping packages and test support. Pure: no
 * I/O.
 *
 * @param source - The test file contents.
 * @returns The qualifying module specifiers, in source order.
 */
function projectImports(source: string): string[] {
  return [...source.matchAll(IMPORT_SPECIFIER)]
    .map((match) => match[1])
    .filter((spec) => PROJECT_SPECIFIER.test(spec) && !TEST_SUPPORT_SPECIFIER.test(spec));
}

/**
 * Lists every test file under `apps/<member>/src` and `packages/<member>/src`.
 *
 * @returns Paths relative to the workspace root, with forward slashes, sorted.
 */
async function listTestFiles(): Promise<string[]> {
  const files: string[] = [];
  for (const parent of MEMBER_PARENTS) {
    const members = await readdir(new URL(`${parent}/`, ROOT), { withFileTypes: true });
    for (const member of members) {
      if (!member.isDirectory()) continue;
      const srcRel = `${parent}/${member.name}/src`;
      const entries = await readdir(new URL(`${srcRel}/`, ROOT), {
        recursive: true,
        withFileTypes: true,
      }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isFile() || !TEST_FILE_NAME.test(entry.name)) continue;
        // A top-level entry's parentPath keeps the trailing slash of the URL passed to readdir.
        const dirRel = entry.parentPath.slice(entry.parentPath.indexOf(srcRel)).replace(/\/+$/, '');
        if (dirRel.split('/').some((segment) => SKIPPED_DIRS.has(segment))) continue;
        files.push(`${dirRel}/${entry.name}`);
      }
    }
  }
  return files.sort();
}

/**
 * Builds one import statement for the fixtures (kept out of this file's own source text).
 *
 * @param spec - The module specifier.
 * @param form - `named` (`import { a } from`), `side` (`import '…'`) or `dynamic` (`import('…')`).
 */
function importLine(spec: string, form: 'named' | 'side' | 'dynamic' = 'named'): string {
  if (form === 'side') return `import '${spec}';`;
  if (form === 'dynamic') return `const mod = await import('${spec}');`;
  return `import { a } from '${spec}';`;
}

describe('projectImports', () => {
  it('counts relative, workspace-package and @/ modules in every import form', () => {
    const source = [
      importLine('./service.ts'),
      importLine('../model.ts', 'side'),
      importLine('@brewform/shared/schemas'),
      importLine('@/utils/format.ts', 'dynamic'),
      `export { b } from '${'./index.ts'}';`,
    ].join('\n');

    expect(projectImports(source)).toEqual([
      './service.ts',
      '../model.ts',
      '@brewform/shared/schemas',
      '@/utils/format.ts',
      './index.ts',
    ]);
  });

  it('ignores packages, Node built-ins and test support', () => {
    const source = [
      importLine('vitest'),
      importLine('node:fs/promises'),
      importLine('@testing-library/react'),
      importLine('../../test-setup.ts', 'side'),
      importLine('./test-helpers.ts'),
      importLine('../../test-fixtures/mail.ts'),
      importLine('./other.test.ts'),
    ].join('\n');

    expect(projectImports(source)).toEqual([]);
  });

  it('finds nothing in a mirror that re-implements the code inline', () => {
    const source = [
      importLine('vitest'),
      'function extractName(u) { return u.displayName || u.username; }',
      "it('uses the display name', () => expect(extractName({ displayName: 'A' })).toBe('A'));",
    ].join('\n');

    expect(projectImports(source)).toEqual([]);
  });
});

describe('repository mock-mirror guard', () => {
  it('finds test files in every apps/*/src and packages/*/src tree', async () => {
    const files = await listTestFiles();
    for (const root of [
      'apps/api/src/',
      'apps/web/src/',
      'packages/db/src/',
      'packages/shared/src/',
    ]) {
      expect(files.some((f) => f.startsWith(root))).toBe(true);
    }
  });

  it('every test file imports a project module or is a listed static scan', async () => {
    const files = await listTestFiles();
    const mirrors: string[] = [];
    const staleListed: string[] = [];
    for (const file of files) {
      const imports = projectImports(await readFile(new URL(file, ROOT), 'utf8'));
      const listed = file in STATIC_SCAN_TESTS;
      if (imports.length === 0 && !listed) mirrors.push(file);
      if (imports.length > 0 && listed) {
        staleListed.push(`${file}: imports ${imports[0]}; remove it from STATIC_SCAN_TESTS`);
      }
    }
    for (const file of Object.keys(STATIC_SCAN_TESTS)) {
      if (!files.includes(file)) staleListed.push(`${file}: not found; remove it`);
    }

    expect.soft(staleListed).toEqual([]);
    expect(
      mirrors,
      'test files that import no project module (mock-mirrors): import the real module, or list a genuine static scan in STATIC_SCAN_TESTS with its reason',
    ).toEqual([]);
  });
});
