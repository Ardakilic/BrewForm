/**
 * Regression guard: no untranslated UI attributes in production TSX. Walks
 * apps/web/src/**\/*.tsx (excluding tests) once and scans each whole file, so a value Biome wraps
 * onto the next line is still seen. A `placeholder`, `aria-label`, `alt` or `title` attribute is
 * a violation when its value carries text (two consecutive Unicode letters):
 *
 * - a quoted value in either quote style (`title="…"`, `title='…'`; Biome writes JSX attributes
 *   in double quotes);
 * - a string-literal expression (`title={'…'}`, `title={"…"}`);
 * - a template literal whose static text, with every `${…}` interpolation removed, still holds
 *   text. A `t()` call inside a template does not exempt its static text.
 *
 * Allowlist rationale (only these two placeholders):
 * - `you@example.com` / `coffee_lover`: D40 — locale-neutral EXAMPLE values,
 *   not prose (recorded at RegisterPage.tsx).
 *
 * The `scanSource` fixtures below check the matcher itself, so a broken pattern cannot silently
 * match nothing again (the first version matched only single-quoted values and never fired).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Vitest runs under vitest with cwd = apps/web.
const SRC_ROOT = `${process.cwd()}/src`;

/** Recursively collect .tsx files, skipping tests and node_modules. */
function collectTsxFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      results.push(...collectTsxFiles(full));
    } else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Allowlisted literal placeholder values — D40 locale-neutral example values
 * that are deliberately NOT translated (they are format examples, not prose).
 */
const ALLOWED_PLACEHOLDERS = new Set(['you@example.com', 'coffee_lover']);

/** A guarded attribute name, not part of a longer name (`data-title`, `subtitle`). */
const ATTR = String.raw`(?<![\w-])(placeholder|aria-label|alt|title)`;
/** `attr="…"` or `attr='…'`. */
const QUOTED_RE = new RegExp(`${ATTR}=(?:"([^"]*)"|'([^']*)')`, 'g');
/** `attr={'…'}` or `attr={"…"}`. */
const EXPR_LITERAL_RE = new RegExp(`${ATTR}=\\{\\s*(?:'([^']*)'|"([^"]*)")\\s*\\}`, 'g');
/** `attr={`…`}`, also when the template is wrapped onto the next line. */
const TEMPLATE_RE = new RegExp(`${ATTR}=\\{\\s*\`([^\`]*)\`\\s*\\}`, 'g');
/** Text: two consecutive letters in any script (a lone version letter such as `v${n}` passes). */
const LETTERS_RE = /\p{L}{2,}/u;

/** One untranslated attribute: its 1-based line and the matched source. */
export interface LiteralViolation {
  line: number;
  text: string;
}

/**
 * Static text of a template literal body: every `${…}` interpolation removed, counting brace
 * depth so an object literal or a nested call inside the interpolation is removed whole.
 */
export function templateStaticText(body: string): string {
  let out = '';
  let i = 0;
  while (i < body.length) {
    if (body.startsWith('${', i)) {
      let depth = 1;
      i += 2;
      while (i < body.length && depth > 0) {
        if (body[i] === '{') depth++;
        else if (body[i] === '}') depth--;
        i++;
      }
    } else {
      out += body[i];
      i++;
    }
  }
  return out;
}

/** The 1-based line of character `index` in `source`. */
function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (source[i] === '\n') line++;
  return line;
}

/** Every untranslated guarded attribute in one file's source, with 1-based line numbers. */
export function scanSource(source: string): LiteralViolation[] {
  const violations: LiteralViolation[] = [];
  for (const re of [QUOTED_RE, EXPR_LITERAL_RE]) {
    for (const match of source.matchAll(re)) {
      const attr = match[1];
      const value = match[2] ?? match[3] ?? '';
      if (attr === 'placeholder' && ALLOWED_PLACEHOLDERS.has(value)) continue;
      if (!LETTERS_RE.test(value)) continue;
      violations.push({ line: lineAt(source, match.index), text: match[0] });
    }
  }
  for (const match of source.matchAll(TEMPLATE_RE)) {
    if (!LETTERS_RE.test(templateStaticText(match[2]))) continue;
    violations.push({ line: lineAt(source, match.index), text: match[0] });
  }
  return violations.sort((a, b) => a.line - b.line);
}

/**
 * A JSX source fixture: `#{` stands for a template interpolation opener, which a plain string
 * literal cannot spell without tripping `noTemplateCurlyInString`.
 */
function src(text: string): string {
  return text.replaceAll('#{', '${');
}

describe('scanSource', () => {
  it.each([
    ['a double-quoted value', '<input placeholder="Enter name" />'],
    ['a single-quoted value', "<input placeholder='Enter name' />"],
    ['a single-quoted expression literal', "<img alt={'Profile photo'} />"],
    ['a double-quoted expression literal', '<img alt={"Profile photo"} />'],
    ['a template with static text', src('<button title={`Intensity #{level}/3 — click`} />')],
    ['a template whose t() call does not exempt it', src("<a aria-label={`#{t('x')} more`} />")],
    ['Turkish text', '<input placeholder="Adınızı girin" />'],
  ])('flags %s', (_case, source) => {
    expect(scanSource(source)).toHaveLength(1);
  });

  it('reports a template wrapped onto the next line at the attribute line', () => {
    const source = [
      '<div>',
      '  <button',
      '    title={',
      src('      `Intensity #{level}/3`'),
      '    }',
      '  />',
      '</div>',
    ].join('\n');

    expect(scanSource(source)).toEqual([{ line: 3, text: expect.stringContaining('title={') }]);
  });

  it('passes an interpolation-only template', () => {
    expect(
      scanSource(src("<SEOHead title={`#{data.title} – #{t('recipe.versionHistory')}`} />")),
    ).toEqual([]);
  });

  it('passes a lone version letter and values without text', () => {
    expect(scanSource(src('<span title={`v#{n}`} aria-label="" alt="—" />'))).toEqual([]);
  });

  it('passes an allowlisted placeholder only on placeholder', () => {
    expect(scanSource('<input placeholder="you@example.com" />')).toEqual([]);
    expect(scanSource('<input placeholder="coffee_lover" />')).toEqual([]);
    expect(scanSource('<input title="you@example.com" />')).toHaveLength(1);
  });

  it('ignores longer attribute names such as data-title', () => {
    expect(scanSource('<div data-title="Some text" subtitle="More text" />')).toEqual([]);
  });

  it('removes nested braces inside an interpolation', () => {
    expect(templateStaticText(src('#{fmt({ a: 1 })} – #{b}'))).toBe(' – ');
  });
});

describe('i18n literals regression guard', () => {
  it('has no untranslated placeholder/aria-label/alt/title attribute in any quoting form', () => {
    const files = collectTsxFiles(SRC_ROOT);
    expect(files.length).toBeGreaterThan(50);
    const violations: string[] = [];
    for (const file of files) {
      const relative = file.replace(`${SRC_ROOT}/`, '');
      for (const v of scanSource(readFileSync(file, 'utf8'))) {
        violations.push(`  ${relative}:${v.line} ${v.text}`);
      }
    }

    expect(
      violations,
      `Found ${violations.length} untranslated literal attribute(s):\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});
