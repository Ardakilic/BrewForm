/**
 * Regression guard: no untranslated string-literal UI attributes in production
 * TSX. Walks apps/web/src/**\/*.tsx (excluding tests) and asserts zero matches
 * for placeholder/aria-label/alt/title string literals outside an explicit
 * allowlist. Template-string aria-labels with English scaffolding are also
 * flagged.
 *
 * Allowlist rationale:
 * - `you@example.com` / `coffee_lover`: D40 — locale-neutral EXAMPLE values,
 *   not prose (recorded at RegisterPage.tsx).
 */
import { describe, expect, it } from 'vitest';

// Vitest runs under `deno run -A npm:vitest` with cwd = apps/web.
const SRC_ROOT = `${Deno.cwd()}/src`;

/** Recursively collect .tsx files, skipping tests and node_modules. */
function collectTsxFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of Deno.readDirSync(dir)) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      results.push(...collectTsxFiles(full));
    } else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) {
      results.push(full);
    }
  }
  return results;
}

interface LiteralMatch {
  file: string;
  line: number;
  text: string;
}

/**
 * Allowlisted literal attribute values — D40 locale-neutral example values
 * that are deliberately NOT translated (they are format examples, not prose).
 */
const ALLOWED_PLACEHOLDERS = new Set([
  'you@example.com',
  'coffee_lover',
]);

const LITERAL_ATTR_RE = /(?:placeholder|aria-label|alt|title)='([A-Za-z][^']*)'/g;

const TEMPLATE_ARIA_RE = /aria-label=\{`[^`]*[A-Za-z]{3,}[^`]*`\}/g;

describe('i18n literals regression guard', () => {
  const files = collectTsxFiles(SRC_ROOT);

  it('has no untranslated string-literal placeholder/aria-label/alt/title attributes', () => {
    const violations: LiteralMatch[] = [];

    for (const file of files) {
      const content = Deno.readTextFileSync(file);
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let match: RegExpExecArray | null;
        LITERAL_ATTR_RE.lastIndex = 0;
        while ((match = LITERAL_ATTR_RE.exec(line)) !== null) {
          const value = match[1];
          const attr = match[0].split('=')[0];
          if (attr === 'placeholder' && ALLOWED_PLACEHOLDERS.has(value)) continue;
          violations.push({
            file: file.replace(`${SRC_ROOT}/`, ''),
            line: i + 1,
            text: match[0],
          });
        }
      }
    }

    expect(
      violations,
      `Found ${violations.length} untranslated literal attribute(s):\n` +
        violations.map((v) => `  ${v.file}:${v.line} ${v.text}`).join('\n'),
    ).toEqual([]);
  });

  it('has no template-string aria-labels with English scaffolding', () => {
    const violations: LiteralMatch[] = [];

    for (const file of files) {
      const content = Deno.readTextFileSync(file);
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let match: RegExpExecArray | null;
        TEMPLATE_ARIA_RE.lastIndex = 0;
        while ((match = TEMPLATE_ARIA_RE.exec(line)) !== null) {
          // Templates that already call t() are translated — not violations.
          if (match[0].includes('t(')) continue;
          violations.push({
            file: file.replace(`${SRC_ROOT}/`, ''),
            line: i + 1,
            text: match[0],
          });
        }
      }
    }

    expect(
      violations,
      `Found ${violations.length} template-string aria-label(s) with English scaffolding:\n` +
        violations.map((v) => `  ${v.file}:${v.line} ${v.text}`).join('\n'),
    ).toEqual([]);
  });
});
