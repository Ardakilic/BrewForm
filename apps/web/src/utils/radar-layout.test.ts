/**
 * Geometry tests for the SCAA radar layout.
 *
 * Feature: wave-6-audit-remediation (t6, chart-rendering → "SCAA radar chart
 * reserves label space and translates categories", "Radar values are
 * sanitized and degenerate profiles stay visible", "Radar label size stays
 * readable across widths")
 *
 * jsdom has no layout, so every label line box is computed with the shared
 * `estimateTextWidth` and checked against the returned viewBox.
 */
import { en, tr } from '@brewform/shared/i18n';
import { describe, expect, it } from 'vitest';
import { type Box, estimateTextWidth, overlaps } from './chart/index.ts';
import { SCAA_CATEGORIES, SCAA_CATEGORY_SLUGS } from './radar-chart-data.ts';
import { computeRadarLayout, type RadarLayout } from './radar-layout.ts';

const FONT = 18;
const MAX_WIDTH_PX = 280;
const NARROWEST_PX = 222;

/** The translated category labels for a locale bundle. */
function labelsFor(bundle: Record<string, string>): string[] {
  return SCAA_CATEGORIES.map((cat) => bundle[`taste.category.${SCAA_CATEGORY_SLUGS[cat]}`]);
}

const LABEL_SETS: Record<string, string[]> = {
  en: labelsFor(en),
  tr: labelsFor(tr),
  // Unbreakable 24-character single words, wide glyphs included.
  synthetic24: SCAA_CATEGORIES.map((_, i) => `W${String.fromCharCode(97 + i).repeat(22)}M`),
};

const ZEROS = SCAA_CATEGORIES.map(() => 0);
const SOME = [1, 3, 2, 0, 1, 2, 3, 1, 2];

/** Box of one line of a laid-out label (same metrics the layout uses). */
function lineBoxes(layout: RadarLayout): { label: string; line: string; box: Box }[] {
  const out: { label: string; line: string; box: Box }[] = [];
  const lineH = layout.fontSize * layout.lineHeight;
  for (const label of layout.labels) {
    label.lines.forEach((line, i) => {
      const width = estimateTextWidth(line, layout.fontSize);
      const x =
        label.anchor === 'start'
          ? label.x
          : label.anchor === 'middle'
            ? label.x - width / 2
            : label.x - width;
      out.push({
        label: label.text,
        line,
        box: { x, y: label.box.y + i * lineH, width, height: lineH },
      });
    });
  }
  return out;
}

/** How far `inner` crosses `outer`, in the boxes' unit (≤ 0 when inside). */
function overflow(inner: Box, outer: Box): number {
  return Math.max(
    outer.x - inner.x,
    outer.y - inner.y,
    inner.x + inner.width - (outer.x + outer.width),
    inner.y + inner.height - (outer.y + outer.height),
  );
}

describe('computeRadarLayout — label geometry', () => {
  for (const [setName, labels] of Object.entries(LABEL_SETS)) {
    describe(`${setName} labels`, () => {
      const layout = computeRadarLayout({
        labels,
        values: SOME,
        fontSize: FONT,
        maxWidthPx: MAX_WIDTH_PX,
      });

      it('puts every label line box inside the viewBox', () => {
        for (const { label, line, box } of lineBoxes(layout)) {
          const units = overflow(box, layout.viewBox);
          const px = (units * NARROWEST_PX) / layout.viewBox.width;
          expect(
            units,
            `label "${label}" (line "${line}") overflows the viewBox by ${px.toFixed(1)}px at ${NARROWEST_PX}px`,
          ).toBeLessThanOrEqual(1e-9);
        }
      });

      it('has no label-label overlap', () => {
        const boxes = layout.labels.map((l) => ({ text: l.text, box: l.box }));
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            expect(
              overlaps(boxes[i].box, boxes[j].box),
              `labels "${boxes[i].text}" and "${boxes[j].text}" overlap`,
            ).toBe(false);
          }
        }
      });

      it('keeps the outer guide and its vertex markers inside the viewBox', () => {
        const r = layout.radius + layout.markerRadius;
        expect(
          overflow({ x: -r, y: -r, width: 2 * r, height: 2 * r }, layout.viewBox),
        ).toBeLessThanOrEqual(0);
      });

      it('anchors labels by side and places top labels above, side labels centred', () => {
        layout.labels.forEach((label, i) => {
          const angle = (2 * Math.PI * i) / labels.length - Math.PI / 2;
          const cos = Math.cos(angle);
          if (Math.abs(cos) < 0.1) {
            expect(label.anchor, label.text).toBe('middle');
            expect(label.vAlign, label.text).toBe(Math.sin(angle) < 0 ? 'bottom' : 'top');
          } else {
            expect(label.anchor, label.text).toBe(cos > 0 ? 'start' : 'end');
            expect(label.vAlign, label.text).toBe('middle');
          }
        });
      });
    });
  }

  it.each(['en', 'tr'])(
    '%s labels render at 10–14px between 222px and the max width',
    (setName) => {
      const layout = computeRadarLayout({
        labels: LABEL_SETS[setName],
        values: SOME,
        fontSize: FONT,
        maxWidthPx: MAX_WIDTH_PX,
      });
      expect((FONT * NARROWEST_PX) / layout.viewBox.width).toBeGreaterThanOrEqual(10);
      expect((FONT * MAX_WIDTH_PX) / layout.viewBox.width).toBeLessThanOrEqual(14);
    },
  );

  it('wraps slash labels after the slash into separate lines', () => {
    const layout = computeRadarLayout({ labels: LABEL_SETS.tr, values: SOME });
    const green = layout.labels[SCAA_CATEGORIES.indexOf('Green/Vegetative')];
    expect(green.lines).toEqual(['Yeşil/', 'Bitkisel']);
    expect(green.lineYs).toHaveLength(2);
    expect(green.lineYs[1]).toBeGreaterThan(green.lineYs[0]);
  });

  it('defaults fontSize to 18 and maxWidthPx to 280', () => {
    const layout = computeRadarLayout({ labels: LABEL_SETS.en, values: SOME });
    expect(layout.fontSize).toBe(18);
    expect(layout.maxWidthPx).toBe(280);
  });
});

describe('computeRadarLayout — values', () => {
  const labels = LABEL_SETS.en;
  const idx = (cat: (typeof SCAA_CATEGORIES)[number]) => SCAA_CATEGORIES.indexOf(cat);
  const dist = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);

  it('treats NaN, negative and ±Infinity values as 0 and keeps coordinates finite', () => {
    const values = [...ZEROS];
    values[idx('Floral')] = Number.NaN;
    values[idx('Fruity')] = -4;
    values[idx('Sweet')] = Number.POSITIVE_INFINITY;
    values[idx('Spices')] = Number.NEGATIVE_INFINITY;
    values[idx('Roasted')] = 2;
    const layout = computeRadarLayout({ labels, values });
    for (const cat of ['Floral', 'Fruity', 'Sweet', 'Spices'] as const) {
      expect(layout.values[idx(cat)], cat).toBe(0);
      expect(dist(layout.dataPoints[idx(cat)]), cat).toBeCloseTo(0);
    }
    for (const p of layout.dataPoints) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
    expect(layout.polygon).not.toMatch(/NaN|Infinity/);
  });

  it('NaN does not blank the chart: Sweet 2 plots at 2/3 of the radius (spec scenario)', () => {
    const values = [...ZEROS];
    values[idx('Fruity')] = Number.NaN;
    values[idx('Sweet')] = 2;
    const layout = computeRadarLayout({ labels, values });
    expect(layout.effectiveMax).toBe(3);
    expect(layout.polygon).not.toBeNull();
    expect(dist(layout.dataPoints[idx('Fruity')])).toBeCloseTo(0);
    expect(dist(layout.dataPoints[idx('Sweet')])).toBeCloseTo((2 / 3) * layout.radius);
  });

  it('clamps data above a smaller caller maxValue onto the outer guide (spec scenario)', () => {
    const values = [...ZEROS];
    values[idx('Floral')] = 9;
    const layout = computeRadarLayout({ labels, values, maxValue: 1 });
    expect(layout.effectiveMax).toBe(1);
    expect(dist(layout.dataPoints[idx('Floral')])).toBeCloseTo(layout.radius);
  });

  it('derives effectiveMax as max(data, 3) without a caller max, and max(maxValue, 1) with one', () => {
    expect(computeRadarLayout({ labels, values: [5, 1, 0, 0, 0, 0, 0, 0, 0] }).effectiveMax).toBe(
      5,
    );
    expect(computeRadarLayout({ labels, values: [1, 1, 0, 0, 0, 0, 0, 0, 0] }).effectiveMax).toBe(
      3,
    );
    expect(computeRadarLayout({ labels, values: SOME, maxValue: 0 }).effectiveMax).toBe(1);
    expect(computeRadarLayout({ labels, values: SOME, maxValue: Number.NaN }).effectiveMax).toBe(3);
    expect(computeRadarLayout({ labels, values: SOME, maxValue: 10 }).effectiveMax).toBe(10);
  });

  it('keeps every data vertex inside the outer guide', () => {
    const layout = computeRadarLayout({
      labels,
      values: [9, 1e9, 3, 2, 1, 0, 7, 8, 4],
      maxValue: 4,
    });
    for (const p of layout.dataPoints) expect(dist(p)).toBeLessThanOrEqual(layout.radius + 1e-9);
  });

  it('draws no polygon and no markers for an empty profile, but still lays out the labels', () => {
    const layout = computeRadarLayout({ labels, values: ZEROS });
    expect(layout.polygon).toBeNull();
    expect(layout.markers).toEqual([]);
    expect(layout.labels).toHaveLength(9);
    expect(layout.guides).toHaveLength(3);
  });

  it('draws one vertex marker (r ≥ 3) for a single non-zero category, inside the outer guide', () => {
    const values = [...ZEROS];
    values[idx('Roasted')] = 1;
    const layout = computeRadarLayout({ labels, values });
    expect(layout.markers).toHaveLength(1);
    const [marker] = layout.markers;
    expect(marker.r).toBeGreaterThanOrEqual(3);
    expect(marker.x).toBeCloseTo(layout.dataPoints[idx('Roasted')].x);
    expect(marker.y).toBeCloseTo(layout.dataPoints[idx('Roasted')].y);
    expect(dist(marker)).toBeLessThanOrEqual(layout.radius);
  });

  it('draws markers for two non-zero categories and none for three or more', () => {
    expect(
      computeRadarLayout({ labels, values: [1, 2, 0, 0, 0, 0, 0, 0, 0] }).markers,
    ).toHaveLength(2);
    expect(
      computeRadarLayout({ labels, values: [1, 2, 3, 0, 0, 0, 0, 0, 0] }).markers,
    ).toHaveLength(0);
  });

  it('treats missing values as 0', () => {
    const layout = computeRadarLayout({ labels, values: [2] });
    expect(layout.values).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
