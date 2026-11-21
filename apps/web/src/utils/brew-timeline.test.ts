/**
 * Tests for the pure brew-timeline model and phase-label layout.
 *
 * Feature: wave-6-audit-remediation (t6, chart-rendering → "Brew timeline phase
 * geometry is clamped", "Brew timeline labels are HTML confined to their phase")
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  computeTimelineModel,
  layoutPhaseLabels,
  PHASE_LABEL_PADDING_PX,
  type TimelineModel,
} from './brew-timeline.ts';
import { estimateTextWidth } from './chart/index.ts';

const WIDTHS = [200, 222, 277, 507, 670] as const;
const LOCALES = ['en', 'tr'] as const;

describe('computeTimelineModel', () => {
  it('splits a normal 5/28 shot into 17.857% / 82.143%', () => {
    const model = computeTimelineModel(28, 5) as TimelineModel;
    expect(model.inconsistent).toBe(false);
    expect(model.total).toBe(28);
    expect(model.phases.map((p) => p.kind)).toEqual(['preInfusion', 'extraction']);
    expect(model.phases[0].seconds).toBe(5);
    expect(model.phases[1].seconds).toBe(23);
    expect(model.phases[0].widthPct).toBeCloseTo(17.857, 3);
    expect(model.phases[1].widthPct).toBeCloseTo(82.143, 3);
    expect(model.phases[0].startPct).toBe(0);
    expect(model.phases[1].startPct).toBeCloseTo(17.857, 3);
    expect(model.preInfusionPct).toBeCloseTo(17.857, 3);
  });

  it.each([
    [28, 30],
    [28, 28],
  ])(
    'pre ≥ total (%s/%s) → one extraction phase at 100% plus the inconsistent flag',
    (total, pre) => {
      const model = computeTimelineModel(total, pre) as TimelineModel;
      expect(model.inconsistent).toBe(true);
      expect(model.phases).toHaveLength(1);
      expect(model.phases[0]).toMatchObject({
        kind: 'extraction',
        seconds: total,
        startPct: 0,
        widthPct: 100,
      });
      expect(model.preInfusionPct).toBe(0);
    },
  );

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY, null, undefined])(
    'total %s → null',
    (total) => {
      expect(computeTimelineModel(total, 5)).toBeNull();
    },
  );

  it.each([-3, Number.NaN, 0, null, undefined])('pre %s → no split, not inconsistent', (pre) => {
    const model = computeTimelineModel(28, pre) as TimelineModel;
    expect(model.inconsistent).toBe(false);
    expect(model.phases).toHaveLength(1);
    expect(model.phases[0]).toMatchObject({ kind: 'extraction', seconds: 28, widthPct: 100 });
  });

  it('PBT: phase widths lie in [0, 100] and sum to 100', () => {
    const input = fc.oneof(fc.integer({ min: -10, max: 100_000 }), fc.constant(Number.NaN));
    fc.assert(
      fc.property(input, input, (total, pre) => {
        const model = computeTimelineModel(total, pre);
        if (model === null) {
          expect(Number.isFinite(total) && total > 0).toBe(false);
          return;
        }
        let sum = 0;
        for (const phase of model.phases) {
          expect(phase.widthPct).toBeGreaterThanOrEqual(0);
          expect(phase.widthPct).toBeLessThanOrEqual(100);
          expect(phase.startPct).toBeGreaterThanOrEqual(0);
          expect(phase.startPct).toBeLessThanOrEqual(100);
          expect(phase.seconds).toBeGreaterThanOrEqual(0);
          sum += phase.widthPct;
        }
        expect(sum).toBeCloseTo(100, 9);
      }),
      { numRuns: 1000 },
    );
  });
});

describe('layoutPhaseLabels', () => {
  /** Asserts every visible label box lies inside its phase and every duration is visible somewhere. */
  function assertConfined(model: TimelineModel, widthPx: number, locale: 'en' | 'tr'): void {
    const layout = layoutPhaseLabels(model, widthPx, locale);
    expect(layout.phases).toHaveLength(model.phases.length);
    for (const phase of layout.phases) {
      const left = (phase.startPct / 100) * widthPx;
      const right = left + (phase.widthPct / 100) * widthPx;
      for (const part of ['title', 'value'] as const) {
        const box = part === 'title' ? phase.titleBox : phase.valueBox;
        const shown = part === 'title' ? phase.showTitle : phase.showValue;
        if (!shown) continue;
        expect(box, `${phase.kind} ${part}`).not.toBeNull();
        if (!box) continue;
        const ctx = `${phase.kind} ${part} "${phase[part]}" at ${widthPx}px (${locale})`;
        expect(box.x, ctx).toBeGreaterThanOrEqual(left - 1e-9);
        expect(box.x + box.width, ctx).toBeLessThanOrEqual(right + 1e-9);
      }
      const inCaption = layout.caption.some(
        (c) => c.kind === phase.kind && c.value === phase.value,
      );
      expect(phase.showValue || inCaption, `${phase.kind} duration is visible`).toBe(true);
      expect(phase.showValue && inCaption, `${phase.kind} duration shown once`).toBe(false);
      if (phase.showTitle) expect(phase.showValue).toBe(true);
    }
  }

  it('uses formatted, localized values and uppercase titles', () => {
    const model = computeTimelineModel(270, 30) as TimelineModel;
    const en = layoutPhaseLabels(model, 670, 'en');
    expect(en.phases.map((p) => p.value)).toEqual(['30s', '4m']);
    expect(en.phases[0].title).toBe('Pre-Infusion');
    const tr = layoutPhaseLabels(model, 670, 'tr');
    expect(tr.phases.map((p) => p.value)).toEqual(['30 sn', '4 dk']);
    expect(tr.phases[1].title).toBe('Ekstraksiyon');
  });

  it.each([200, 222, 277])(
    '3/28 at %spx: the pre value moves to the caption (en and tr)',
    (width) => {
      const model = computeTimelineModel(28, 3) as TimelineModel;
      for (const locale of LOCALES) {
        const layout = layoutPhaseLabels(model, width, locale);
        const [pre, extraction] = layout.phases;
        expect(pre.showValue).toBe(false);
        expect(pre.showTitle).toBe(false);
        expect(layout.caption).toEqual([
          {
            kind: 'preInfusion',
            title: locale === 'en' ? 'Pre-Infusion' : 'Ön Islatma',
            value: locale === 'en' ? '3s' : '3 sn',
          },
        ]);
        expect(extraction.showValue).toBe(true);
        expect(extraction.value).toBe(locale === 'en' ? '25s' : '25 sn');
      }
    },
  );

  it('3/28 at 222px (en): the extraction phase shows its title and 25s (spec scenario)', () => {
    const layout = layoutPhaseLabels(computeTimelineModel(28, 3) as TimelineModel, 222, 'en');
    expect(layout.phases[1]).toMatchObject({ showTitle: true, showValue: true, value: '25s' });
  });

  it('a phase value is shown only when its estimated width plus padding fits the phase', () => {
    const model = computeTimelineModel(28, 5) as TimelineModel;
    for (const width of WIDTHS) {
      const layout = layoutPhaseLabels(model, width, 'en');
      for (const phase of layout.phases) {
        const phasePx = (phase.widthPct / 100) * width;
        const need =
          estimateTextWidth(phase.value, 18, { bold: true }) + 2 * PHASE_LABEL_PADDING_PX;
        expect(phase.showValue, `${phase.kind} at ${width}px`).toBe(need <= phasePx);
      }
    }
  });

  it('confines every visible label to its phase at every width, en and tr', () => {
    const cases: [number, number | null][] = [
      [28, 5],
      [28, 3],
      [27, 6],
      [30, 1],
      [28, 25],
      [43200, 30],
      [43200, null],
      [28, 30],
    ];
    for (const [total, pre] of cases) {
      const model = computeTimelineModel(total, pre) as TimelineModel;
      for (const width of WIDTHS)
        for (const locale of LOCALES) assertConfined(model, width, locale);
    }
  });

  it('PBT: labels stay confined for arbitrary splits', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.constantFrom(...WIDTHS),
        fc.constantFrom(...LOCALES),
        (total, pre, width, locale) => {
          const model = computeTimelineModel(total, pre) as TimelineModel;
          assertConfined(model, width, locale);
        },
      ),
      { numRuns: 500 },
    );
  });
});
