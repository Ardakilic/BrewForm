/**
 * Pure source-scanning helpers for the web data-loading guards
 * (`architecture.test.ts`, `data-loading.enforcement.test.ts`). They read files with
 * `node:fs`, never touch the network or the DOM, and work on plain text with regular
 * expressions plus a small comment stripper.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';

/** Absolute path of `apps/web/src` (this file lives in `apps/web/src/test-utils`). */
export const WEB_SRC = join(dirname(new URL(import.meta.url).pathname), '..');

/** True for files the guards never scan: tests, the test setup and the test utilities. */
export function isExcludedFromScan(relPath: string): boolean {
  return (
    /\.test\.tsx?$/.test(relPath) ||
    relPath === 'test-setup.ts' ||
    relPath.startsWith('test-utils/') ||
    relPath.includes('/__tests__/')
  );
}

/**
 * Lists every non-test `.ts`/`.tsx` file under `apps/web/src` as a path relative to it,
 * with forward slashes (e.g. `pages/HomePage.tsx`).
 */
export function listSourceFiles(root = WEB_SRC): string[] {
  const entries = readdirSync(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts'))
    .map((e) => relative(root, join(e.parentPath, e.name)).split(sep).join('/'))
    .filter((rel) => !isExcludedFromScan(rel))
    .sort();
}

/** Reads a source file by its path relative to `apps/web/src`. */
export function readSource(relPath: string, root = WEB_SRC): string {
  return readFileSync(join(root, relPath), 'utf8');
}

/**
 * Replaces comments with spaces (newlines kept, so offsets and line numbers are preserved)
 * while leaving string and template literals untouched. Good enough for TS/TSX source; regex
 * literals that contain quotes are rare in this codebase.
 */
export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  let mode: 'code' | 'line' | 'block' | "'" | '"' | '`' = 'code';
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (mode === 'code') {
      if (c === '/' && next === '/') {
        mode = 'line';
        out += '  ';
        i += 2;
        continue;
      }
      if (c === '/' && next === '*') {
        mode = 'block';
        out += '  ';
        i += 2;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') mode = c;
      out += c;
      i++;
      continue;
    }
    if (mode === 'line') {
      if (c === '\n') {
        mode = 'code';
        out += c;
      } else {
        out += ' ';
      }
      i++;
      continue;
    }
    if (mode === 'block') {
      if (c === '*' && next === '/') {
        mode = 'code';
        out += '  ';
        i += 2;
        continue;
      }
      out += c === '\n' ? '\n' : ' ';
      i++;
      continue;
    }
    // Inside a string or template literal.
    if (c === '\\') {
      out += c + (next ?? '');
      i += 2;
      continue;
    }
    if (c === mode) mode = 'code';
    out += c;
    i++;
  }
  return out;
}

/** 1-based line number of a character offset. */
export function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) if (source[i] === '\n') line++;
  return line;
}

/**
 * Returns the index just past the bracket that closes the one at `open` (`(`, `{` or `[`),
 * skipping string and template literals; `-1` when unbalanced.
 */
export function matchBracket(code: string, open: number): number {
  const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']' };
  const stack: string[] = [];
  let quote: string | null = null;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      continue;
    }
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === ')' || c === '}' || c === ']') {
      if (stack.pop() !== c) return -1;
      if (stack.length === 0) return i + 1;
    }
  }
  return -1;
}

/** One import-like statement found in a module. */
export interface ImportStatement {
  /** The raw module specifier, e.g. `../../api/index.ts`. */
  specifier: string;
  /** True for `import type …`/`export type … from` (erased at compile time). */
  typeOnly: boolean;
  /** Named value bindings (type-only names excluded); empty for default/namespace/side-effect. */
  names: string[];
  /** True when the statement binds a default or namespace import (a value import). */
  hasDefaultOrNamespace: boolean;
  /** `static` for `import … from`/`export … from`, `dynamic` for `import()`. */
  kind: 'static' | 'dynamic';
  line: number;
}

/** Splits a `{ a, type B, c as d }` clause into value binding names (type-only ones dropped). */
function parseNamedBindings(clause: string): { names: string[]; hadAny: boolean } {
  const inner = clause.replace(/^\{|\}$/g, '');
  const parts = inner
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const names = parts.filter((p) => !/^type\s+/.test(p)).map((p) => p.split(/\s+as\s+/)[0].trim());
  return { names, hadAny: parts.length > 0 };
}

/**
 * Parses every static `import … from`, side-effect `import '…'`, `export … from` and dynamic
 * `import('…')` statement (multi-line forms included) in comment-stripped source.
 */
export function parseImports(code: string): ImportStatement[] {
  const found: ImportStatement[] = [];
  // The binding clause can span lines but never contains quotes or semicolons, which keeps a
  // side-effect import from swallowing the next statement.
  const importRe = /(^|[;\n])\s*import\s+(type\s+)?([^;'"`]*?)\s*from\s*(['"])([^'"\n]+)\4/g;
  for (const m of code.matchAll(importRe)) {
    const offset = (m.index ?? 0) + m[1].length;
    const typeOnly = Boolean(m[2]);
    const clause = m[3].trim();
    const braceAt = clause.indexOf('{');
    const head = (braceAt >= 0 ? clause.slice(0, braceAt) : clause).replace(/,\s*$/, '').trim();
    const named =
      braceAt >= 0 ? parseNamedBindings(clause.slice(braceAt)) : { names: [], hadAny: false };
    found.push({
      specifier: m[5],
      typeOnly: typeOnly || (head === '' && named.hadAny && named.names.length === 0),
      names: named.names,
      hasDefaultOrNamespace: head !== '',
      kind: 'static',
      line: lineAt(
        code,
        offset + (code.slice(offset).length - code.slice(offset).trimStart().length),
      ),
    });
  }
  const sideEffectRe = /(^|[;\n])\s*import\s*(['"])([^'"\n]+)\2/g;
  for (const m of code.matchAll(sideEffectRe)) {
    const offset = (m.index ?? 0) + m[1].length;
    found.push({
      specifier: m[3],
      typeOnly: false,
      names: [],
      hasDefaultOrNamespace: true,
      kind: 'static',
      line: lineAt(
        code,
        offset + (code.slice(offset).length - code.slice(offset).trimStart().length),
      ),
    });
  }
  const exportFromRe =
    /(^|[;\n])\s*export\s+(type\s+)?(\*(?:\s+as\s+\w+)?|\{[\s\S]*?\})\s*from\s*(['"])([^'"\n]+)\4/g;
  for (const m of code.matchAll(exportFromRe)) {
    const offset = (m.index ?? 0) + m[1].length;
    const star = m[3].startsWith('*');
    const named = star ? { names: [], hadAny: false } : parseNamedBindings(m[3]);
    found.push({
      specifier: m[5],
      typeOnly: Boolean(m[2]) || (!star && named.hadAny && named.names.length === 0),
      names: named.names,
      hasDefaultOrNamespace: star,
      kind: 'static',
      line: lineAt(
        code,
        offset + (code.slice(offset).length - code.slice(offset).trimStart().length),
      ),
    });
  }
  const dynamicRe = /\bimport\(\s*(['"`])([^'"`\n]+)\1\s*\)/g;
  for (const m of code.matchAll(dynamicRe)) {
    found.push({
      specifier: m[2],
      typeOnly: false,
      names: [],
      hasDefaultOrNamespace: true,
      kind: 'dynamic',
      line: lineAt(code, m.index ?? 0),
    });
  }
  return found.sort((a, b) => a.line - b.line);
}

/**
 * Resolves a module specifier imported by `fromRel` (a path relative to `apps/web/src`) to a
 * path relative to `apps/web/src`: relative specifiers and the `@/` alias resolve; package
 * specifiers return `null`. A missing `.ts` extension is added (`../api/index` → `api/index.ts`).
 */
export function resolveSpecifier(fromRel: string, specifier: string): string | null {
  let resolved: string;
  if (specifier.startsWith('@/')) {
    resolved = posix.normalize(specifier.slice(2));
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    resolved = posix.normalize(posix.join(posix.dirname(fromRel), specifier));
  } else {
    return null;
  }
  if (!/\.(tsx?|jsx?|json|css)$/.test(resolved)) resolved += '.ts';
  return resolved;
}
