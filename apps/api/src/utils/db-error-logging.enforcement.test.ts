/**
 * Static enforcement test for capability `error-handling`, "Database error logs never contain
 * query parameters or row values" (D99.65). No database: it reads the source files of every
 * module whose catches can see a database error and fails at the exact `file:line` when a log
 * call passes a raw `err`.
 *
 * The rule: a `log`/`logger` `.trace|debug|info|warn|error|fatal(` call whose first argument is an
 * object literal must not pass `err` raw: neither the shorthand `{ err }` / `{ err, … }` /
 * `{ …, err }` (also across line breaks) nor `err: <anything but a sanitiser call>`. The accepted
 * sanitisers are `toLoggableError(…)` (database errors keep their SQLSTATE, table and SQL text
 * without parameters) and `toLoggableMailError(…)` (email sends, which may also see a database
 * error). drizzle-orm 0.45 puts the bound parameters in the error message and `params`, and pino's
 * error serializer copies both, so a raw `err` can log emails, password hashes and note text.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** `apps/api/src`, resolved from this file's directory. */
const SRC_DIR = join(import.meta.dirname, '..');

/**
 * Files whose catches can see a database error, each with the reason it is in scope. Every log
 * call in these files passes errors through a sanitiser, so the rule holds file-wide.
 */
const SCANNED_FILES: Record<string, string> = {
  'modules/notification/service.ts':
    'every catch wraps a model call or a notify* helper whose recipient lookup queries the database',
  'modules/comment/service.ts':
    'the notification and badge side effects of createComment write and read the database',
  'modules/recipe/service.ts':
    'the follower, badge and like side effects plus mergeRecipes and diffVersions run queries',
  'modules/follow/service.ts': 'the follow notification and badge side effects run queries',
  'modules/badge/service.ts': 'evaluateAllBadges catches a per-user badge evaluation query',
  'modules/collection/service.ts': 'listAllPublicCollections catches its listing query',
  'modules/brew-log/service.ts': 'the four brew-log catches wrap model calls',
  'modules/admin/service.ts': 'the FLUSH_CACHE audit-log insert can fail',
  'middleware/auth.ts': 'the token-verification catch also wraps the user lookup',
  'middleware/crawler.ts': 'the recipe metadata lookup queries the database',
  'utils/jobs/cron.ts': 'the hourly badge job runs queries',
  'setup.ts': 'a failed admin insert carries the email and the password hash',
};

/** A log call that passes a raw `err`. */
export interface RawErrLog {
  /** 1-based line of the log call. */
  line: number;
  /** The log call's first line, trimmed. */
  text: string;
}

/** Start of a log call whose first argument is an object literal (`{` is the last character). */
const LOG_CALL = /\b(?:log|logger)\.(?:trace|debug|info|warn|error|fatal)\(\s*\{/g;

/** A sanitised `err` value. */
const SANITISED = /^(?:toLoggableError|toLoggableMailError)\(/;

/**
 * Split the object literal that opens at `source[open] === '{'` into its top-level property
 * segments (nested brackets and string literals are skipped).
 *
 * @param source - The file text.
 * @param open - Index of the opening `{`.
 * @returns The trimmed top-level segments, or `null` when the literal is not closed.
 */
function topLevelProperties(source: string, open: number): string[] | null {
  const segments: string[] = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open + 1; i < source.length; i++) {
    const ch = source[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const close = source.indexOf(ch, i + 1);
      if (close === -1) return null;
      i = close;
    } else if (ch === '{' || ch === '(' || ch === '[') {
      depth++;
    } else if (ch === ')' || ch === ']') {
      depth--;
    } else if (ch === '}') {
      if (depth === 0) {
        segments.push(source.slice(start, i).trim());
        return segments.filter((segment) => segment !== '');
      }
      depth--;
    } else if (ch === ',' && depth === 0) {
      segments.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  return null;
}

/**
 * Report every `log`/`logger` call in `source` whose object argument passes `err` raw (see the
 * module docblock for the rule).
 *
 * @param source - TypeScript source text.
 * @returns The offending calls, in source order.
 */
export function findRawErrLogs(source: string): RawErrLog[] {
  const findings: RawErrLog[] = [];
  for (const match of source.matchAll(LOG_CALL)) {
    const open = match.index + match[0].length - 1;
    const properties = topLevelProperties(source, open) ?? [];
    const raw = properties.some((property) => {
      if (property === 'err') return true;
      const value = /^err\s*:\s*([\s\S]*)$/.exec(property)?.[1];
      return value !== undefined && !SANITISED.test(value);
    });
    if (raw) {
      const line = source.slice(0, match.index).split('\n').length;
      findings.push({ line, text: source.split('\n')[line - 1].trim() });
    }
  }
  return findings;
}

describe('findRawErrLogs', () => {
  it('reports the shorthand forms, also across line breaks', () => {
    const source = [
      "logger.error({ err }, 'a');",
      "log.warn({ slug, err }, 'b');",
      'logger.error(',
      '  { err, commentId },',
      "  'c',",
      ');',
      "logger.info({ err: err, id }, 'd');",
    ].join('\n');
    expect(findRawErrLogs(source).map((finding) => finding.line)).toEqual([1, 2, 3, 7]);
  });

  it('accepts sanitised errors and calls without err', () => {
    const source = [
      "logger.error({ err: toLoggableError(err), id }, 'a');",
      "logger.warn({ err: toLoggableMailError(err) }, 'b');",
      "log.debug({ errors: 2, error: 'x' }, 'c');",
      "logger.info({ meta: { err } }, 'd');",
      "logger.error('plain message');",
    ].join('\n');
    expect(findRawErrLogs(source)).toEqual([]);
  });
});

describe('database error logging enforcement (D99.65)', () => {
  it.each(Object.entries(SCANNED_FILES))('%s logs no raw err (%s)', (file) => {
    const findings = findRawErrLogs(readFileSync(join(SRC_DIR, file), 'utf8')).map(
      (finding) => `${file}:${finding.line} ${finding.text}`,
    );
    expect(findings).toEqual([]);
  });
});
