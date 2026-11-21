/**
 * Source guard for chart components.
 *
 * Feature: wave-6-audit-remediation (t6, chart-rendering → "No chart relies on
 * overflow visible", "No text in a stretched SVG", "No hardcoded chart colours");
 * wave-6-review-remediation (#19: no `--text-tertiary` chart text)
 *
 * Scans the chart, meter and rating components (and every file under
 * `components/charts/`, where the F17/F03 charts will live) and fails on:
 * - `overflow: 'visible'`, `overflow-visible` or `overflow="visible"`;
 * - a `<text>`/`<tspan>` inside an `<svg>` with `preserveAspectRatio="none"`;
 * - hex colour literals (colours must be theme tokens);
 * - `--text-tertiary` used as a text colour (it is reserved for page and card
 *   surfaces; chart text sits on in-chart fills). Strokes and borders in
 *   `--text-tertiary` are marks and stay allowed.
 */
import { describe, expect, it } from 'vitest';

/**
 * Raw sources of the scanned components, keyed by path relative to this file.
 * Vite's `import.meta.glob` with `?raw` inlines each file as a string, so the
 * guard needs no Node APIs (the web tsconfig has no Node types).
 */
const SOURCES = import.meta.glob<string>(
  [
    '../../components/recipe/ScaaRadarChart.tsx',
    '../../components/recipe/BrewTimeline.tsx',
    '../../components/recipe/StarRating.tsx',
    '../../components/recipe/IntensityDots.tsx',
    '../../components/charts/**/*.tsx',
    '!../../components/charts/**/*.test.tsx',
  ],
  { query: '?raw', import: 'default', eager: true },
);

const CHART_FILES = [
  '../../components/recipe/ScaaRadarChart.tsx',
  '../../components/recipe/BrewTimeline.tsx',
  '../../components/recipe/StarRating.tsx',
  '../../components/recipe/IntensityDots.tsx',
];

const OVERFLOW_VISIBLE = /overflow:\s*['"]visible['"]|overflow-visible|overflow="visible"/;
const HEX_COLOUR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/;
const TERTIARY_TEXT =
  /text-\[color:var\(--text-tertiary\)\]|color:\s*['"]var\(--text-tertiary\)['"]/;

/** Returns each `<svg …>…</svg>` element source in `source`. */
function svgElements(source: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf('<svg', from);
    if (start < 0) return out;
    const end = source.indexOf('</svg>', start);
    const stop = end < 0 ? source.length : end + '</svg>'.length;
    out.push(source.slice(start, stop));
    from = stop;
  }
}

/** Lists every guard violation in a component source. */
function findViolations(source: string): string[] {
  const violations: string[] = [];
  const overflow = source.match(OVERFLOW_VISIBLE);
  if (overflow) violations.push(`overflow visible: ${overflow[0]}`);
  for (const svg of svgElements(source)) {
    if (svg.includes('preserveAspectRatio="none"') && /<(text|tspan)\b/.test(svg)) {
      violations.push('<text>/<tspan> inside a preserveAspectRatio="none" <svg>');
    }
  }
  const hex = source.match(HEX_COLOUR);
  if (hex) violations.push(`hex colour literal: ${hex[0]}`);
  const tertiary = source.match(TERTIARY_TEXT);
  if (tertiary) violations.push(`--text-tertiary as a text colour: ${tertiary[0]}`);
  return violations;
}

describe('chart guard — detector self-test', () => {
  it('flags each banned pattern', () => {
    expect(findViolations("<svg style={{ overflow: 'visible' }}></svg>")).toHaveLength(1);
    expect(findViolations('<svg className="block overflow-visible"></svg>')).toHaveLength(1);
    expect(findViolations('<svg overflow="visible"></svg>')).toHaveLength(1);
    expect(
      findViolations('<svg preserveAspectRatio="none"><rect /><text>1s</text></svg>'),
    ).toHaveLength(1);
    expect(
      findViolations('<svg preserveAspectRatio="none"><text><tspan>a</tspan></text></svg>'),
    ).toHaveLength(1);
    expect(findViolations('<path fill="#f5a623" />')).toHaveLength(1);
    expect(findViolations("const c = '#FFF';")).toHaveLength(1);
    expect(findViolations('<span className="text-[color:var(--text-tertiary)]" />')).toHaveLength(
      1,
    );
    expect(findViolations("<p style={{ color: 'var(--text-tertiary)' }} />")).toHaveLength(1);
  });

  it('accepts tokens, uniform SVG text and gradient url references', () => {
    expect(findViolations('<svg viewBox="0 0 10 10"><text>ok</text></svg>')).toEqual([]);
    expect(
      findViolations('<svg preserveAspectRatio="none"><path /></svg><svg><text>x</text></svg>'),
    ).toEqual([]);
    expect(findViolations('<path fill="var(--rating-star)" />')).toEqual([]);
    // `--text-tertiary` marks (an empty-star stroke, an empty-dot border) are not text.
    expect(findViolations('<path stroke="var(--text-tertiary)" />')).toEqual([]);
    expect(findViolations("<span style={{ border: '1px solid var(--text-tertiary)' }} />")).toEqual(
      [],
    );
    // Template literal with escapes: the source text `url(#${gradientId})` is not a colour.
    expect(findViolations(`<path fill={\`url(#\${gradientId})\`} />`)).toEqual([]);
  });
});

describe('chart guard — chart component sources', () => {
  it('scans every listed chart component', () => {
    for (const file of CHART_FILES) expect(typeof SOURCES[file], file).toBe('string');
  });

  it.each(Object.keys(SOURCES))(
    '%s has no overflow visible, stretched SVG text, hex colours or tertiary text',
    (file) => {
      expect(findViolations(SOURCES[file])).toEqual([]);
    },
  );
});
