/**
 * @module
 * Lint-policy meta-test (capability `lint-style`: "Source files carry no file-level or range lint
 * suppressions", "Surviving line-level lint directives carry a justification comment" and "Raw SQL
 * is confined to an accepted-exception registry"). It scans every `apps/<member>/src` and
 * `packages/<member>/src` tree and fails with `file:line` for:
 *
 * - any file-level or range suppression (Biome's `-all`, `-start` and `-end` forms), anywhere in a
 *   source file;
 * - any line-level suppression comment that does not name exactly one
 *   `<category>/<group>/<rule>` path, or whose justification after the colon is empty or still
 *   Biome's `<explanation>` placeholder;
 * - any raw-SQL site in a production `.ts`/`.tsx` file (a Drizzle `sql` tag, plain or typed, or
 *   the migration pre-flight's postgres-js `client` tag; comment lines and test files are skipped)
 *   without a `// D03 raw-SQL exception: <why>` comment within the 10 lines above it, and any
 *   string-built SQL (`sql.raw(`, `.unsafe(`).
 *
 * It also fails when the per-file raw-SQL site counts differ from `RAW_SQL_REGISTRY`, the
 * executable copy of the lint-style registry table (a file without an entry allows none), and
 * prints the actual map so a new registry row and its count land in the same change.
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
        // A top-level entry's parentPath keeps the trailing slash of the URL passed to readdir.
        const dirRel = entry.parentPath.slice(entry.parentPath.indexOf(srcRel)).replace(/\/+$/, '');
        if (dirRel.split('/').some((segment) => SKIPPED_DIRS.has(segment))) continue;
        files.push(`${dirRel}/${entry.name}`);
      }
    }
  }
  return files.sort();
}

/** Production files the raw-SQL scan reads (TypeScript sources only). */
const RAW_SQL_SCANNED = /\.tsx?$/;

/** Test files and test support, skipped by the raw-SQL scan. */
const TEST_FILE = /(?:\.test\.tsx?|\/test-helpers\.ts|\/test-setup\.ts)$|\/test-fixtures\//;

/** A raw-SQL site: a Drizzle `sql` tag (plain or typed) or the pre-flight's postgres-js `client` tag. */
const RAW_SQL_SITE = /\b(?:sql|client)(?:<[^`\n]*>)?`/;

/** String-built SQL, never allowed in the source trees. */
const STRING_SQL = /\bsql\.raw\(|\.unsafe\(/;

/** The D03 marker with a non-empty reason. */
const D03_MARKER = /\/\/\s*D03 raw-SQL exception:\s*\S/;

/** Lines above a site in which its D03 marker must appear. */
const D03_WINDOW = 10;

/** Prose lines (line, block and docblock comments) are never sites. */
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

/**
 * The lint-style registry (`openspec/specs/lint-style/spec.md`, "Raw SQL is confined to an
 * accepted-exception registry") as data: production file → number of raw-SQL site lines. Copied
 * from the map the repository test prints; a file without an entry allows none.
 */
const RAW_SQL_REGISTRY: Record<string, number> = {
  // Correlated EXISTS (getRecipesUsingEquipment).
  'apps/api/src/modules/equipment/model.ts': 1,
  // 5 atomic counters, 2 relevance-score fragments, the NULLS LAST pair, the keyset pair.
  'apps/api/src/modules/recipe/model.ts': 11,
  // Migration pre-flight catalog query (postgres-js tag).
  'packages/db/src/preflight.ts': 1,
  // lower(), the seven check() expressions, the setup_user_default_unique predicate.
  'packages/db/src/schema.ts': 9,
};

/** The result of scanning one source text for raw SQL. */
interface RawSqlScan {
  /** 1-based line numbers of every raw-SQL site. */
  sites: number[];
  /** Sites without a D03 marker, and every string-built SQL line. */
  violations: Violation[];
}

/**
 * Finds the raw-SQL sites in one source text and the lines that break the registry rules. Pure:
 * no I/O.
 *
 * @param source - The file contents.
 * @param file - The path reported in each violation.
 * @returns The site lines and the violations, both in line order.
 */
function findRawSqlSites(source: string, file: string): RawSqlScan {
  const lines = source.split('\n');
  const sites: number[] = [];
  const violations: Violation[] = [];
  lines.forEach((text, index) => {
    if (COMMENT_LINE.test(text)) return;
    const line = index + 1;
    if (STRING_SQL.test(text)) {
      violations.push({ file, line, reason: 'string-built SQL (sql.raw( or .unsafe() is banned' });
    }
    if (!RAW_SQL_SITE.test(text)) return;
    sites.push(line);
    const window = lines.slice(Math.max(0, index - D03_WINDOW), index);
    if (!window.some((above) => D03_MARKER.test(above))) {
      violations.push({
        file,
        line,
        reason: `raw-SQL fragment without a "// D03 raw-SQL exception: <why>" comment in the ${D03_WINDOW} lines above`,
      });
    }
  });
  return { sites, violations };
}

/**
 * Lists the files whose raw-SQL site count differs from the registry.
 *
 * @param actual - Production file → site count, as scanned (files with no site omitted).
 * @param registry - The expected map (`RAW_SQL_REGISTRY`).
 * @returns One `file: expected N, found M` line per drifting file, sorted by file.
 */
function registryDrift(actual: Record<string, number>, registry: Record<string, number>): string[] {
  const files = [...new Set([...Object.keys(actual), ...Object.keys(registry)])].sort();
  return files
    .filter((file) => (actual[file] ?? 0) !== (registry[file] ?? 0))
    .map((file) => `${file}: expected ${registry[file] ?? 0}, found ${actual[file] ?? 0}`);
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
    expect(files).toContain('packages/db/src/schema.ts');
    expect(files.filter((f) => f.includes('//'))).toEqual([]);
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

/** A D03 marker with a reason, for the raw-SQL fixtures. */
const MARKER = '// D03 raw-SQL exception: no builder for this expression';

/**
 * Builds plain statement lines that hold no SQL, to place a marker a given distance above a site.
 *
 * @param count - How many lines to build.
 * @returns The filler lines.
 */
function filler(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `const f${i} = ${i};`);
}

/** The violation reason for a site without its marker (line suffix of `formatViolation`). */
const NO_MARKER = `raw-SQL fragment without a "// D03 raw-SQL exception: <why>" comment in the ${D03_WINDOW} lines above`;

describe('findRawSqlSites', () => {
  it('counts plain and typed sql tags and the postgres-js client tag as sites', () => {
    const source = [
      MARKER,
      'const a = sql`count + 1`;',
      'const b = sql<number>`count(*)`;',
      'const rows = await client`select 1`;',
    ].join('\n');

    expect(findRawSqlSites(source, 'x.ts')).toEqual({ sites: [2, 3, 4], violations: [] });
  });

  it('does not count line, block or docblock comments that quote a tag', () => {
    const source = [
      '  // no sql`false` fragment for the anonymous case',
      '/* the sql`x` tag */',
      ' * The `CASE` score and `NULLS LAST` fragments are the two `sql` exceptions',
      '   * client`select 1` in prose',
    ].join('\n');

    expect(findRawSqlSites(source, 'x.ts')).toEqual({ sites: [], violations: [] });
  });

  it('accepts a marker 10 lines above a site and rejects one 11 lines above', () => {
    const within = [MARKER, ...filler(9), 'const a = sql<number>`count(*)`;'].join('\n');
    const beyond = [MARKER, ...filler(10), 'const a = sql<number>`count(*)`;'].join('\n');

    expect(findRawSqlSites(within, 'x.ts')).toEqual({ sites: [11], violations: [] });
    expect(findRawSqlSites(beyond, 'x.ts').violations.map(formatViolation)).toEqual([
      `x.ts:12: ${NO_MARKER}`,
    ]);
  });

  it('rejects a site without a marker or under a marker with an empty reason', () => {
    const source = [
      'const a = sql`x`;',
      '// D03 raw-SQL exception:',
      'const b = sql`y`;',
      '// D03 raw-SQL exception:    ',
      'const rows = await client`select 1`;',
    ].join('\n');

    expect(findRawSqlSites(source, 'x.ts').violations.map(formatViolation)).toEqual([
      `x.ts:1: ${NO_MARKER}`,
      `x.ts:3: ${NO_MARKER}`,
      `x.ts:5: ${NO_MARKER}`,
    ]);
  });

  it('always rejects sql.raw( and .unsafe(, even under a marker', () => {
    const source = [MARKER, 'await db.execute(sql.raw(text));', 'await client.unsafe(text);'].join(
      '\n',
    );

    expect(findRawSqlSites(source, 'x.ts')).toEqual({
      sites: [],
      violations: [
        { file: 'x.ts', line: 2, reason: 'string-built SQL (sql.raw( or .unsafe() is banned' },
        { file: 'x.ts', line: 3, reason: 'string-built SQL (sql.raw( or .unsafe() is banned' },
      ],
    });
  });
});

describe('registryDrift', () => {
  it('names each file whose count differs, including unregistered and vanished files', () => {
    const actual = { 'a.ts': 2, 'b.ts': 1, 'c.ts': 3 };
    const registry = { 'a.ts': 2, 'c.ts': 4, 'd.ts': 1 };

    expect(registryDrift(actual, registry)).toEqual([
      'b.ts: expected 0, found 1',
      'c.ts: expected 4, found 3',
      'd.ts: expected 1, found 0',
    ]);
    expect(registryDrift(registry, registry)).toEqual([]);
  });
});

describe('repository raw-SQL registry', () => {
  it('confines raw SQL to the lint-style registry', async () => {
    const violations: string[] = [];
    const actual: Record<string, number> = {};
    for (const file of await listScannedFiles()) {
      if (!RAW_SQL_SCANNED.test(file) || TEST_FILE.test(file)) continue;
      const source = await readFile(new URL(file, ROOT), 'utf8');
      const scan = findRawSqlSites(source, file);
      violations.push(...scan.violations.map(formatViolation));
      if (scan.sites.length > 0) actual[file] = scan.sites.length;
    }

    expect.soft(violations).toEqual([]);
    expect(
      actual,
      [
        'RAW_SQL_REGISTRY differs from the scanned raw-SQL sites:',
        ...registryDrift(actual, RAW_SQL_REGISTRY),
        `Actual map: ${JSON.stringify(actual, null, 2)}`,
      ].join('\n'),
    ).toEqual(RAW_SQL_REGISTRY);
  });
});
