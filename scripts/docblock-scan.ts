/**
 * @module
 * Docblock coverage scanner (code-documentation capability, ADR-020). A dependency-free Node port
 * of the wave-5 inventory scanner
 * (`openspec/changes/archive/2026-07-27-wave-5-debt-clearance/audit/docblock-scan.ts`): it lists
 * every exported production symbol under `apps/api/src`, `apps/web/src`, `packages/shared/src` and
 * `packages/db/src` (test, spec, fixture, generated and `*.d.ts` files excluded) and reports those
 * without a `/** … *\/` docblock. Line (`//`) and plain block (`/* *\/`) comments do not count.
 *
 * Export forms (line-based, column-0 statements only, like the wave-5 scanner):
 * - `export [default] [async] function|class|interface|type|enum|const|let|var <name>`, documented
 *   on the line(s) above the statement;
 * - `export default X;` — documented on the local declaration of `X`;
 * - local `export { X, Y as Z };` — documented on the declaration of each `X`, or on the export
 *   statement itself (the form used for re-exported JSON bundles);
 * - anonymous `export default <expression>` — documented on the export statement.
 * Barrel re-exports (`export * from`, `export { X } from`) and names imported from TypeScript
 * modules are documented at their origin and skipped. Blank lines, decorators and
 * `// biome-ignore` directives between a docblock and its declaration are skipped.
 *
 * Usage: `node scripts/docblock-scan.ts [--check] [--json] [--root <dir>]`
 * - `--check` exits 1 when any docblock is missing, listing `file:line symbol` per finding;
 * - `--json` prints the machine-readable report (used by `packages/shared/src/doc-drift.test.ts`);
 * - `--root` scans another tree with the same layout (default: the repository root).
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

/** How the declaration of an exported symbol is commented. Only `jsdoc` satisfies the rule. */
type DocStatus = 'jsdoc' | 'none' | 'line-comment' | 'block-comment';

/** Which export form produced a finding (see the module docblock). */
type ExportForm = 'declaration' | 'default-local' | 'named-local' | 'anonymous-default';

/** One exported symbol, located at the line where its docblock belongs. */
interface Finding {
  path: string;
  line: number;
  name: string;
  kind: string;
  doc: DocStatus;
  form: ExportForm;
}

/** Machine-readable scan result printed by `--json`. */
interface ScanReport {
  root: string;
  fileCount: number;
  exportCount: number;
  missingCount: number;
  missing: Finding[];
}

/** Production source roots, relative to the scanned root. */
const ROOTS = ['apps/api/src', 'apps/web/src', 'packages/shared/src', 'packages/db/src'];

/** Root-relative paths that are out of scope: tests, fixtures, migrations, generated output, `.d.ts`. */
const EXCLUDE_RE =
  /(\.test\.|_test\.|\.spec\.|__tests__\/|__fixtures__\/|\/migrations\/|\/generated\/|\.gen\.|\.d\.ts$)/;

/** Directory names never descended into. */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);

/** Column-0 export declaration: captures the declaration keyword and the exported name. */
const EXPORT_RE =
  /^export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(function|class|interface|type|enum|const|let|var)\s*\*?\s*([A-Za-z_$][\w$]*)/;

/** Column-0 local declaration (exported or not): captures the declaration keyword and the name. */
const DECL_RE =
  /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(function|class|interface|type|enum|const|let|var)\s*\*?\s*([A-Za-z_$][\w$]*)/;

/** `export default <identifier>;` */
const DEFAULT_IDENTIFIER_RE = /^export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/;

/** Recursively yields `.ts`/`.tsx` files under `dir`, skipping {@link SKIP_DIRS}. */
async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      yield path;
    }
  }
}

/** Heuristic symbol kind (function, hook, component, const, …), kept from the wave-5 scanner. */
function classify(
  name: string,
  decl: string,
  restOfLine: string,
  nextLine: string,
  isTsx: boolean,
): string {
  if (decl === 'function') return /^use[A-Z]/.test(name) ? 'hook' : 'function';
  if (decl === 'class') return 'class';
  if (decl === 'interface' || decl === 'type' || decl === 'enum') return decl;
  if (/^use[A-Z]/.test(name)) return 'hook';
  const rhs = `${restOfLine} ${nextLine}`;
  if (/=>|function\b|memo\(|forwardRef\(|lazy\(/.test(rhs)) {
    return isTsx && /^[A-Z]/.test(name) ? 'component' : 'arrow-fn';
  }
  if (isTsx && /^[A-Z]/.test(name) && /createContext|memo\(/.test(rhs)) return 'component';
  return 'const';
}

/**
 * Classifies the comment directly above line `idx`: walks up past blank lines, decorators and
 * `// biome-ignore` directives, then reports `jsdoc` only when the nearest comment block opens
 * with `/**`.
 */
function docStatus(lines: string[], idx: number): DocStatus {
  let i = idx - 1;
  while (i >= 0) {
    const t = lines[i].trim();
    if (t === '' || t.startsWith('@') || t.startsWith('// biome-ignore')) {
      i--;
      continue;
    }
    break;
  }
  if (i < 0) return 'none';
  const t = lines[i].trim();
  if (t.endsWith('*/')) {
    if (t.startsWith('/**')) return 'jsdoc';
    if (t.startsWith('/*')) return 'block-comment';
    // Multi-line block: walk up to the line that opens it (a body line may contain `/*`, e.g.
    // `equipment/*`, but never starts with it once trimmed).
    let j = i;
    while (j >= 0 && !lines[j].trim().startsWith('/*')) j--;
    return j >= 0 && lines[j].trim().startsWith('/**') ? 'jsdoc' : 'block-comment';
  }
  if (t.startsWith('//')) return 'line-comment';
  return 'none';
}

/** Joins lines from `start` until one contains `terminator`; returns the text and the end index. */
function statementFrom(
  lines: string[],
  start: number,
  terminator: RegExp,
): { text: string; end: number } {
  let text = lines[start];
  let end = start;
  while (!terminator.test(text) && end + 1 < lines.length) {
    end++;
    text += ` ${lines[end].trim()}`;
  }
  return { text, end };
}

/** Maps each column-0 declared name to the line index of its declaration. */
function collectDeclarations(lines: string[]): Map<string, number> {
  const declarations = new Map<string, number>();
  lines.forEach((line, idx) => {
    const m = line.match(DECL_RE);
    if (m && !declarations.has(m[2])) declarations.set(m[2], idx);
  });
  return declarations;
}

/** Maps each import binding (default and named, single- or multi-line) to its module specifier. */
function collectImports(lines: string[]): Map<string, string> {
  const imports = new Map<string, string>();
  for (let idx = 0; idx < lines.length; idx++) {
    if (!/^import\s/.test(lines[idx])) continue;
    const { text, end } = statementFrom(lines, idx, /from\s+['"][^'"]+['"]|^import\s+['"]/);
    idx = end;
    const source = text.match(/from\s+['"]([^'"]+)['"]/)?.[1];
    if (!source) continue;
    const clause = text.replace(/^import\s+(?:type\s+)?/, '').replace(/\s+from\s+['"].*$/, '');
    const braces = clause.match(/\{([^}]*)\}/);
    for (const part of braces ? braces[1].split(',') : []) {
      const local = part
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)
        .pop();
      if (local) imports.set(local.trim(), source);
    }
    const defaultBinding = clause.replace(/\{[^}]*\}/, '').match(/^\s*([A-Za-z_$][\w$]*)/);
    if (defaultBinding) imports.set(defaultBinding[1], source);
    const namespace = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (namespace) imports.set(namespace[1], source);
  }
  return imports;
}

/** Returns every exported symbol of one file with its docblock status. */
function scanFile(path: string, text: string): Finding[] {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  const isTsx = path.endsWith('.tsx');
  const declarations = collectDeclarations(lines);
  const imports = collectImports(lines);
  const findings: Finding[] = [];

  /** Records the local declaration of `name` (exported via `export default X` / `export { X }`). */
  const pushLocal = (name: string, exportIdx: number, form: ExportForm): void => {
    const declIdx = declarations.get(name);
    if (declIdx !== undefined) {
      // A declaration that is itself `export …` is already counted by the main scan.
      if (lines[declIdx].startsWith('export')) return;
      const m = lines[declIdx].match(DECL_RE);
      findings.push({
        path,
        line: declIdx + 1,
        name,
        kind: classify(name, m?.[1] ?? 'const', '', lines[declIdx + 1] ?? '', isTsx),
        doc: docStatus(lines, declIdx),
        form,
      });
      return;
    }
    const source = imports.get(name);
    // Bindings imported from TypeScript modules are documented at their origin; JSON bundles and
    // unresolved names are documented on the export statement.
    if (source !== undefined && !source.endsWith('.json')) return;
    findings.push({
      path,
      line: exportIdx + 1,
      name,
      kind: 'const',
      doc: docStatus(lines, exportIdx),
      form,
    });
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (!line.startsWith('export')) continue;
    if (/^export\s*\*/.test(line)) continue;

    if (/^export\s+(?:type\s+)?\{/.test(line)) {
      const { text: stmt, end } = statementFrom(lines, idx, /\}/);
      const exportIdx = idx;
      idx = end;
      if (/\}\s*from\s/.test(stmt)) continue;
      const statementDoc = docStatus(lines, exportIdx);
      const body = stmt.match(/\{([^}]*)\}/)?.[1] ?? '';
      for (const part of body.split(',')) {
        const local = part
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]
          ?.trim();
        if (!local || !/^[A-Za-z_$][\w$]*$/.test(local)) continue;
        if (statementDoc === 'jsdoc') {
          findings.push({
            path,
            line: exportIdx + 1,
            name: local,
            kind: 'const',
            doc: 'jsdoc',
            form: 'named-local',
          });
        } else {
          pushLocal(local, exportIdx, 'named-local');
        }
      }
      continue;
    }

    const m = line.match(EXPORT_RE);
    if (m) {
      findings.push({
        path,
        line: idx + 1,
        name: m[2],
        kind: classify(
          m[2],
          m[1],
          line.slice(line.indexOf(m[2]) + m[2].length),
          lines[idx + 1] ?? '',
          isTsx,
        ),
        doc: docStatus(lines, idx),
        form: 'declaration',
      });
      continue;
    }

    if (/^export\s+default\s/.test(line)) {
      const identifier = line.match(DEFAULT_IDENTIFIER_RE);
      if (identifier) {
        pushLocal(identifier[1], idx, 'default-local');
      } else {
        findings.push({
          path,
          line: idx + 1,
          name: '(anonymous default)',
          kind: /function|=>/.test(line) ? 'function' : 'const',
          doc: docStatus(lines, idx),
          form: 'anonymous-default',
        });
      }
    }
  }
  return findings;
}

/** Converts an absolute path to a root-relative POSIX path. */
function toPosix(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

/** Scans the production roots that exist under `root`; throws when none does. */
async function scan(root: string): Promise<ScanReport> {
  const all: Finding[] = [];
  let fileCount = 0;
  let rootsFound = 0;
  for (const dir of ROOTS) {
    const abs = join(root, dir);
    const info = await stat(abs).catch(() => null);
    if (!info?.isDirectory()) continue;
    rootsFound++;
    for await (const file of walk(abs)) {
      const rel = toPosix(root, file);
      if (EXCLUDE_RE.test(rel)) continue;
      fileCount++;
      all.push(...scanFile(rel, await readFile(file, 'utf8')));
    }
  }
  if (rootsFound === 0) {
    throw new Error(`none of ${ROOTS.join(', ')} exists under ${root}`);
  }
  const missing = all.filter((f) => f.doc !== 'jsdoc');
  return {
    root,
    fileCount,
    exportCount: all.length,
    missingCount: missing.length,
    missing,
  };
}

/** Parses `--check`, `--json` and `--root <dir>` from the command line. */
function parseArgs(argv: string[]): { check: boolean; json: boolean; root: string } {
  const rootFlag = argv.indexOf('--root');
  const root =
    rootFlag >= 0 && argv[rootFlag + 1]
      ? resolve(argv[rootFlag + 1])
      : resolve(import.meta.dirname, '..');
  return { check: argv.includes('--check'), json: argv.includes('--json'), root };
}

/** CLI entry point: prints the report and sets the exit code (`--check`: 1 on any finding). */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  let report: ScanReport;
  try {
    report = await scan(args.root);
  } catch (err) {
    console.error(`docblock-scan: ${(err as Error).message}`);
    process.exitCode = 2;
    return;
  }
  if (args.json) {
    console.log(JSON.stringify(report, null, 1));
  } else {
    for (const f of report.missing) console.log(`${f.path}:${f.line} ${f.name}`);
    console.log(
      `docblock-scan: ${report.exportCount} exported symbols in ${report.fileCount} files, ` +
        `${report.missingCount} without a /** */ docblock`,
    );
  }
  if (args.check && report.missingCount > 0) process.exitCode = 1;
}

await main();
