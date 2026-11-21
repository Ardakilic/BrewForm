/**
 * Static enforcement of the web data-loading standard (`web-data-loading` requirement "A
 * static enforcement test keeps API access inside loaders, actions and resource routes").
 * A pure source scan: no network, no DOM. Rules:
 *
 * 1. API client imports — value imports of `api/client.ts`, `api/index.ts` or
 *    `api/static-cache.ts` only in `api/**`, `*.data.ts`, `routes/**`,
 *    `contexts/AuthContext.tsx`, and `hooks/useStaticCacheSync.ts` (only `CACHE_BUST_KEY`
 *    and `clearStaticCache`). `import type` is allowed everywhere; `api/errors.ts` is free.
 * 2. Direct network calls — `fetch(`, `XMLHttpRequest`, `new EventSource(`,
 *    `navigator.sendBeacon(` only in `api/**`.
 * 3. Loader and action placement — no `.tsx` outside `routes/` exports `loader`/`action`.
 * 4. Data-module imports — value imports of a `*.data.ts` module only in `router.tsx`,
 *    `routes/**` and other `*.data.ts` modules.
 */
import { describe, expect, it } from 'vitest';
import {
  listSourceFiles,
  parseImports,
  readSource,
  resolveSpecifier,
  stripComments,
} from './test-utils/source-scan.ts';

type Rule =
  | 'API client imports'
  | 'Direct network calls'
  | 'Loader and action placement'
  | 'Data-module imports';

/** One rule violation, reported as `<relative path>:<line> <rule>`. */
interface Violation {
  file: string;
  line: number;
  rule: Rule;
}

const RESTRICTED_CLIENT_MODULES = new Set(['api/client.ts', 'api/index.ts', 'api/static-cache.ts']);
const STATIC_CACHE_SYNC_NAMES = new Set(['CACHE_BUST_KEY', 'clearStaticCache']);

/** True when `file` may value-import the API client modules (rule 1). */
function mayImportClient(file: string): boolean {
  return (
    file.startsWith('api/') ||
    file.endsWith('.data.ts') ||
    file.startsWith('routes/') ||
    file === 'contexts/AuthContext.tsx'
  );
}

/** True when `file` may value-import a `*.data.ts` module (rule 4). */
function mayImportDataModule(file: string): boolean {
  return file === 'router.tsx' || file.startsWith('routes/') || file.endsWith('.data.ts');
}

const NETWORK_CALL_RE =
  /(?<![\w$])fetch\s*\(|\bXMLHttpRequest\b|\bnew\s+EventSource\s*\(|\bnavigator\.sendBeacon\s*\(/g;
const LOADER_EXPORT_RE =
  /\bexport\s+(?:const\s+(?:loader|action)\b|(?:async\s+)?function\s+(?:loader|action)\b)/g;

/** Applies the four rules to one module's source and returns its violations. */
function checkModule(file: string, source: string): Violation[] {
  const code = stripComments(source);
  const violations: Violation[] = [];
  const lineOf = (offset: number) => code.slice(0, offset).split('\n').length;

  for (const stmt of parseImports(code)) {
    if (stmt.typeOnly) continue;
    const target = resolveSpecifier(file, stmt.specifier);
    if (!target) continue;
    if (RESTRICTED_CLIENT_MODULES.has(target) && !mayImportClient(file)) {
      const staticCacheSyncException =
        file === 'hooks/useStaticCacheSync.ts' &&
        target === 'api/static-cache.ts' &&
        stmt.kind === 'static' &&
        !stmt.hasDefaultOrNamespace &&
        stmt.names.length > 0 &&
        stmt.names.every((n) => STATIC_CACHE_SYNC_NAMES.has(n));
      if (!staticCacheSyncException) {
        violations.push({ file, line: stmt.line, rule: 'API client imports' });
      }
    }
    if (target.endsWith('.data.ts') && !mayImportDataModule(file)) {
      violations.push({ file, line: stmt.line, rule: 'Data-module imports' });
    }
  }

  if (!file.startsWith('api/')) {
    for (const m of code.matchAll(NETWORK_CALL_RE)) {
      violations.push({ file, line: lineOf(m.index ?? 0), rule: 'Direct network calls' });
    }
  }

  if (file.endsWith('.tsx') && !file.startsWith('routes/')) {
    for (const m of code.matchAll(LOADER_EXPORT_RE)) {
      violations.push({ file, line: lineOf(m.index ?? 0), rule: 'Loader and action placement' });
    }
  }

  return violations;
}

/** Formats a violation as `<relative path>:<line> <rule>`. */
function format(v: Violation): string {
  return `${v.file}:${v.line} ${v.rule}`;
}

/**
 * Modules that still violate a rule while the wave-6 migration is in progress (the 65-module
 * inventory of `audit/_refine/coverage.md` §1.6). Shrink-only: each migration task
 * removes its files, and a listed file that no longer violates fails the test. Must be empty
 * (and removed) before the change is archived.
 */
const PENDING = new Set<string>([]);

describe('data-loading enforcement — self-check', () => {
  const rulesOf = (file: string, source: string) => checkModule(file, source).map((v) => v.rule);

  it('flags a value import of ../../api/index.ts from a component', () => {
    expect(
      rulesOf(
        'components/recipe/LikeButton.tsx',
        "import { recipeApi } from '../../api/index.ts';\n",
      ),
    ).toEqual(['API client imports']);
  });

  it('flags a multi-line value import', () => {
    const source = "import {\n  adminApi,\n  type AdminUser,\n} from '../../api/index.ts';\n";
    expect(checkModule('pages/admin/X.tsx', source)).toEqual([
      { file: 'pages/admin/X.tsx', line: 1, rule: 'API client imports' },
    ]);
  });

  it('flags a dynamic import of the client', () => {
    expect(rulesOf('pages/X.tsx', "const m = await import('../api/client.ts');\n")).toEqual([
      'API client imports',
    ]);
  });

  it('flags export … from the client and the @/ alias', () => {
    expect(rulesOf('utils/x.ts', "export { api } from '../api/client.ts';\n")).toEqual([
      'API client imports',
    ]);
    expect(rulesOf('utils/y.ts', "import { api } from '@/api/index.ts';\n")).toEqual([
      'API client imports',
    ]);
  });

  it('flags fetch( in a component and reports its line', () => {
    const source =
      "const a = 1;\nfunction onClick() {\n  fetch('/api/v1/qrcode/recipe/x.svg');\n}\n";
    expect(checkModule('components/qrcode/X.tsx', source)).toEqual([
      { file: 'components/qrcode/X.tsx', line: 3, rule: 'Direct network calls' },
    ]);
  });

  it('flags XMLHttpRequest, EventSource and sendBeacon outside api/', () => {
    const source =
      'new XMLHttpRequest();\nnew EventSource("/s");\nnavigator.sendBeacon("/b", "x");\n';
    expect(rulesOf('utils/net.ts', source)).toEqual([
      'Direct network calls',
      'Direct network calls',
      'Direct network calls',
    ]);
  });

  it('flags an inline export const loader in a page', () => {
    expect(rulesOf('pages/HomePage.tsx', 'export const loader = async () => null;\n')).toEqual([
      'Loader and action placement',
    ]);
    expect(rulesOf('pages/X.tsx', 'export async function action() {}\n')).toEqual([
      'Loader and action placement',
    ]);
  });

  it('flags a value import of a data module from a component', () => {
    expect(rulesOf('pages/X.tsx', "import { loader } from './X.data.ts';\n")).toEqual([
      'Data-module imports',
    ]);
  });

  it('accepts type-only imports, api/errors.ts and the useStaticCacheSync exception', () => {
    expect(
      rulesOf('pages/X.tsx', "import type { AdminUser } from '../../api/index.ts';\n"),
    ).toEqual([]);
    expect(
      rulesOf('pages/X.tsx', "import { type AdminUser } from '../../api/index.ts';\n"),
    ).toEqual([]);
    expect(rulesOf('pages/X.tsx', "import type { loader } from './X.data.ts';\n")).toEqual([]);
    expect(rulesOf('pages/X.tsx', "import { ApiError } from '../../api/errors.ts';\n")).toEqual([]);
    expect(
      rulesOf(
        'hooks/useStaticCacheSync.ts',
        "import { CACHE_BUST_KEY, clearStaticCache } from '../api/static-cache.ts';\n",
      ),
    ).toEqual([]);
    expect(
      rulesOf(
        'hooks/useStaticCacheSync.ts',
        "import { CACHE_BUST_KEY, invalidateStaticCache } from '../api/static-cache.ts';\n",
      ),
    ).toEqual(['API client imports']);
  });

  it('accepts the data layer: api/**, *.data.ts, routes/** and AuthContext', () => {
    const imp = "import { api } from '../../api/index.ts';\nfetch('/x');\n";
    expect(rulesOf('api/static-cache.ts', imp)).toEqual([]);
    expect(rulesOf('pages/admin/AdminUsersPage.data.ts', imp)).toEqual(['Direct network calls']);
    expect(rulesOf('routes/resources/x.ts', imp)).toEqual(['Direct network calls']);
    expect(
      rulesOf('contexts/AuthContext.tsx', "import { userApi } from '../api/index.ts';\n"),
    ).toEqual([]);
    expect(rulesOf('router.tsx', "import { loader } from './pages/X.data.ts';\n")).toEqual([]);
  });

  it('ignores commented-out code and identifiers like refetch( or useFetcher(', () => {
    const source =
      "// import { api } from '../api/index.ts';\n/* fetch('/x') */\nrefetch();\nuseFetcher();\n";
    expect(rulesOf('components/X.tsx', source)).toEqual([]);
  });
});

describe('data-loading enforcement — repository scan', () => {
  const files = listSourceFiles();
  const violations = files.flatMap((file) => checkModule(file, readSource(file)));
  const violatingFiles = new Set(violations.map((v) => v.file));

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('router.tsx');
  });

  it('has no violations outside the pending migration list', () => {
    const unexpected = violations.filter((v) => !PENDING.has(v.file)).map(format);
    expect(unexpected).toEqual([]);
  });

  it('lists only files that still violate (the pending list only shrinks)', () => {
    const stale = [...PENDING].filter((file) => !violatingFiles.has(file));
    expect(
      stale,
      'These files no longer violate any rule: remove them from PENDING in data-loading.enforcement.test.ts',
    ).toEqual([]);
  });
});
