/**
 * Print stylesheet guard.
 *
 * Feature: wave-6-review-remediation (group-20 V2). Print preview hid the
 * equipment list and the taste chips because `@media print` hid every
 * `button[type="button"]`, and `EquipmentSection`/`TastingNotesSection` render
 * that content as buttons. The print rules now hide only elements explicitly
 * marked with the one `print-hidden` class; the components mark their real
 * controls (actions, toggles, menus) and leave content unmarked (their own tests
 * assert that). Vitest stubs CSS imports (even `?raw`), so the stylesheet is read
 * with `node:fs` through `test-utils/source-scan.ts`; like the other source scans,
 * this file is listed in `apps/web/tsconfig.json` → `exclude`.
 */
import { describe, expect, it } from 'vitest';
import { readSource } from '../test-utils/source-scan.ts';

/** The app stylesheet. */
const css = readSource('styles/globals.css');

/** One CSS rule: its comma-separated selectors and its declaration block. */
interface Rule {
  selectors: string[];
  body: string;
}

/** The body of every `@media print { … }` block in `source` (comments stripped). */
function printBlocks(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  for (const match of code.matchAll(/@media\s+print\s*\{/g)) {
    const start = (match.index ?? 0) + match[0].length;
    let depth = 1;
    let i = start;
    for (; i < code.length && depth > 0; i++) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') depth--;
    }
    out.push(code.slice(start, i - 1));
  }
  return out;
}

/** The flat `selector { declarations }` rules of one block. */
function rulesOf(block: string): Rule[] {
  return [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    body: m[2],
  }));
}

describe('print stylesheet (globals.css)', () => {
  const rules = printBlocks(css).flatMap(rulesOf);

  it('has print rules', () => {
    expect(rules.length).toBeGreaterThan(0);
  });

  it('hides only elements marked with the print-hidden class', () => {
    const hidden = rules
      .filter((rule) => /display\s*:\s*none/.test(rule.body))
      .flatMap((rule) => rule.selectors);
    expect(hidden).toEqual(['.print-hidden']);
  });

  it('never selects buttons, headers, footers or navs by element', () => {
    for (const selector of rules.flatMap((rule) => rule.selectors)) {
      expect(selector).not.toMatch(/(?:^|[\s>+~(])(?:button|header|footer|nav)\b/);
    }
  });
});
