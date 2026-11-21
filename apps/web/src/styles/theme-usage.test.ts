/**
 * Usage guard for theme colours.
 *
 * Feature: wave-6-review-remediation (E6, web-shared-components → "Theme text
 * tokens meet WCAG AA on the surfaces they are drawn on")
 *
 * Scans every production `.tsx` file under `apps/web/src` and fails on:
 * 1. a `white`, `black`, `#fff`, `#ffffff`, `#000` or `#000000` string literal,
 *    or a `text-white`/`text-black` class: text on an accent or status fill uses
 *    `var(--bg-primary)`, which `utils/chart/contrast.test.ts` checks per theme;
 * 2. a single `style={{ … }}` object, class string or class array
 *    (`[ … ].join(' ')`) that sets a `--bg-tertiary` background together with a
 *    `--text-tertiary` text colour: `--text-tertiary` is allowed only on page and
 *    card surfaces, and `--text-secondary` is the lowest text level on raised
 *    ones.
 *
 * A child inside a raised container cannot be found by a scan; the AGENTS.md
 * "Theme colours" rule covers that case. Like the other source scans, this file
 * uses Node APIs and is listed in `apps/web/tsconfig.json` → `exclude`.
 */
import { describe, expect, it } from 'vitest';
import {
  lineAt,
  listSourceFiles,
  matchBracket,
  readSource,
  stripComments,
} from '../test-utils/source-scan.ts';

const COLOUR_LITERAL = /(['"`])(?:white|black|#fff|#ffffff|#000|#000000)\1/gi;
const WHITE_BLACK_CLASS = /(?<![\w:-])text-(?:white|black)(?![\w-])/g;

const STYLE_TERTIARY_BG = /\b(?:background|backgroundColor)\s*:\s*['"`][^'"`]*var\(--bg-tertiary\)/;
const STYLE_TERTIARY_TEXT = /(?<![\w$])color\s*:\s*['"`]var\(--text-tertiary\)/;
// Un-prefixed classes only: `hover:`/`placeholder:` variants are not the resting colours.
const CLASS_TERTIARY_BG = /(?<![\w:-])bg-\[(?:color:)?var\(--bg-tertiary\)\]/;
const CLASS_TERTIARY_TEXT = /(?<![\w:-])text-\[(?:color:)?var\(--text-tertiary\)\]/;

/** One piece of source checked as a whole: a style object, a string literal or a class array. */
interface Unit {
  text: string;
  offset: number;
}

/** Every `'…'`, `"…"` and `` `…` `` literal in comment-stripped source, in order. */
function stringLiterals(code: string): Unit[] {
  const out: Unit[] = [];
  for (let i = 0; i < code.length; i++) {
    const quote = code[i];
    if (quote !== "'" && quote !== '"' && quote !== '`') continue;
    let end = i + 1;
    while (end < code.length && code[end] !== quote) {
      if (code[end] === '\\') end++;
      else if (code[end] === '\n' && quote !== '`') break;
      end++;
    }
    out.push({ text: code.slice(i, end + 1), offset: i });
    i = end;
  }
  return out;
}

/** Every `style={{ … }}` object literal. */
function styleObjects(code: string): Unit[] {
  const out: Unit[] = [];
  for (const match of code.matchAll(/style=\{\{/g)) {
    const open = (match.index ?? 0) + 'style={'.length;
    const close = matchBracket(code, open);
    if (close > 0) out.push({ text: code.slice(open, close), offset: open });
  }
  return out;
}

/** Every array literal of strings that is joined into a class string (`[ … ].join(`). */
function classArrays(code: string): Unit[] {
  const out: Unit[] = [];
  for (const match of code.matchAll(/\[\s*['"`]/g)) {
    const open = match.index ?? 0;
    const close = matchBracket(code, open);
    if (close > 0 && /^\s*\.join\(/.test(code.slice(close))) {
      out.push({ text: code.slice(open, close), offset: open });
    }
  }
  return out;
}

/** Lists the theme-usage violations in one source file, as `line N: reason` strings. */
function findThemeViolations(source: string): string[] {
  const code = stripComments(source);
  const violations: string[] = [];
  for (const pattern of [COLOUR_LITERAL, WHITE_BLACK_CLASS]) {
    for (const match of code.matchAll(pattern)) {
      violations.push(`line ${lineAt(code, match.index ?? 0)}: colour literal ${match[0]}`);
    }
  }
  const units = [...styleObjects(code), ...stringLiterals(code), ...classArrays(code)];
  for (const unit of units) {
    const tertiaryBg = STYLE_TERTIARY_BG.test(unit.text) || CLASS_TERTIARY_BG.test(unit.text);
    const tertiaryText = STYLE_TERTIARY_TEXT.test(unit.text) || CLASS_TERTIARY_TEXT.test(unit.text);
    if (tertiaryBg && tertiaryText) {
      violations.push(
        `line ${lineAt(code, unit.offset)}: --text-tertiary text on a --bg-tertiary background`,
      );
    }
  }
  return [...new Set(violations)];
}

describe('theme usage guard — detector self-test', () => {
  it('flags white and black literals and classes', () => {
    expect(findThemeViolations("<p style={{ color: 'white' }} />")).toHaveLength(1);
    expect(findThemeViolations("const c = { color: '#FFF' };")).toHaveLength(1);
    expect(findThemeViolations("const c = { color: '#000000' };")).toHaveLength(1);
    expect(findThemeViolations('<p className="px-1 text-white" />')).toHaveLength(1);
    expect(findThemeViolations("const cls = 'text-black font-bold';")).toHaveLength(1);
  });

  it('accepts tokens, other words and literals in comments', () => {
    expect(findThemeViolations("<p style={{ color: 'var(--bg-primary)' }} />")).toEqual([]);
    expect(findThemeViolations("<p style={{ whiteSpace: 'nowrap' }} />")).toEqual([]);
    expect(findThemeViolations('<p className="text-[color:var(--bg-primary)]" />')).toEqual([]);
    expect(findThemeViolations("// was color: 'white'\nconst a = 1;")).toEqual([]);
  });

  it('flags tertiary text on a tertiary background in one style object, class string or array', () => {
    expect(
      findThemeViolations(
        "<p style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }} />",
      ),
    ).toHaveLength(1);
    expect(
      findThemeViolations(
        '<p className="rounded bg-[color:var(--bg-tertiary)] text-[color:var(--text-tertiary)]" />',
      ),
    ).toHaveLength(1);
    expect(
      findThemeViolations(
        `<p className={\`p-2 bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] \${x}\`} />`,
      ),
    ).toHaveLength(1);
    expect(
      findThemeViolations(
        "<p className={['p-2', 'bg-[color:var(--bg-tertiary)]', 'text-[color:var(--text-tertiary)]'].join(' ')} />",
      ),
    ).toHaveLength(1);
  });

  it('accepts the allowed combinations', () => {
    expect(
      findThemeViolations(
        "<p style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }} />",
      ),
    ).toEqual([]);
    expect(
      findThemeViolations(
        "<p style={{ background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }} />",
      ),
    ).toEqual([]);
    expect(
      findThemeViolations(
        '<p className="hover:bg-[color:var(--bg-tertiary)] placeholder:text-[color:var(--text-tertiary)]" />',
      ),
    ).toEqual([]);
    // Separate elements: a tertiary-text child inside a raised parent is not visible to a scan.
    expect(
      findThemeViolations(
        '<div className="bg-[color:var(--bg-tertiary)]"><span className="text-[color:var(--text-tertiary)]" /></div>',
      ),
    ).toEqual([]);
  });
});

describe('theme usage guard — production sources', () => {
  const files = listSourceFiles().filter((file) => file.endsWith('.tsx'));

  it('scans the production .tsx files', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain('components/catalog/TypeBadge.tsx');
  });

  it.each(files)('%s uses theme tokens for text on fills and raised surfaces', (file) => {
    expect(findThemeViolations(readSource(file))).toEqual([]);
  });
});
