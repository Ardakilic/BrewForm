/**
 * Contrast guard for the theme colour tokens.
 *
 * Features: wave-6-audit-remediation (t6, chart-rendering → "Chart colours come
 * from theme tokens and meet contrast minimums"); wave-6-review-remediation
 * (#19, chart-rendering → "Timeline phase labels are verified against their
 * real backgrounds"; E6, web-shared-components → "Theme text tokens meet WCAG
 * AA on the surfaces they are drawn on").
 *
 * Parses the light (`:root`), `.dark` and `.coffee` theme blocks in
 * `styles/globals.css` (the `#rrggbb` tokens and the translucent `rgba(…)`
 * diff tokens) and asserts WCAG 2.2 contrast in every theme:
 * - chart text ≥ 4.5:1 and data marks and filled rating stars ≥ 3:1 against
 *   the card background (`--bg-secondary`); guides and gridlines are exempt;
 * - the brew timeline's phase labels (`--text-primary`) ≥ 4.5:1 against the
 *   backgrounds they are drawn on: the pre-infusion zone, the card and the
 *   accent gradient composited over both;
 * - every allowed text/surface pair of `TEXT_PAIRS` ≥ 4.5:1 (`--text-tertiary`
 *   and `--error` only on page and card surfaces, `--error-on-raised` also on
 *   raised ones, the diff texts on their translucent backgrounds, and
 *   `var(--bg-primary)` text on accent and status fills).
 * Locked values make any token edit visible in review.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TIMELINE_GRADIENT_OPACITY } from '../brew-timeline.ts';

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

/** A translucent `rgba(r, g, b, a)` token as its opaque colour and its alpha. */
interface AlphaToken {
  hex: string;
  alpha: number;
}

/** Extracts the `--token: rgba(r, g, b, a);` declarations of the first block opened by `selector {`. */
function themeAlphaTokens(selector: string): Record<string, AlphaToken> {
  const start = CSS.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Theme block ${selector} not found in globals.css`);
  const block = CSS.slice(start, CSS.indexOf('}', start));
  const tokens: Record<string, AlphaToken> = {};
  const rgba = /(--[a-z0-9-]+):\s*rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)\s*;/g;
  for (const [, name, r, g, b, a] of block.matchAll(rgba)) {
    const hex = [r, g, b].map((c) => Number(c).toString(16).padStart(2, '0')).join('');
    tokens[name] = { hex: `#${hex}`, alpha: Number(a) };
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

/**
 * Composites `fg` at `alpha` over the opaque `bg` (per channel
 * `alpha × fg + (1 − alpha) × bg`, rounded) and returns the `#rrggbb` result.
 */
function blend(fg: string, bg: string, alpha: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) => Math.round(alpha * channel(fg, i) + (1 - alpha) * channel(bg, i)))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

describe('contrast helper', () => {
  it('computes the WCAG extremes', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('blends a colour over an opaque background', () => {
    expect(blend('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(blend('#6f4e37', '#e7e5e4', 0)).toBe('#e7e5e4');
    expect(blend('#6f4e37', '#e7e5e4', 1)).toBe('#6f4e37');
  });

  it('parses the translucent diff tokens of every theme', () => {
    expect(themeAlphaTokens(':root')['--diff-added-bg']).toEqual({ hex: '#16a34a', alpha: 0.1 });
    for (const selector of Object.values(THEMES)) {
      const alpha = themeAlphaTokens(selector);
      for (const name of [
        '--diff-highlight',
        '--diff-added-bg',
        '--diff-removed-bg',
        '--diff-modified-bg',
      ]) {
        expect(alpha[name]?.hex, `${name} in ${selector}`).toMatch(/^#[0-9a-f]{6}$/);
        expect(alpha[name]?.alpha, `${name} in ${selector}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('chart token contrast against --bg-secondary', () => {
  for (const [theme, selector] of Object.entries(THEMES)) {
    describe(theme, () => {
      const tokens = themeTokens(selector);
      const bg = tokens['--bg-secondary'];

      it('defines every chart and theme text token', () => {
        for (const name of [
          '--bg-primary',
          '--bg-secondary',
          '--bg-tertiary',
          '--text-primary',
          '--text-secondary',
          '--text-tertiary',
          '--accent-primary',
          '--accent-secondary',
          '--rating-star',
          '--error',
          '--error-bg',
          '--error-on-raised',
          '--success',
          '--warning',
          '--warning-bg',
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

describe('brew timeline phase labels against their real backgrounds', () => {
  /** `--text-primary` on the accent gradient's top over `--bg-tertiary`, the worst composite. */
  const LOCKED_WORST_CASE = { light: 7.65, dark: 5.04, coffee: 4.73 } as const;

  for (const [theme, selector] of Object.entries(THEMES) as [keyof typeof THEMES, string][]) {
    describe(theme, () => {
      const tokens = themeTokens(selector);
      const text = tokens['--text-primary'];
      const accent = tokens['--accent-primary'];
      const backgrounds: Record<string, string> = {
        '--bg-tertiary (pre-infusion zone)': tokens['--bg-tertiary'],
        '--bg-secondary (card)': tokens['--bg-secondary'],
        'the accent gradient over --bg-tertiary': blend(
          accent,
          tokens['--bg-tertiary'],
          TIMELINE_GRADIENT_OPACITY.top,
        ),
        'the accent gradient over --bg-secondary': blend(
          accent,
          tokens['--bg-secondary'],
          TIMELINE_GRADIENT_OPACITY.top,
        ),
      };

      it.each(Object.entries(backgrounds))('--text-primary is at least 4.5:1 on %s', (_, bg) => {
        expect(contrast(text, bg)).toBeGreaterThanOrEqual(4.5);
      });

      it(`matches the locked worst case (${LOCKED_WORST_CASE[theme]})`, () => {
        expect(contrast(text, backgrounds['the accent gradient over --bg-tertiary'])).toBeCloseTo(
          LOCKED_WORST_CASE[theme],
          1,
        );
      });
    });
  }
});

// ─── App-wide text tokens (E6) ───────────────────────────────────────────────

const BP = '--bg-primary';
const BS = '--bg-secondary';
const BT = '--bg-tertiary';

/** `<translucent token> over <opaque token>`: the translucent token composited over the opaque one. */
const over = (overlay: string, base: string) => `${overlay} over ${base}`;

/**
 * Every text colour token and the surfaces it is allowed on (≥ 4.5:1 in every
 * theme). `--text-tertiary` stays off `--bg-tertiary` (chips, popups, reply
 * boxes, hover states), where `--text-secondary` is the lowest text level.
 * `--error` stays off `--bg-tertiary` too (3.71:1 in dark); error-coloured text
 * on a raised surface (the reply delete button) uses `--error-on-raised`.
 */
const TEXT_PAIRS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['--text-primary', [BP, BS, BT]],
  ['--text-secondary', [BP, BS, BT]],
  ['--text-tertiary', [BP, BS]],
  ['--accent-primary', [BP, BS]],
  ['--accent-secondary', [BP, BS, over('--diff-highlight', BP), over('--diff-highlight', BS)]],
  ['--success', [BP, BS]],
  ['--error', [BP, BS, '--error-bg']],
  ['--error-on-raised', [BP, BS, BT]],
  ['--warning', [BP, BS, '--warning-bg']],
  ['--diff-added-text', [over('--diff-added-bg', BP), over('--diff-added-bg', BS)]],
  ['--diff-removed-text', [over('--diff-removed-bg', BP), over('--diff-removed-bg', BS)]],
  ['--diff-modified-text', [over('--diff-modified-bg', BP), over('--diff-modified-bg', BS)]],
  // Text on accent and status fills (badges, tabs, counters) is `var(--bg-primary)`.
  [
    BP,
    [
      '--accent-primary',
      '--accent-secondary',
      '--error',
      '--success',
      '--warning',
      '--text-secondary',
    ],
  ],
];

/** Resolves a `TEXT_PAIRS` surface to an opaque `#rrggbb` colour for one theme. */
function resolveSurface(
  surface: string,
  tokens: Record<string, string>,
  alpha: Record<string, AlphaToken>,
): string {
  const [overlay, base] = surface.split(' over ');
  if (base === undefined) return tokens[surface];
  return blend(alpha[overlay].hex, tokens[base], alpha[overlay].alpha);
}

describe('theme text tokens meet 4.5:1 on the surfaces they are allowed on', () => {
  for (const [theme, selector] of Object.entries(THEMES)) {
    describe(theme, () => {
      const tokens = themeTokens(selector);
      const alpha = themeAlphaTokens(selector);
      const pairs = TEXT_PAIRS.flatMap(([fg, surfaces]) =>
        surfaces.map((surface) => [fg, surface] as const),
      );

      it.each(pairs)('%s on %s is at least 4.5:1', (fg, surface) => {
        const fgColour = tokens[fg];
        const bgColour = resolveSurface(surface, tokens, alpha);
        expect(fgColour, `${fg} in ${selector}`).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(bgColour, `${surface} in ${selector}`).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(contrast(fgColour, bgColour)).toBeGreaterThanOrEqual(4.5);
      });
    });
  }

  it('matches the locked --error-on-raised on --bg-tertiary ratios (5.15 / 5.41 / 5.13)', () => {
    const ratio = (selector: string) => {
      const t = themeTokens(selector);
      return contrast(t['--error-on-raised'], t['--bg-tertiary']);
    };
    expect(ratio(':root')).toBeCloseTo(5.15, 1);
    expect(ratio('.dark')).toBeCloseTo(5.41, 1);
    expect(ratio('.coffee')).toBeCloseTo(5.13, 1);
  });

  it('matches the locked --text-tertiary on --bg-secondary ratios (4.73 / 5.00 / 5.30)', () => {
    const ratio = (selector: string) => {
      const t = themeTokens(selector);
      return contrast(t['--text-tertiary'], t['--bg-secondary']);
    };
    expect(ratio(':root')).toBeCloseTo(4.73, 1);
    expect(ratio('.dark')).toBeCloseTo(5.0, 1);
    expect(ratio('.coffee')).toBeCloseTo(5.3, 1);
  });
});
