/**
 * @module
 * Lint-suppression policy meta-test (capability `lint-style`, "Source files carry no file-level
 * or range lint suppressions" and "Surviving line-level lint directives carry a justification
 * comment"). It scans every `apps/<member>/src` and `packages/<member>/src` tree and fails with
 * `file:line` for:
 *
 * - any file-level or range suppression (Biome's `-all`, `-start` and `-end` forms), anywhere in a
 *   source file;
 * - any line-level suppression comment that does not name exactly one
 *   `<category>/<group>/<rule>` path, or whose justification after the colon is empty or still
 *   Biome's `<explanation>` placeholder.
 *
 * The suppression keyword is assembled at runtime (`KEYWORD`) so this file's own fixtures never
 * contain the literal forms the scan rejects.
 */
import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

/** Workspace root, derived from this file (packages/shared/src → up three levels). */
const ROOT = new URL('../../../', import.meta.url);

/** The workspace folders whose members' `src` trees are scanned. */
const MEMBER_PARENTS = ['apps', 'packages'];

/** File extensions that can carry a Biome suppression comment. */
const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|css)$/;

/** Directories never scanned (build output, coverage reports, dependencies). */
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'coverage']);

/** The Biome suppression keyword, assembled so this file never contains the banned forms. */
const KEYWORD = ['biome', 'ignore'].join('-');

/** A file-level or range suppression anywhere on a line (`-all`, `-start`, `-end`). */
const RANGE_FORM = new RegExp(`${KEYWORD}-(?:all|start|end)\\b`);

/** A comment that starts with a line-level suppression; group 1 is the text after the keyword. */
const LINE_SUPPRESSION = new RegExp(`(?:\\/\\/|\\/\\*)\\s*${KEYWORD}(?![\\w-])(.*)$`);

/**
 * A valid line-level suppression body: one `<category>/<group>/<rule>` path (with an optional
 * Biome rule value in parentheses), a colon, then the justification (group 1).
 */
const VALID_BODY = /^\s+(?:lint|assist|syntax)\/[A-Za-z]\w*\/[A-Za-z]\w*(?:\([^)]*\))?:(.*)$/;

/** One policy violation, reported as `file:line: reason`. */
interface Violation {
  /** Path relative to the workspace root, with forward slashes. */
  file: string;
  /** 1-based line number. */
  line: number;
  /** Why the line violates the policy. */
  reason: string;
}

/**
 * Strips a block-comment terminator (and a JSX expression's closing brace) from a justification,
 * so `{/* … : reason *\/}` yields `reason`.
 *
 * @param text - The raw text after the colon.
 * @returns The trimmed justification.
 */
function cleanJustification(text: string): string {
  return text.replace(/\*\/\s*\}?\s*$/, '').trim();
}

/**
 * Checks one source text against the suppression policy. Pure: no I/O.
 *
 * @param source - The file contents.
 * @param file - The path reported in each violation.
 * @returns Every violation, in line order.
 */
function findSuppressionViolations(source: string, file: string): Violation[] {
  const violations: Violation[] = [];
  source.split('\n').forEach((text, index) => {
    const line = index + 1;
    if (RANGE_FORM.test(text)) {
      violations.push({ file, line, reason: 'file-level or range suppression' });
      return;
    }
    const match = LINE_SUPPRESSION.exec(text);
    if (!match) return;
    const body = VALID_BODY.exec(match[1]);
    if (!body) {
      violations.push({
        file,
        line,
        reason: 'suppression must name one <category>/<group>/<rule> path followed by ":"',
      });
      return;
    }
    const justification = cleanJustification(body[1]);
    if (justification === '' || justification === '<explanation>') {
      violations.push({ file, line, reason: 'suppression needs a concrete justification' });
    }
  });
  return violations;
}

/**
 * Formats a violation as `file:line: reason` (the shape the failing assertion prints).
 *
 * @param v - The violation.
 */
function formatViolation(v: Violation): string {
  return `${v.file}:${v.line}: ${v.reason}`;
}

/**
 * Lists every scannable source file under `apps/<member>/src` and `packages/<member>/src`.
 *
 * @returns Paths relative to the workspace root, with forward slashes, sorted.
 */
async function listScannedFiles(): Promise<string[]> {
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
        if (!entry.isFile() || !SOURCE_EXTENSIONS.test(entry.name)) continue;
        const dirRel = entry.parentPath.slice(entry.parentPath.indexOf(srcRel));
        if (dirRel.split('/').some((segment) => SKIPPED_DIRS.has(segment))) continue;
        files.push(`${dirRel}/${entry.name}`);
      }
    }
  }
  return files.sort();
}

describe('findSuppressionViolations', () => {
  it('rejects the file-level and range forms with their line numbers', () => {
    const source = [
      `// ${KEYWORD}-all lint/suspicious/noExplicitAny: legacy`,
      'const a = 1;',
      `// ${KEYWORD}-start lint/suspicious/noExplicitAny: block`,
      'const b = 2;',
      `// ${KEYWORD}-end lint/suspicious/noExplicitAny: block`,
    ].join('\n');

    expect(findSuppressionViolations(source, 'x.ts').map(formatViolation)).toEqual([
      'x.ts:1: file-level or range suppression',
      'x.ts:3: file-level or range suppression',
      'x.ts:5: file-level or range suppression',
    ]);
  });

  it('rejects suppressions without a full rule path', () => {
    const source = [
      `// ${KEYWORD} lint: everything`,
      `// ${KEYWORD} lint/suspicious: a whole group`,
      `// ${KEYWORD} noExplicitAny: bare rule name`,
      `// ${KEYWORD} lint/suspicious/noExplicitAny`,
      `// ${KEYWORD} lint/suspicious/noExplicitAny lint/suspicious/useAwait: two rules`,
    ].join('\n');

    expect(findSuppressionViolations(source, 'x.ts').map((v) => v.line)).toEqual([1, 2, 3, 4, 5]);
  });

  it('rejects an empty or placeholder justification', () => {
    const source = [
      `// ${KEYWORD} lint/suspicious/noExplicitAny:`,
      `// ${KEYWORD} lint/suspicious/noExplicitAny:   `,
      `// ${KEYWORD} lint/suspicious/noExplicitAny: <explanation>`,
      `{/* ${KEYWORD} lint/a11y/noAutofocus: */}`,
    ].join('\n');

    expect(findSuppressionViolations(source, 'x.tsx').map(formatViolation)).toEqual([
      'x.tsx:1: suppression needs a concrete justification',
      'x.tsx:2: suppression needs a concrete justification',
      'x.tsx:3: suppression needs a concrete justification',
      'x.tsx:4: suppression needs a concrete justification',
    ]);
  });

  it('accepts justified line-level suppressions in line, block and JSX comments', () => {
    const source = [
      `  // ${KEYWORD} lint/suspicious/noExplicitAny: test assertion cast`,
      `/* ${KEYWORD} lint/style/noNonNullAssertion: checked above */`,
      `{/* ${KEYWORD} lint/a11y/noAutofocus: dialog focus target */}`,
      `// ${KEYWORD} lint/correctness/useExhaustiveDependencies(load): stable callback`,
      `// ${KEYWORD} assist/source/organizeImports: generated order`,
    ].join('\n');

    expect(findSuppressionViolations(source, 'x.tsx')).toEqual([]);
  });

  it('ignores prose that mentions the keyword without starting a suppression', () => {
    const source = [
      `// A ${KEYWORD} comment must name one rule.`,
      `const note = 'use a line-level ${KEYWORD} comment';`,
    ].join('\n');

    expect(findSuppressionViolations(source, 'x.ts')).toEqual([]);
  });
});

describe('repository lint-suppression policy', () => {
  it('finds source files in every apps/*/src and packages/*/src tree', async () => {
    const files = await listScannedFiles();
    for (const root of [
      'apps/api/src/',
      'apps/web/src/',
      'packages/db/src/',
      'packages/shared/src/',
    ]) {
      expect(files.some((f) => f.startsWith(root))).toBe(true);
    }
  });

  it('has no file-level, range, path-less or unjustified suppression', async () => {
    const violations: string[] = [];
    for (const file of await listScannedFiles()) {
      const source = await readFile(new URL(file, ROOT), 'utf8');
      violations.push(...findSuppressionViolations(source, file).map(formatViolation));
    }
    expect(violations).toEqual([]);
  });
});
