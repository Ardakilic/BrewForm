/**
 * Contrast guard for chart colour tokens.
 *
 * Feature: wave-6-audit-remediation (t6, chart-rendering → "Chart colours come
 * from theme tokens and meet contrast minimums")
 *
 * Parses the light (`:root`), `.dark` and `.coffee` theme blocks in
 * `styles/globals.css` and asserts WCAG 2.2 contrast against the card
 * background (`--bg-secondary`): chart text ≥ 4.5:1, data marks and filled
 * rating stars ≥ 3:1. Guides and gridlines are decorative and exempt.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Vitest stubs CSS imports (even `?raw`), so the stylesheet is read from disk.
// Like `src/i18n-literals.test.ts`, this file uses Node APIs and is therefore
// listed in `apps/web/tsconfig.json` → `exclude` (the web tsconfig has no Node
// types). Vitest runs with cwd = apps/web.
const CSS = readFileSync(`${process.cwd()}/src/styles/globals.css`, 'utf8');

const THEMES = { light: ':root', dark: '.dark', coffee: '.coffee' } as const;

/** Extracts the `--token: #hex;` declarations of the first block opened by `selector {`. */
function themeTokens(selector: string): Record<string, string> {
  const start = CSS.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Theme block ${selector} not found in globals.css`);
  const end = CSS.indexOf('}', start);
  const block = CSS.slice(start, end);
  const tokens: Record<string, string> = {};
  for (const match of block.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}

/** WCAG relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two `#rrggbb` colours. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('contrast helper', () => {
  it('computes the WCAG extremes', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});

describe('chart token contrast against --bg-secondary', () => {
  for (const [theme, selector] of Object.entries(THEMES)) {
    describe(theme, () => {
      const tokens = themeTokens(selector);
      const bg = tokens['--bg-secondary'];

      it('defines every chart token', () => {
        for (const name of [
          '--bg-secondary',
          '--text-secondary',
          '--accent-primary',
          '--rating-star',
        ]) {
          expect(tokens[name], `${name} in ${selector}`).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
      });

      it('chart text (--text-secondary) is at least 4.5:1', () => {
        expect(contrast(tokens['--text-secondary'], bg)).toBeGreaterThanOrEqual(4.5);
      });

      it.each(['--accent-primary', '--rating-star'])('data mark %s is at least 3:1', (name) => {
        expect(contrast(tokens[name], bg)).toBeGreaterThanOrEqual(3);
      });
    });
  }

  it('matches the audited --rating-star ratios (4.60 / 7.06 / 7.11)', () => {
    const ratio = (selector: string) => {
      const t = themeTokens(selector);
      return contrast(t['--rating-star'], t['--bg-secondary']);
    };
    expect(ratio(':root')).toBeCloseTo(4.6, 1);
    expect(ratio('.dark')).toBeCloseTo(7.06, 1);
    expect(ratio('.coffee')).toBeCloseTo(7.11, 1);
  });
});
