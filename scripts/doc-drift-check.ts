/**
 * @module
 * Doc-drift guard (doc-drift-check capability, ADR-020/021 era). Dependency-free: runs with plain
 * `node scripts/doc-drift-check.ts` (Node 26 type stripping, `node:` built-ins only), so the
 * `doc-drift` CI job needs no install step. Rules, each reported as `file:line: rule: detail`:
 *
 * - `token`: the removed-tooling pattern of the doc-drift-check spec (the old runtime's name, its
 *   KV and land variants, and its registry specifier; case-insensitive, whole words only, so
 *   "denotes" passes) anywhere in the documentation scope: `openspec/specs/**\/*.md`,
 *   `openspec/config.yaml`, `docs/**\/*.md`, every root-level `*.md`, `plans/ROADMAP.md`,
 *   `plans/FEATURE_SUGGESTIONS.md`, `plans/F*.md` and `.github/**\/*.md`;
 * - `stale-idiom`: `eq(<table>.deletedAt, null)` and the old lint rule names
 *   `no-import-prefix`/`no-unversioned-import` in the documentation scope;
 * - `code-remnant`: the token pattern, npm-scheme import specifiers (a quoted specifier starting
 *   with the `npm` scheme) and unstable-feature runtime flags across `apps/`, `packages/`, `scripts/`, `Dockerfile*`, `compose*.yml`,
 *   `.github/`, `Makefile`, `.githooks/`, `pnpm-workspace.yaml`, `renovate.json`, `docker-*.sh`
 *   and `.env*.example` (node-runtime capability);
 * - `link`: relative Markdown links (inline and reference-style, outside fenced code) in the
 *   documentation scope whose target file does not exist; URLs with a scheme (`https:`,
 *   `mailto:`, …) and pure `#anchors` are skipped, and the `#anchor` part is ignored;
 * - `purpose`: an `openspec/specs/<capability>/spec.md` Purpose still reading
 *   "TBD - created by archiving change …";
 * - `archived-capability`: a capability under `openspec/changes/archive/<change>/specs/` with no
 *   `openspec/specs/<capability>/spec.md`, unless listed in the allowlist's `retiredCapabilities`;
 * - `allowlist-reason` / `allowlist-stale` / `allowlist-invalid`: allowlist entries without a
 *   reason, entries whose glob matches no file, and an unreadable allowlist.
 *
 * Exemptions live in `scripts/doc-drift-allowlist.json` (`entries[]` of `{ path, reason }` globs,
 * plus `retiredCapabilities`). An allowlisted path is exempt from the `token`, `stale-idiom` and
 * `code-remnant` rules only. `openspec/changes/**` (change records) and `**\/__fixtures__/**`
 * (this script's test fixtures) are outside every content scan.
 *
 * Usage: `node scripts/doc-drift-check.ts [--root <dir>] [--json]` — exits 1 on any finding.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';

/** One reported problem. `line` is 1-based. */
interface Finding {
  file: string;
  line: number;
  rule: string;
  detail: string;
}

/** One allowlist entry as written in the JSON file. */
interface AllowlistEntry {
  path: string;
  reason: string;
}

/** Parsed allowlist: exemption globs and the retired capability names. */
interface Allowlist {
  entries: AllowlistEntry[];
  retiredCapabilities: Record<string, string>;
}

/** Root-relative location of the allowlist. */
const ALLOWLIST_PATH = 'scripts/doc-drift-allowlist.json';

/**
 * Removed-tooling token pattern from the doc-drift-check spec. The character classes keep the
 * pattern's own source from matching itself in the code-remnant scan of `scripts/`.
 */
const TOKEN_RE = /(?<![A-Za-z])[d]eno(?:kv|land)?(?![A-Za-z])|[j]sr:/gi;

/** Extra code-remnant patterns: npm-scheme specifiers and unstable-feature runtime flags. */
const REMNANT_EXTRA_RES = [/(?<=['"`])[n]pm:/g, /--[u]nstable-[a-z-]+/g];

/** Stale idioms rejected in the documentation scope (case-sensitive). */
const STALE_IDIOM_RES = [
  /eq\(\s*[A-Za-z_][\w.]*\.deletedAt\s*,\s*null\s*\)/g,
  /no-import-prefix|no-unversioned-import/g,
];

/** Purpose placeholder written by `openspec archive` for a new capability. */
const PURPOSE_TBD_RE = /TBD - created by archiving change/;

/** Directory names never descended into. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '__fixtures__']);

/** Extensions treated as binary and never scanned for remnants. */
const BINARY_EXT_RE =
  /\.(png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot|pdf|zip|gz|tgz|br|mp3|mp4|webm|wasm|lockb)$/i;

/** Files larger than this are skipped by the code-remnant scan (generated bundles, dumps). */
const MAX_REMNANT_BYTES = 1_000_000;

/** Root-relative POSIX form of an absolute path. */
function rel(root: string, abs: string): string {
  return relative(root, abs).split(sep).join('/');
}

/** True for root-relative paths outside every content scan. */
function isExcluded(path: string): boolean {
  return path.startsWith('openspec/changes/') || /(^|\/)__fixtures__\//.test(path);
}

/** True when `abs` exists (file or directory). */
async function exists(abs: string): Promise<boolean> {
  return (await stat(abs).catch(() => null)) !== null;
}

/** Recursively yields root-relative paths of the files under `dir` (absolute), skipping {@link SKIP_DIRS}. */
async function* walk(root: string, dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(root, abs);
    } else if (entry.isFile()) {
      yield rel(root, abs);
    }
  }
}

/** Names of the plain files directly inside `dir` (absolute), sorted. */
async function filesIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort();
}

/** Lists the documentation scope (root-relative, sorted, de-duplicated, exclusions applied). */
async function docScope(root: string): Promise<string[]> {
  const files = new Set<string>();
  const addTree = async (dir: string, filter: (path: string) => boolean): Promise<void> => {
    for await (const path of walk(root, join(root, dir))) if (filter(path)) files.add(path);
  };
  await addTree('openspec/specs', (p) => p.endsWith('.md'));
  await addTree('docs', (p) => p.endsWith('.md'));
  await addTree('.github', (p) => p.endsWith('.md'));
  if (await exists(join(root, 'openspec/config.yaml'))) files.add('openspec/config.yaml');
  for (const name of await filesIn(root)) if (name.endsWith('.md')) files.add(name);
  for (const name of await filesIn(join(root, 'plans'))) {
    if (name === 'ROADMAP.md' || /^F.*\.md$/.test(name)) files.add(`plans/${name}`);
  }
  return [...files].filter((p) => !isExcluded(p)).sort();
}

/** Lists the code-remnant scope (root-relative, sorted, exclusions applied). */
async function codeScope(root: string): Promise<string[]> {
  const files = new Set<string>();
  for (const dir of ['apps', 'packages', 'scripts', '.github', '.githooks']) {
    for await (const path of walk(root, join(root, dir))) files.add(path);
  }
  for (const name of await filesIn(root)) {
    if (
      /^Dockerfile/.test(name) ||
      /^compose.*\.yml$/.test(name) ||
      /^docker-.*\.sh$/.test(name) ||
      /^\.env.*\.example$/.test(name) ||
      ['Makefile', 'pnpm-workspace.yaml', 'renovate.json'].includes(name)
    ) {
      files.add(name);
    }
  }
  return [...files]
    .filter((p) => !isExcluded(p) && p !== ALLOWLIST_PATH && !BINARY_EXT_RE.test(p))
    .sort();
}

/** 1-based line of the first line containing `needle` at or after `from` (0-based), else 1. */
function lineOf(lines: string[], needle: string, from = 0): number {
  for (let i = from; i < lines.length; i++) if (lines[i].includes(needle)) return i + 1;
  return 1;
}

/**
 * Loads and validates the allowlist: reports entries without a reason (`allowlist-reason`),
 * globs that match no file (`allowlist-stale`) and an unparsable file (`allowlist-invalid`).
 * A missing file means an empty allowlist.
 */
async function loadAllowlist(root: string, findings: Finding[]): Promise<Allowlist> {
  const empty: Allowlist = { entries: [], retiredCapabilities: {} };
  const raw = await readFile(join(root, ALLOWLIST_PATH), 'utf8').catch(() => null);
  if (raw === null) return empty;
  let parsed: Partial<Allowlist>;
  try {
    parsed = JSON.parse(raw) as Partial<Allowlist>;
  } catch (err) {
    findings.push({
      file: ALLOWLIST_PATH,
      line: 1,
      rule: 'allowlist-invalid',
      detail: (err as Error).message,
    });
    return empty;
  }
  const lines = raw.split('\n');
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  let cursor = 0;
  for (const entry of entries) {
    const glob = typeof entry?.path === 'string' ? entry.path : '';
    const line = lineOf(lines, JSON.stringify(glob), cursor);
    cursor = line;
    if (!glob) {
      findings.push({ file: ALLOWLIST_PATH, line, rule: 'allowlist-invalid', detail: 'no path' });
      continue;
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
      findings.push({
        file: ALLOWLIST_PATH,
        line,
        rule: 'allowlist-reason',
        detail: `entry "${glob}" has no reason; justify the exemption`,
      });
    }
    if (!(await globMatchesAnyFile(root, glob))) {
      findings.push({
        file: ALLOWLIST_PATH,
        line,
        rule: 'allowlist-stale',
        detail: `entry "${glob}" matches no file; remove it`,
      });
    }
  }
  const retired =
    parsed.retiredCapabilities && typeof parsed.retiredCapabilities === 'object'
      ? parsed.retiredCapabilities
      : {};
  for (const [name, by] of Object.entries(retired)) {
    if (typeof by !== 'string' || by.trim() === '') {
      findings.push({
        file: ALLOWLIST_PATH,
        line: lineOf(lines, JSON.stringify(name)),
        rule: 'allowlist-reason',
        detail: `retired capability "${name}" does not name the change that retired it`,
      });
    }
  }
  return {
    entries: entries.filter((e) => typeof e?.path === 'string'),
    retiredCapabilities: retired,
  };
}

/** True when `glob` (root-relative) matches at least one existing file. */
async function globMatchesAnyFile(root: string, glob: string): Promise<boolean> {
  const segments = glob.split('/');
  const firstWild = segments.findIndex((s) => /[*?[{]/.test(s));
  if (firstWild < 0) {
    const info = await stat(join(root, glob)).catch(() => null);
    return info?.isFile() ?? false;
  }
  const base = segments.slice(0, firstWild).join('/');
  for await (const path of walk(root, join(root, base))) {
    if (posix.matchesGlob(path, glob)) return true;
  }
  return false;
}

/** True when an allowlist entry's glob matches `path`. */
function isAllowlisted(allowlist: Allowlist, path: string): boolean {
  return allowlist.entries.some((e) => posix.matchesGlob(path, e.path));
}

/** Pushes one finding per match of each pattern on each line of `text`. */
function scanPatterns(
  path: string,
  text: string,
  patterns: RegExp[],
  rule: string,
  findings: Finding[],
): void {
  text.split('\n').forEach((line, idx) => {
    for (const re of patterns) {
      for (const m of line.matchAll(re)) {
        findings.push({ file: path, line: idx + 1, rule, detail: m[0] });
      }
    }
  });
}

/** Strips inline code spans so links quoted as code are not checked. */
function stripInlineCode(line: string): string {
  return line.replace(/(`+)[^`]*?\1/g, (span) => ' '.repeat(span.length));
}

/** Link targets that are not relative file paths: URLs with a scheme and pure `#anchors`. */
function isExternal(target: string): boolean {
  return target === '' || target.startsWith('#') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(target);
}

/** Reports relative Markdown links in `path` whose target file does not exist. */
async function checkLinks(
  root: string,
  path: string,
  text: string,
  findings: Finding[],
): Promise<void> {
  const lines = text.split('\n');
  let fence: string | null = null;
  for (let idx = 0; idx < lines.length; idx++) {
    const fenceMatch = lines[idx].match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const line = stripInlineCode(lines[idx]);
    const targets: string[] = [];
    for (const m of line.matchAll(/\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]*)(?:\s+"[^"]*")?\s*\)/g)) {
      targets.push(m[1]);
    }
    const reference = line.match(/^\s{0,3}\[([^\]^][^\]]*)\]:\s*(<[^>]*>|\S+)/);
    if (reference) targets.push(reference[2]);
    for (const original of targets) {
      const target = original.replace(/^<|>$/g, '');
      if (isExternal(target)) continue;
      let filePart = target.replace(/[#?].*$/, '');
      try {
        filePart = decodeURIComponent(filePart);
      } catch {
        // Not percent-encoded: keep the raw text.
      }
      if (filePart === '') continue;
      const abs = filePart.startsWith('/')
        ? join(root, filePart)
        : resolve(join(root, dirname(path)), filePart);
      if (!(await exists(abs))) {
        findings.push({ file: path, line: idx + 1, rule: 'link', detail: target });
      }
    }
  }
}

/** Reports Purpose placeholders in `openspec/specs/<capability>/spec.md` files. */
function checkPurpose(path: string, text: string, findings: Finding[]): void {
  if (!/^openspec\/specs\/[^/]+\/spec\.md$/.test(path)) return;
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^##\s+Purpose\b/.test(l));
  if (start < 0) return;
  for (let i = start + 1; i < lines.length && !/^#{1,2}\s/.test(lines[i]); i++) {
    if (PURPOSE_TBD_RE.test(lines[i])) {
      findings.push({
        file: path,
        line: i + 1,
        rule: 'purpose',
        detail: `"${path.split('/')[2]}" still has the archive placeholder Purpose; write the real one`,
      });
    }
  }
}

/** Reports archived capabilities that never reached `openspec/specs` and are not retired. */
async function checkArchivedCapabilities(
  root: string,
  allowlist: Allowlist,
  findings: Finding[],
): Promise<void> {
  const archive = join(root, 'openspec/changes/archive');
  const changes = (await readdir(archive, { withFileTypes: true }).catch(() => []))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const origins = new Map<string, string[]>();
  for (const change of changes) {
    const specs = await readdir(join(archive, change, 'specs'), { withFileTypes: true }).catch(
      () => [],
    );
    for (const cap of specs.filter((e) => e.isDirectory()).map((e) => e.name)) {
      origins.set(cap, [...(origins.get(cap) ?? []), change]);
    }
  }
  for (const [cap, from] of [...origins].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (Object.hasOwn(allowlist.retiredCapabilities, cap)) continue;
    if (await exists(join(root, 'openspec/specs', cap, 'spec.md'))) continue;
    findings.push({
      file: `openspec/changes/archive/${from[0]}/specs/${cap}/spec.md`,
      line: 1,
      rule: 'archived-capability',
      detail:
        `"${cap}" (archived in ${from.join(', ')}) has no openspec/specs/${cap}/spec.md; ` +
        'sync it or list it in retiredCapabilities',
    });
  }
}

/** Runs every rule against `root` and returns the findings sorted by file and line. */
async function check(root: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const allowlist = await loadAllowlist(root, findings);

  for (const path of await docScope(root)) {
    const text = await readFile(join(root, path), 'utf8');
    if (!isAllowlisted(allowlist, path)) {
      scanPatterns(path, text, [TOKEN_RE], 'token', findings);
      scanPatterns(path, text, STALE_IDIOM_RES, 'stale-idiom', findings);
    }
    if (path.endsWith('.md')) await checkLinks(root, path, text, findings);
    checkPurpose(path, text, findings);
  }

  const docs = new Set(await docScope(root));
  for (const path of await codeScope(root)) {
    if (docs.has(path) || isAllowlisted(allowlist, path)) continue;
    const info = await stat(join(root, path));
    if (info.size > MAX_REMNANT_BYTES) continue;
    const buffer = await readFile(join(root, path));
    if (buffer.subarray(0, 8000).includes(0)) continue;
    scanPatterns(
      path,
      buffer.toString('utf8'),
      [TOKEN_RE, ...REMNANT_EXTRA_RES],
      'code-remnant',
      findings,
    );
  }

  await checkArchivedCapabilities(root, allowlist, findings);

  return findings
    .map((f, order) => ({ f, order }))
    .sort((a, b) => {
      if (a.f.file !== b.f.file) return a.f.file < b.f.file ? -1 : 1;
      return a.f.line - b.f.line || a.order - b.order;
    })
    .map(({ f }) => f);
}

/** Parses `--root <dir>` and `--json`. */
function parseArgs(argv: string[]): { root: string; json: boolean } {
  const rootFlag = argv.indexOf('--root');
  const root =
    rootFlag >= 0 && argv[rootFlag + 1]
      ? resolve(argv[rootFlag + 1])
      : resolve(import.meta.dirname, '..');
  return { root, json: argv.includes('--json') };
}

/** CLI entry point: prints the findings and exits 1 when there is any. */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const findings = await check(args.root);
  if (args.json) {
    console.log(
      JSON.stringify({ root: args.root, findingCount: findings.length, findings }, null, 1),
    );
  } else {
    for (const f of findings) console.log(`${f.file}:${f.line}: ${f.rule}: ${f.detail}`);
    console.error(
      findings.length === 0
        ? 'doc-drift-check: no findings'
        : `doc-drift-check: ${findings.length} finding(s); see docs/architecture.md and the doc-drift-check spec`,
    );
  }
  if (findings.length > 0) process.exitCode = 1;
}

await main();
