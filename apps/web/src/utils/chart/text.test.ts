/**
 * Tests for the deterministic text-width estimate and label wrapping.
 *
 * Feature: wave-6-audit-remediation (t6, chart-rendering → "Width estimate is
 * conservative against measured system-font widths", "Labels wrap after the slash")
 */
import { describe, expect, it } from 'vitest';
import { MEASURED_WIDTHS } from './measured-widths.fixture.ts';
import { estimateTextWidth, wrapLabel } from './text.ts';

describe('estimateTextWidth', () => {
  it.each(
    MEASURED_WIDTHS.map((r) => [r.text, r.fontPx, r.weight, r.letterSpacingPx, r.measuredPx]),
  )(
    'estimate for "%s" at %spx (weight %s, tracking %spx) is ≥ measured %spx',
    (text, fontPx, weight, letterSpacingPx, measuredPx) => {
      const estimate = estimateTextWidth(String(text), Number(fontPx), {
        bold: Number(weight) >= 600,
        letterSpacingPx: Number(letterSpacingPx),
      });
      expect(estimate).toBeGreaterThanOrEqual(Number(measuredPx));
    },
  );

  it('stays within a sane factor (≤ 1.5×) of every measured width', () => {
    for (const r of MEASURED_WIDTHS) {
      const estimate = estimateTextWidth(r.text, r.fontPx, {
        bold: r.weight >= 600,
        letterSpacingPx: r.letterSpacingPx,
      });
      expect(estimate / r.measuredPx).toBeLessThanOrEqual(1.5);
    }
  });

  it('returns 0 for an empty string', () => {
    expect(estimateTextWidth('', 12)).toBe(0);
  });

  it('is deterministic', () => {
    expect(estimateTextWidth('Sour/Fermented', 18)).toBe(estimateTextWidth('Sour/Fermented', 18));
  });

  it('scales linearly with font size', () => {
    expect(estimateTextWidth('Roasted', 20)).toBeCloseTo(estimateTextWidth('Roasted', 10) * 2);
  });

  it('applies the per-character classes (narrow < digit < other < wide)', () => {
    const narrow = estimateTextWidth('i', 10);
    const digit = estimateTextWidth('4', 10);
    const other = estimateTextWidth('a', 10);
    const wide = estimateTextWidth('W', 10);
    expect(narrow).toBeCloseTo(0.34 * 10 * 1.1);
    expect(digit).toBeCloseTo(0.62 * 10 * 1.1);
    expect(other).toBeCloseTo(0.6 * 10 * 1.1);
    expect(wide).toBeCloseTo(0.8 * 10 * 1.1);
    expect(estimateTextWidth('m', 10)).toBeCloseTo(wide);
    expect(estimateTextWidth('Ş', 10)).toBeCloseTo(wide);
    expect(estimateTextWidth('ı', 10)).toBeCloseTo(narrow);
  });

  it('adds letter-spacing per character and the bold factor', () => {
    const plain = estimateTextWidth('abc', 10);
    expect(estimateTextWidth('abc', 10, { letterSpacingPx: 2 })).toBeCloseTo(plain + 3 * 2 * 1.1);
    expect(estimateTextWidth('abc', 10, { bold: true })).toBeCloseTo(plain * 1.06);
  });
});

describe('wrapLabel', () => {
  it('splits after "/" keeping the slash on the first line (spec scenario)', () => {
    expect(wrapLabel('Green/Vegetative', 60, 10)).toEqual(['Green/', 'Vegetative']);
  });

  it('splits a Turkish slash label the same way', () => {
    expect(wrapLabel('Yeşil/Bitkisel', 50, 10)).toEqual(['Yeşil/', 'Bitkisel']);
  });

  it('keeps a label on one line when it fits', () => {
    expect(wrapLabel('Nutty/Cocoa', 200, 10)).toEqual(['Nutty/Cocoa']);
    expect(wrapLabel('Floral', 100, 10)).toEqual(['Floral']);
  });

  it('splits at whitespace when a segment is too wide, dropping the break space', () => {
    expect(wrapLabel('Sour Fermented', 60, 10)).toEqual(['Sour', 'Fermented']);
  });

  it('packs words greedily onto a line while they fit', () => {
    expect(wrapLabel('a b c dddddddddd', 30, 10)).toEqual(['a b c', 'dddddddddd']);
  });

  it('combines slash and whitespace breaks', () => {
    expect(wrapLabel('Green/Vegetative Notes', 60, 10)).toEqual(['Green/', 'Vegetative', 'Notes']);
  });

  it('returns an unbreakable label as a single line even when too wide', () => {
    expect(wrapLabel('Supercalifragilistic', 30, 10)).toEqual(['Supercalifragilistic']);
  });

  it('returns no lines for empty or blank text', () => {
    expect(wrapLabel('', 60, 10)).toEqual([]);
    expect(wrapLabel('   ', 60, 10)).toEqual([]);
  });

  it('never returns a line wider than the max unless it is a single unbreakable token', () => {
    const lines = wrapLabel('Fındıksı/Kakao Ekşi/Fermente', 50, 10);
    for (const line of lines) {
      if (/[\s/]./.test(line)) {
        expect(estimateTextWidth(line, 10)).toBeLessThanOrEqual(50);
      }
    }
    expect(lines.join('').replaceAll(' ', '')).toBe('Fındıksı/KakaoEkşi/Fermente');
  });
});
