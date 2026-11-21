/**
 * Static enforcement test for capability `unique-identifiers`, "Email and username lookups are
 * case-insensitive". No database: it reads the source files and fails at the exact `file:line`
 * when an identifier lookup lowers only the column side.
 *
 * Scope: every non-test `apps/api/src/modules/**\/model.ts` plus `packages/db/src/seed.ts`.
 *
 * Rule: every `eq(lower(<column>), <value>)` must wrap its value in `lower(...)`, and every
 * `inArray(lower(<column>), <values>)` must pass `lower(...)` or `<list>.map((v) => lower(v))`,
 * so the database lowers both sides with the same rules as the `_lower_unique` expression
 * indexes (JavaScript `toLowerCase()` and PostgreSQL `lower()` disagree on some locales:
 * `lower('I')` is `ı` under `tr_TR`). A lookup call that contains `.toLowerCase()` is also
 * rejected. Calls are parsed with balanced parentheses, so a call split over several lines is
 * checked as one. Matches on comment lines (starting with `*`, `/*` or `//`) are ignored.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** `apps/api/src/modules`, resolved from this file's directory. */
const MODULES_DIR = join(import.meta.dirname, '..');

/** The repository root. */
const REPO_ROOT = join(MODULES_DIR, '..', '..', '..', '..');

/** The seed, which looks up its accounts by email and username. */
const SEED_FILE = join(REPO_ROOT, 'packages', 'db', 'src', 'seed.ts');

/** Start of an identifier lookup whose column side is lowered. */
const LOOKUP_START = /\b(eq|inArray)\(\s*lower\(/g;

/** A value list lowered element by element: `<list>.map((v) => lower(v))`. */
const LOWERED_MAP = /^[\w.]+\.map\(\(?\s*(\w+)\s*\)?\s*=>\s*lower\(\s*\1\s*\)\s*\)$/s;

/** Every `model.ts` under `dir`, recursively. */
function findModelFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return findModelFiles(path);
    return entry.name === 'model.ts' ? [path] : [];
  });
}

/**
 * The text between the parenthesis at `open` and its matching closing parenthesis, or `null`
 * when the parentheses never balance.
 */
function balancedArguments(source: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

/** Split call arguments at the first top-level comma into the column and the value side. */
function splitFirstArgument(args: string): { column: string; value: string } {
  let depth = 0;
  for (let i = 0; i < args.length; i++) {
    const char = args[i];
    if (char === '(' || char === '[' || char === '{') depth++;
    else if (char === ')' || char === ']' || char === '}') depth--;
    else if (char === ',' && depth === 0) {
      return {
        column: args.slice(0, i).trim(),
        value: args
          .slice(i + 1)
          .trim()
          .replace(/,$/, '')
          .trim(),
      };
    }
  }
  return { column: args.trim(), value: '' };
}

/** Whether the value side of a lookup is lowered by the database. */
function isLoweredValue(operator: string, value: string): boolean {
  if (/^lower\(/.test(value)) return true;
  return operator === 'inArray' && LOWERED_MAP.test(value);
}

/**
 * Every lookup in `source` that lowers only the column side, as `<label>:<line> <call>`.
 *
 * @param source - The file contents.
 * @param label - The file name used in the report.
 */
function findUnloweredLookups(source: string, label: string): string[] {
  const violations: string[] = [];
  const lines = source.split('\n');
  for (const match of source.matchAll(LOOKUP_START)) {
    const lineNumber = source.slice(0, match.index).split('\n').length;
    const lineText = lines[lineNumber - 1].trim();
    if (lineText.startsWith('*') || lineText.startsWith('/*') || lineText.startsWith('//')) {
      continue;
    }
    const operator = match[1];
    const open = match.index + operator.length;
    const args = balancedArguments(source, open);
    const call = `${operator}(${(args ?? '').replace(/\s+/g, ' ').trim()})`;
    if (args === null) {
      violations.push(`${label}:${lineNumber} unbalanced ${operator}(lower(...) call`);
      continue;
    }
    const { value } = splitFirstArgument(args);
    if (!isLoweredValue(operator, value) || args.includes('.toLowerCase()')) {
      violations.push(`${label}:${lineNumber} ${call}`);
    }
  }
  return violations;
}

describe('identifier lookups lower both sides (unique-identifiers)', () => {
  it('finds no lookup whose value side is not lowered in SQL', () => {
    const files = [...findModelFiles(MODULES_DIR), SEED_FILE];
    expect(files.length).toBeGreaterThan(10);
    const violations = files.flatMap((file) =>
      findUnloweredLookups(readFileSync(file, 'utf8'), relative(REPO_ROOT, file)),
    );
    expect(violations).toEqual([]);
  });
});

describe('findUnloweredLookups (self-test)', () => {
  it('flags a JavaScript-lowered or unlowered value', () => {
    const source = [
      'const a = eq(lower(users.email), email.toLowerCase());',
      'const b = eq(lower(users.username), username);',
      'const c = inArray(lower(users.username), usernames);',
      'const d = inArray(',
      '  lower(users.username),',
      '  usernames.map((u) => u.toLowerCase()),',
      ');',
    ].join('\n');
    expect(findUnloweredLookups(source, 'f.ts')).toEqual([
      'f.ts:1 eq(lower(users.email), email.toLowerCase())',
      'f.ts:2 eq(lower(users.username), username)',
      'f.ts:3 inArray(lower(users.username), usernames)',
      'f.ts:4 inArray(lower(users.username), usernames.map((u) => u.toLowerCase()),)',
    ]);
  });

  it('accepts lookups lowered on both sides, across lines, and ignores comments', () => {
    const source = [
      ' * `eq(lower(col), value.toLowerCase())` in an old docblock',
      '// eq(lower(users.email), email)',
      'const a = eq(lower(users.email), lower(email));',
      'const b = inArray(',
      '  lower(users.username),',
      '  usernames.map((u) => lower(u)),',
      ');',
      'const c = and(eq(lower(users.username), lower(username)), isNull(users.deletedAt));',
    ].join('\n');
    expect(findUnloweredLookups(source, 'f.ts')).toEqual([]);
  });
});
