/**
 * Architecture guard: no `useEffect` in `apps/web/src` may fetch data (`web-data-loading`
 * requirement "A guard prevents new useEffect-based fetching"). Data comes from route loaders,
 * actions and fetcher resource routes; an effect may only call `fetcher.load()` /
 * `revalidator.revalidate()` or do non-fetch work. A pure source scan: every non-test module's
 * `useEffect(...)` callback is checked for `api.`, `*Api.`, `fetch(` or `get*Cached(`, directly
 * or through a function defined in the same module. The only allowlisted module is the session
 * store `contexts/AuthContext.tsx`.
 */
import { describe, expect, it } from 'vitest';
import {
  lineAt,
  listSourceFiles,
  matchBracket,
  readSource,
  stripComments,
} from './test-utils/source-scan.ts';

/** API access inside an effect: the client, a domain client, raw fetch or a static-cache getter. */
const API_ACCESS_RE = /\bapi\s*\.|\b\w+Api\s*\.|(?<![\w$])fetch\s*\(|\bget\w*Cached\s*\(/;

/** Modules allowed to fetch in an effect: only the session bootstrap above the router. */
const ALLOWLIST = new Set(['contexts/AuthContext.tsx']);

/**
 * Collects the bodies of functions declared in a module, by name: `function name(…) {…}`,
 * `const name = (…) => …`, `const name = async (…) => …` and `const name = useCallback(…)`.
 */
function localFunctionBodies(code: string): Map<string, string> {
  const bodies = new Map<string, string>();
  const declRe = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  for (const m of code.matchAll(declRe)) {
    const brace = code.indexOf('{', matchBracket(code, (m.index ?? 0) + m[0].length - 1));
    const end = brace >= 0 ? matchBracket(code, brace) : -1;
    if (end > 0) bodies.set(m[1], code.slice(brace, end));
  }
  const constRe =
    /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(useCallback\s*\(|(?:async\s*)?(?:\(|[A-Za-z_$][\w$]*\s*=>))/g;
  for (const m of code.matchAll(constRe)) {
    const start = (m.index ?? 0) + m[0].length;
    if (m[2].startsWith('useCallback')) {
      const end = matchBracket(code, start - 1);
      if (end > 0) bodies.set(m[1], code.slice(start, end));
      continue;
    }
    const arrow = code.indexOf('=>', start - 1);
    if (arrow < 0) continue;
    let i = arrow + 2;
    while (/\s/.test(code[i] ?? '')) i++;
    if (code[i] === '{' || code[i] === '(') {
      const end = matchBracket(code, i);
      if (end > 0) bodies.set(m[1], code.slice(i, end));
    } else {
      const eol = code.indexOf('\n', i);
      bodies.set(m[1], code.slice(i, eol < 0 ? undefined : eol));
    }
  }
  return bodies;
}

/**
 * Returns the 1-based lines of `useEffect(` calls whose callback accesses the API, directly or
 * through a same-module function it calls.
 */
function findEffectFetches(source: string): number[] {
  const code = stripComments(source);
  const bodies = localFunctionBodies(code);
  const lines: number[] = [];
  for (const m of code.matchAll(/\buseEffect\s*\(/g)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const close = matchBracket(code, open);
    if (close < 0) continue;
    const body = code.slice(open, close);
    let fetches = API_ACCESS_RE.test(body);
    if (!fetches) {
      for (const call of body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
        const fn = bodies.get(call[1]);
        if (fn && API_ACCESS_RE.test(fn)) {
          fetches = true;
          break;
        }
      }
    }
    if (fetches) lines.push(lineAt(code, m.index ?? 0));
  }
  return lines;
}

/**
 * Modules whose effects still fetch while the wave-6 migration is in progress (the 41 effect
 * blocks in 38 files of `audit/_refine/coverage.md` §1.6). Shrink-only: each migration task
 * removes its files, and a listed file whose effects no longer fetch fails the test. Must be
 * empty (and removed) before the change is archived.
 */
const PENDING = new Set<string>(['components/collections/AddToCollectionModal.tsx']);

describe('architecture — useEffect fetch scanner self-check', () => {
  it('flags a direct client call in an effect', () => {
    const source = "useEffect(() => {\n  api.get('/badges').then(setBadges);\n}, []);\n";
    expect(findEffectFetches(source)).toEqual([1]);
  });

  it('flags multi-line chains, domain clients, fetch and cache getters', () => {
    expect(findEffectFetches('useEffect(() => {\n  api\n    .get("/x");\n}, []);')).toEqual([1]);
    expect(findEffectFetches('useEffect(() => { recipeApi.get(id); }, [id]);')).toEqual([1]);
    expect(findEffectFetches('useEffect(() => { fetch("/x"); }, []);')).toEqual([1]);
    expect(findEffectFetches('useEffect(() => { getTasteNotesCached().then(s); }, []);')).toEqual([
      1,
    ]);
  });

  it('flags an effect that calls a local function which fetches', () => {
    const source = [
      'const load = async () => {',
      '  const data = await adminApi.getStats();',
      '  setStats(data);',
      '};',
      'useEffect(() => {',
      '  load();',
      '}, []);',
    ].join('\n');
    expect(findEffectFetches(source)).toEqual([5]);
  });

  it('allows effects that only subscribe to events and trigger a fetcher', () => {
    const source = [
      'useEffect(() => {',
      "  const onFocus = () => fetcher.load('/resources/notifications/unread-count');",
      "  window.addEventListener('focus', onFocus);",
      "  return () => window.removeEventListener('focus', onFocus);",
      '}, [fetcher]);',
      "useEffect(() => { log.debug({}, 'mounted'); }, []);",
    ].join('\n');
    expect(findEffectFetches(source)).toEqual([]);
  });

  it('ignores commented-out client calls', () => {
    expect(findEffectFetches("useEffect(() => {\n  // api.get('/x');\n}, []);")).toEqual([]);
  });
});

describe('architecture — no useEffect-based fetching', () => {
  const findings = listSourceFiles()
    .filter((file) => !ALLOWLIST.has(file))
    .flatMap((file) => findEffectFetches(readSource(file)).map((line) => ({ file, line })));
  const fetchingFiles = new Set(findings.map((f) => f.file));

  it('finds no effect fetching outside the pending migration list', () => {
    const unexpected = findings
      .filter((f) => !PENDING.has(f.file))
      .map((f) => `${f.file}:${f.line} useEffect calls the API client`);
    expect(unexpected).toEqual([]);
  });

  it('lists only files whose effects still fetch (the pending list only shrinks)', () => {
    const stale = [...PENDING].filter((file) => !fetchingFiles.has(file));
    expect(
      stale,
      'These files no longer fetch in an effect: remove them from PENDING in architecture.test.ts',
    ).toEqual([]);
  });

  it('keeps the AuthContext session bootstrap as the only allowlisted effect fetch', () => {
    expect(findEffectFetches(readSource('contexts/AuthContext.tsx')).length).toBeGreaterThan(0);
  });
});
