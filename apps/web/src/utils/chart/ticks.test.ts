/**
 * Tests for numeric and duration tick generation.
 *
 * Feature: wave-6-audit-remediation (t6, chart-rendering → "Duration axes use
 * bounded nice ticks", "Numeric nice ticks respect the maximum count");
 * wave-6-review-remediation (#21, "Near-equal and huge bounds terminate")
 *
 * The duration formatters are injected, so these tests use small local
 * formatters mirroring the en/tr `chart.duration.*` unit strings; the real
 * i18n-backed formatters are exercised by the BrewTimeline tests.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type Box, overlaps } from './layout.ts';
import { estimateTextWidth } from './text.ts';
import { type DurationTick, durationTicks, niceTicks } from './ticks.ts';

// ─── niceTicks ───────────────────────────────────────────────────────────────

/** True when `step` is 1, 2 or 5 times a power of ten (within float noise). */
function isNiceStep(step: number): boolean {
  const exponent = Math.floor(Math.log10(step));
  const mantissa = step / 10 ** exponent;
  return [1, 2, 5, 10].some((m) => Math.abs(mantissa - m) < 1e-6);
}

describe('niceTicks', () => {
  it('returns ≤ maxCount ascending multiples of a nice step inside the bounds (spec scenario)', () => {
    const ticks = niceTicks(0, 1234, 8);
    expect(ticks).toEqual([0, 200, 400, 600, 800, 1000, 1200]);
  });

  it('handles fractional ranges without float drift', () => {
    expect(niceTicks(0, 1, 5)).toEqual([0, 0.5, 1]);
    expect(niceTicks(0.1, 0.3, 5)).toEqual([0.1, 0.15, 0.2, 0.25, 0.3]);
  });

  it('handles negative and reversed ranges', () => {
    expect(niceTicks(-10, 10, 5)).toEqual([-10, -5, 0, 5, 10]);
    expect(niceTicks(10, -10, 5)).toEqual([-10, -5, 0, 5, 10]);
  });

  it('returns the single value for an empty range', () => {
    expect(niceTicks(3, 3, 5)).toEqual([3]);
  });

  it('returns [] for non-finite bounds or a maxCount below 1', () => {
    expect(niceTicks(Number.NaN, 10, 5)).toEqual([]);
    expect(niceTicks(0, Number.POSITIVE_INFINITY, 5)).toEqual([]);
    expect(niceTicks(0, 10, 0)).toEqual([]);
  });

  it('PBT: ≤ maxCount, ascending, in bounds, evenly spaced by a nice step', () => {
    const finite = fc.double({ min: -1e6, max: 1e6, noNaN: true });
    fc.assert(
      fc.property(finite, finite, fc.integer({ min: 2, max: 12 }), (a, b, maxCount) => {
        fc.pre(Math.abs(a - b) > 1e-6);
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        const ticks = niceTicks(a, b, maxCount);
        expect(ticks.length).toBeLessThanOrEqual(maxCount);
        const eps = (hi - lo) * 1e-9;
        for (const v of ticks) {
          expect(v).toBeGreaterThanOrEqual(lo - eps);
          expect(v).toBeLessThanOrEqual(hi + eps);
        }
        for (let i = 1; i < ticks.length; i++) {
          expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
        }
        if (ticks.length >= 2) {
          const step = ticks[1] - ticks[0];
          expect(isNiceStep(step)).toBe(true);
          for (let i = 2; i < ticks.length; i++) {
            expect(Math.abs(ticks[i] - ticks[i - 1] - step)).toBeLessThan(step * 1e-6);
          }
        }
      }),
      { numRuns: 500 },
    );
  });
});

/** Moves `x` by `n` units in the last place (a step through the IEEE-754 bit pattern). */
function moveUlps(x: number, n: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  view.setBigInt64(0, view.getBigInt64(0) + BigInt(n));
  return view.getFloat64(0);
}

/** Asserts 1–`maxCount` finite, strictly ascending ticks inside `[lo, hi]` (float tolerance). */
function expectValidTicks(ticks: number[], lo: number, hi: number, maxCount: number): void {
  const ctx = `lo=${lo} hi=${hi} maxCount=${maxCount} ticks=[${ticks.join(', ')}]`;
  expect(ticks.length, ctx).toBeGreaterThanOrEqual(1);
  expect(ticks.length, ctx).toBeLessThanOrEqual(maxCount);
  const eps = (hi - lo) * 1e-9;
  for (const v of ticks) {
    expect(Number.isFinite(v), ctx).toBe(true);
    expect(v, ctx).toBeGreaterThanOrEqual(lo - eps);
    expect(v, ctx).toBeLessThanOrEqual(hi + eps);
  }
  for (let i = 1; i < ticks.length; i++) expect(ticks[i], ctx).toBeGreaterThan(ticks[i - 1]);
}

describe('niceTicks terminates on near-equal and huge bounds', () => {
  it('moveUlps steps to the neighbouring doubles', () => {
    expect(moveUlps(0.3, 1)).toBe(0.1 + 0.2);
    expect(moveUlps(0, 1)).toBe(Number.MIN_VALUE);
    expect(moveUlps(Number.MAX_VALUE, 1)).toBe(Number.POSITIVE_INFINITY);
  });

  it('bounds one ulp apart: niceTicks(0.3, 0.1 + 0.2, 4) → [0.3]', () => {
    expect(niceTicks(0.3, 0.1 + 0.2, 4)).toEqual([0.3]);
  });

  it('magnitudes beyond 2^53: niceTicks(2 ** 60, 2 ** 60 + 256, 4)', () => {
    expectValidTicks(niceTicks(2 ** 60, 2 ** 60 + 256, 4), 2 ** 60, 2 ** 60 + 256, 4);
  });

  it('a subnormal range: niceTicks(0, Number.MIN_VALUE, 4) → [0]', () => {
    expect(niceTicks(0, Number.MIN_VALUE, 4)).toEqual([0]);
  });

  it('no nice step fits: niceTicks(0.6, 0.8, 1) → the lower bound alone (spec scenario)', () => {
    expect(niceTicks(0.6, 0.8, 1)).toEqual([0.6]);
  });

  it('an overflowing range returns []', () => {
    expect(niceTicks(-Number.MAX_VALUE, Number.MAX_VALUE, 8)).toEqual([]);
  });

  it('the top of the double range: niceTicks(Number.MAX_VALUE / 2, Number.MAX_VALUE, 8)', () => {
    const lo = Number.MAX_VALUE / 2;
    expectValidTicks(niceTicks(lo, Number.MAX_VALUE, 8), lo, Number.MAX_VALUE, 8);
  });

  it('PBT: any finite bounds (including a few ulps apart) give valid ticks, or [] on overflow', () => {
    const double = fc.double({ noNaN: true, noDefaultInfinity: true });
    const other = fc.oneof(
      double.map((b) => ({ b })),
      fc.integer({ min: 1, max: 1000 }).map((ulps) => ({ ulps })),
    );
    fc.assert(
      fc.property(double, other, fc.integer({ min: 1, max: 12 }), (a, pick, maxCount) => {
        const b = 'b' in pick ? pick.b : moveUlps(a, pick.ulps);
        fc.pre(Number.isFinite(b) && a !== b);
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        const ticks = niceTicks(a, b, maxCount);
        if (!Number.isFinite(hi - lo)) {
          expect(ticks).toEqual([]);
          return;
        }
        expectValidTicks(ticks, lo, hi, maxCount);
      }),
      { numRuns: 1000 },
    );
  });
});

// ─── durationTicks ───────────────────────────────────────────────────────────

type Locale = 'en' | 'tr';

const UNITS: Record<Locale, { s: string; m: string; h: string }> = {
  en: { s: '{n}s', m: '{n}m', h: '{n}h' },
  tr: { s: '{n} sn', m: '{n} dk', h: '{n} sa' },
};

/** Fills a unit template with a locale-grouped integer. */
function unit(locale: Locale, key: 's' | 'm' | 'h', n: number): string {
  return UNITS[locale][key].replace('{n}', n.toLocaleString(locale));
}

/** Local tick formatter: the step's unit, `0` for the origin. */
function tickFormatter(locale: Locale) {
  return (seconds: number, step: number): string => {
    if (seconds === 0) return '0';
    if (step < 60) return unit(locale, 's', seconds);
    if (step < 3600) return unit(locale, 'm', seconds / 60);
    return unit(locale, 'h', seconds / 3600);
  };
}

/** Local compact total formatter: at most two units. */
function totalFormatter(locale: Locale) {
  return (total: number): string => {
    const s = Math.round(total);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const parts: string[] = [];
    if (h > 0) {
      parts.push(unit(locale, 'h', h));
      if (m > 0) parts.push(unit(locale, 'm', m));
    } else if (m > 0) {
      parts.push(unit(locale, 'm', m));
      if (sec > 0) parts.push(unit(locale, 's', sec));
    } else {
      parts.push(unit(locale, 's', sec));
    }
    return parts.join(' ');
  };
}

const FONT_PX = 10.4;

/** Ticks for a total at a width, with the local formatters. */
function ticksFor(total: number, locale: Locale, widthPx = 200): DurationTick[] {
  return durationTicks(total, {
    widthPx,
    fontSizePx: FONT_PX,
    formatTick: tickFormatter(locale),
    formatTotal: totalFormatter(locale),
  });
}

/** Independent px box of each tick label (first left-, last right-anchored, rest centred). */
function boxesFor(ticks: DurationTick[], total: number, widthPx: number): Box[] {
  return ticks.map((tick, i) => {
    const w = estimateTextWidth(tick.label, FONT_PX);
    const centre = (tick.value / total) * widthPx;
    const x = i === 0 ? 0 : i === ticks.length - 1 ? widthPx - w : centre - w / 2;
    return { x, y: 0, width: w, height: FONT_PX };
  });
}

/** Labels joined with spaces, for readable example assertions. */
function labels(ticks: DurationTick[]): string {
  return ticks.map((t) => t.label).join(' ');
}

describe('durationTicks — examples at 200px', () => {
  it.each([
    [27, 'en', '0 5s 10s 15s 20s 27s'],
    [59, 'en', '0 10s 20s 30s 40s 59s'],
    [290, 'en', '0 1m 2m 3m 4m 50s'],
    [1800, 'en', '0 5m 10m 15m 20m 30m'],
    [43200, 'en', '0 2h 4h 6h 8h 12h'],
    [43200, 'tr', '0 2 sa 4 sa 6 sa 8 sa 12 sa'],
    [86400, 'en', '0 6h 12h 18h 24h'],
  ] as const)('%ss (%s) → %s', (total, locale, expected) => {
    expect(labels(ticksFor(total, locale))).toBe(expected);
  });

  it('drops the near-duplicate tick before the end label (27s: no 25s)', () => {
    const values = ticksFor(27, 'en').map((t) => t.value);
    expect(values).not.toContain(25);
    expect(values.at(-1)).toBe(27);
  });

  it('anchors the first label at the start, the last at the end and the rest in the middle', () => {
    const ticks = ticksFor(43200, 'en');
    expect(ticks[0].anchor).toBe('start');
    expect(ticks.at(-1)?.anchor).toBe('end');
    for (const tick of ticks.slice(1, -1)) expect(tick.anchor).toBe('middle');
  });

  it('reports each tick position as a percentage of the total', () => {
    const ticks = ticksFor(43200, 'en');
    expect(ticks.map((t) => t.pct)).toEqual([
      0,
      (7200 / 43200) * 100,
      (14400 / 43200) * 100,
      (21600 / 43200) * 100,
      (28800 / 43200) * 100,
      100,
    ]);
  });

  it('returns [] for a missing, zero, negative or non-finite total', () => {
    expect(ticksFor(0, 'en')).toEqual([]);
    expect(ticksFor(-5, 'en')).toEqual([]);
    expect(ticksFor(Number.NaN, 'en')).toEqual([]);
    expect(ticksFor(Number.POSITIVE_INFINITY, 'en')).toEqual([]);
  });

  it.each([1, 2147483647])(
    'extreme total %s returns 2–8 ticks with 0 and the total, in under 5 ms',
    (total) => {
      for (const locale of ['en', 'tr'] as const) {
        const start = performance.now();
        const ticks = ticksFor(total, locale);
        const elapsed = performance.now() - start;
        expect(ticks.length).toBeGreaterThanOrEqual(2);
        expect(ticks.length).toBeLessThanOrEqual(8);
        expect(ticks[0].value).toBe(0);
        expect(ticks.at(-1)?.value).toBe(total);
        expect(elapsed).toBeLessThan(5);
      }
    },
  );
});

describe('durationTicks — invariants', () => {
  const WIDTHS = [200, 222, 277, 507, 670] as const;

  /**
   * Times one call; a slow call is re-measured once so a stray GC pause under
   * a loaded CI worker does not fail the 5 ms bound, while a genuinely slow
   * (total-dependent) implementation still does.
   */
  function timedTicks(total: number, locale: Locale, widthPx: number) {
    let start = performance.now();
    let ticks = ticksFor(total, locale, widthPx);
    let elapsed = performance.now() - start;
    if (elapsed >= 5) {
      start = performance.now();
      ticks = ticksFor(total, locale, widthPx);
      elapsed = Math.min(elapsed, performance.now() - start);
    }
    return { ticks, elapsed };
  }

  /** Asserts every axis invariant for one total/locale/width. */
  function assertAxis(total: number, locale: Locale, widthPx: number): void {
    const { ticks, elapsed } = timedTicks(total, locale, widthPx);
    const ctx = `total=${total} locale=${locale} width=${widthPx} labels=[${labels(ticks)}]`;
    expect(ticks.length, ctx).toBeGreaterThanOrEqual(2);
    expect(ticks.length, ctx).toBeLessThanOrEqual(8);
    expect(ticks[0].value, ctx).toBe(0);
    expect(ticks.at(-1)?.value, ctx).toBe(total);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i].value, ctx).toBeGreaterThan(ticks[i - 1].value);
    }
    const boxes = boxesFor(ticks, total, widthPx);
    for (const box of boxes) {
      expect(box.x, ctx).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, ctx).toBeLessThanOrEqual(widthPx + 1e-9);
    }
    for (let i = 1; i < boxes.length; i++) {
      expect(overlaps(boxes[i - 1], boxes[i], 6), ctx).toBe(false);
    }
    expect(elapsed, ctx).toBeLessThan(5);
  }

  it('PBT: totals 1–86,400 plus 172,800, 10^6 and 2,147,483,647 (en/tr × 5 widths)', () => {
    const total = fc.oneof(
      { arbitrary: fc.integer({ min: 1, max: 86_400 }), weight: 10 },
      { arbitrary: fc.constantFrom(172_800, 1_000_000, 2_147_483_647), weight: 1 },
    );
    fc.assert(
      fc.property(
        total,
        fc.constantFrom<Locale>('en', 'tr'),
        fc.constantFrom(...WIDTHS),
        (t, locale, width) => {
          assertAxis(t, locale, width);
        },
      ),
      { numRuns: 3000 },
    );
  });

  it('holds for every total from 1 to 3,600 at the 200px minimum (en and tr)', () => {
    for (const locale of ['en', 'tr'] as const) {
      for (let t = 1; t <= 3600; t++) assertAxis(t, locale, 200);
    }
  });

  it('holds for the fixed extremes at every width', () => {
    for (const t of [172_800, 1_000_000, 2_147_483_647]) {
      for (const locale of ['en', 'tr'] as const) {
        for (const width of WIDTHS) assertAxis(t, locale, width);
      }
    }
  });
});
