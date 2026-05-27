/**
 * Tests for BrewTimeline component
 *
 * Property 4: Timeline segment proportional widths
 * Validates: Requirements 6.1, 6.2
 *
 * For any extractionTimeSeconds > 0 and preInfusionTimeSeconds where
 * 0 < preInfusionTimeSeconds < extractionTimeSeconds:
 * - Pre-infusion segment width% = (preInfusionTimeSeconds / extractionTimeSeconds) * 100
 * - Extraction segment width% = ((extractionTimeSeconds - preInfusionTimeSeconds) / extractionTimeSeconds) * 100
 * - Both percentages sum to 100
 *
 * Property 5: Timeline axis markers at adaptive intervals
 * Validates: Requirements 6.4
 *
 * For any extractionTimeSeconds > 0, the timeline SHALL produce markers at
 * adaptive intervals (5s for ≤60s, 15s for 61–120s, 30s for >120s),
 * plus a final marker at extractionTimeSeconds if it's not aligned to the step.
 */

import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import fc from 'fast-check';
import { BrewTimeline } from './BrewTimeline.tsx';
import { I18nProvider } from '../../contexts/I18nContext.tsx';
import type { ReactNode } from 'react';

function withI18n(ui: ReactNode) {
  return <I18nProvider>{ui}</I18nProvider>;
}

// ---------------------------------------------------------------------------
// Unit tests — rendering
// ---------------------------------------------------------------------------

describe('BrewTimeline — rendering unit tests', () => {
  it('returns null when extractionTimeSeconds is null', async () => {
    const { container } = render(withI18n(<BrewTimeline extractionTimeSeconds={null} />));
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('returns null when extractionTimeSeconds is undefined', async () => {
    const { container } = render(withI18n(<BrewTimeline extractionTimeSeconds={undefined} />));
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('renders when extractionTimeSeconds is present', async () => {
    const { container } = render(withI18n(<BrewTimeline extractionTimeSeconds={30} />));
    await waitFor(() => expect(container.firstChild).not.toBeNull());
  });

  it('shows flow rate when present', () => {
    render(withI18n(<BrewTimeline extractionTimeSeconds={30} flowRate={2.5} />));
    expect(screen.getByText('2.5 ml/s')).toBeInTheDocument();
  });

  it('does not show flow rate when null', () => {
    render(withI18n(<BrewTimeline extractionTimeSeconds={30} flowRate={null} />));
    expect(screen.queryByText(/ml\/s/)).toBeNull();
  });

  it('shows pre-infusion segment when preInfusionTimeSeconds is present', () => {
    render(withI18n(<BrewTimeline extractionTimeSeconds={30} preInfusionTimeSeconds={10} />));
    expect(screen.getByText('Pre-Infusion')).toBeInTheDocument();
  });

  it('does not show pre-infusion segment when preInfusionTimeSeconds is null', () => {
    render(withI18n(<BrewTimeline extractionTimeSeconds={30} preInfusionTimeSeconds={null} />));
    expect(screen.queryByText('Pre-Infusion')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Helpers for reading inline styles from rendered segments
// ---------------------------------------------------------------------------

/**
 * Renders BrewTimeline with the given props and returns the width percentages
 * of the pre-infusion and extraction segments as numbers.
 *
 * The timeline bar is the flex container with role="img". Its direct children
 * are the segment divs whose inline `width` style holds the percentage.
 */
function getSegmentWidths(
  extractionTimeSeconds: number,
  preInfusionTimeSeconds: number,
): { preInfusionPct: number; extractionPct: number } {
  const { container } = render(
    withI18n(
      <BrewTimeline
        extractionTimeSeconds={extractionTimeSeconds}
        preInfusionTimeSeconds={preInfusionTimeSeconds}
      />,
    ),
  );

  const timelineBar = container.querySelector('[role="img"]');
  if (!timelineBar) throw new Error('Timeline bar not found');

  const segments = Array.from(timelineBar.children) as HTMLElement[];
  if (segments.length < 2) throw new Error(`Expected 2 segments, got ${segments.length}`);

  const parseWidth = (el: HTMLElement): number => {
    const w = el.style.width;
    return parseFloat(w.replace('%', ''));
  };

  return {
    preInfusionPct: parseWidth(segments[0]),
    extractionPct: parseWidth(segments[1]),
  };
}

/**
 * Renders BrewTimeline and returns the numeric second values shown in the
 * time axis markers (e.g. "0s" → 0, "5s" → 5, "30s" → 30).
 *
 * The axis container is the last child of the card div — a relative-positioned
 * div with height 20px. Each marker is an absolute-positioned child div
 * containing a span with text like "0s", "5s", "30s".
 */
function getAxisMarkerValues(extractionTimeSeconds: number): number[] {
  const { container } = render(
    withI18n(<BrewTimeline extractionTimeSeconds={extractionTimeSeconds} />),
  );

  // The axis container is the div with style height: 20px (relative positioning)
  // It's the last child of the card root div.
  const card = container.firstElementChild;
  if (!card) throw new Error('Card root not found');

  // The axis div is the last child of the card
  const axisDiv = card.lastElementChild as HTMLElement;
  if (!axisDiv) throw new Error('Axis div not found');

  // Each direct child of axisDiv is a marker div containing a span
  const markerDivs = Array.from(axisDiv.children) as HTMLElement[];

  return markerDivs.map((div) => {
    const span = div.querySelector('span');
    const text = span?.textContent?.trim() ?? '';
    return parseInt(text.replace('s', ''), 10);
  });
}

// ---------------------------------------------------------------------------
// Unit tests — segment widths (specific examples)
// ---------------------------------------------------------------------------

describe('BrewTimeline — segment width unit tests', () => {
  it('pre-infusion 10s out of 30s total → 33.33% pre-infusion, 66.67% extraction', () => {
    const { preInfusionPct, extractionPct } = getSegmentWidths(30, 10);
    expect(preInfusionPct).toBeCloseTo((10 / 30) * 100, 5);
    expect(extractionPct).toBeCloseTo((20 / 30) * 100, 5);
    expect(preInfusionPct + extractionPct).toBeCloseTo(100, 5);
  });

  it('pre-infusion 5s out of 25s total → 20% pre-infusion, 80% extraction', () => {
    const { preInfusionPct, extractionPct } = getSegmentWidths(25, 5);
    expect(preInfusionPct).toBeCloseTo(20, 5);
    expect(extractionPct).toBeCloseTo(80, 5);
    expect(preInfusionPct + extractionPct).toBeCloseTo(100, 5);
  });

  it('pre-infusion 1s out of 2s total → 50% each', () => {
    const { preInfusionPct, extractionPct } = getSegmentWidths(2, 1);
    expect(preInfusionPct).toBeCloseTo(50, 5);
    expect(extractionPct).toBeCloseTo(50, 5);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — axis markers (specific examples)
// ---------------------------------------------------------------------------

describe('BrewTimeline — axis marker unit tests', () => {
  it('30s total → markers at 0, 5, 10, 15, 20, 25, 30', () => {
    const markers = getAxisMarkerValues(30);
    expect(markers).toEqual([0, 5, 10, 15, 20, 25, 30]);
  });

  it('25s total → markers at 0, 5, 10, 15, 20, 25', () => {
    const markers = getAxisMarkerValues(25);
    expect(markers).toEqual([0, 5, 10, 15, 20, 25]);
  });

  it('7s total → markers at 0, 5, 7 (7 is not a multiple of 5)', () => {
    const markers = getAxisMarkerValues(7);
    expect(markers).toEqual([0, 5, 7]);
  });

  it('5s total → markers at 0, 5 (no extra marker since 5 is a multiple of 5)', () => {
    const markers = getAxisMarkerValues(5);
    expect(markers).toEqual([0, 5]);
  });

  it('3s total → markers at 0, 3 (3 is not a multiple of 5)', () => {
    const markers = getAxisMarkerValues(3);
    expect(markers).toEqual([0, 3]);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

/**
 * Property 4: Timeline segment proportional widths
 * Validates: Requirements 6.1, 6.2
 */
describe('BrewTimeline — Property 4: Timeline segment proportional widths', () => {
  it('for any valid (preInfusion, extraction) pair, the widths sum to 100%', () => {
    fc.assert(
      fc.property(
        // extraction: integer 2..300 (needs room for at least 1s pre-infusion)
        fc.integer({ min: 2, max: 300 }),
        // preInfusion: integer 1..(extraction-1)
        fc.integer({ min: 1, max: 299 }).filter((pre) => pre < 300),
        (extraction, preInfusionRaw) => {
          // Ensure preInfusion < extraction
          const preInfusion = (preInfusionRaw % (extraction - 1)) + 1;

          const { preInfusionPct, extractionPct } = getSegmentWidths(extraction, preInfusion);

          // Both widths must be positive
          expect(preInfusionPct).toBeGreaterThan(0);
          expect(extractionPct).toBeGreaterThan(0);

          // Pre-infusion width must equal (preInfusion / extraction) * 100
          expect(preInfusionPct).toBeCloseTo((preInfusion / extraction) * 100, 5);

          // Extraction width must equal ((extraction - preInfusion) / extraction) * 100
          expect(extractionPct).toBeCloseTo(
            ((extraction - preInfusion) / extraction) * 100,
            5,
          );

          // They must sum to 100
          expect(preInfusionPct + extractionPct).toBeCloseTo(100, 5);
        },
      ),
      { numRuns: 200 },
    );
  });
});

/**
 * Property 5: Timeline axis markers at 5-second intervals
 * Validates: Requirements 6.4
 */
describe('BrewTimeline — Property 5: Timeline axis markers at adaptive intervals', () => {
  it('for any extractionTimeSeconds, markers include 0 and the total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 300 }),
        (total) => {
          const markers = getAxisMarkerValues(total);
          expect(markers).toContain(0);
          expect(markers).toContain(total);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('for any extractionTimeSeconds, all markers except possibly the last are aligned to the step', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 300 }),
        (total) => {
          const markers = getAxisMarkerValues(total);
          const step = total > 120 ? 30 : total > 60 ? 15 : 5;

          // All markers except the last must be multiples of the step
          const allButLast = markers.slice(0, -1);
          for (const m of allButLast) {
            expect(m % step).toBe(0);
          }

          // The last marker is either aligned (when total is) or total itself
          const last = markers[markers.length - 1];
          if (total % step === 0) {
            expect(last % step).toBe(0);
          } else {
            expect(last).toBe(total);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('uses 30s intervals for extractionTimeSeconds > 120', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 121, max: 300 }),
        (total) => {
          const markers = getAxisMarkerValues(total);
          const allButLast = markers.slice(0, -1);
          for (const m of allButLast) {
            expect(m % 30).toBe(0);
          }
          expect(markers.length).toBeLessThanOrEqual(12); // 0,30,60,...,300 + possibly total
        },
      ),
      { numRuns: 100 },
    );
  });

  it('uses 15s intervals for 61s ≤ extractionTimeSeconds ≤ 120s', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 61, max: 120 }),
        (total) => {
          const markers = getAxisMarkerValues(total);
          const allButLast = markers.slice(0, -1);
          for (const m of allButLast) {
            expect(m % 15).toBe(0);
          }
          expect(markers.length).toBeLessThanOrEqual(10); // 0,15,30,...,120 + possibly total
        },
      ),
      { numRuns: 100 },
    );
  });

  it('uses 5s intervals for extractionTimeSeconds ≤ 60', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60 }),
        (total) => {
          const markers = getAxisMarkerValues(total);
          const allButLast = markers.slice(0, -1);
          for (const m of allButLast) {
            expect(m % 5).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('for any extractionTimeSeconds, markers are in strictly ascending order', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 300 }),
        (total) => {
          const markers = getAxisMarkerValues(total);
          for (let i = 1; i < markers.length; i++) {
            expect(markers[i]).toBeGreaterThan(markers[i - 1]);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('for any extractionTimeSeconds that aligns to its step, the last marker equals the total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60 }).map((n) => n * 5),
        (total) => {
          const markers = getAxisMarkerValues(total);
          const last = markers[markers.length - 1];
          expect(last).toBe(total);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('for any extractionTimeSeconds not aligned to its step, the second-to-last marker is the largest aligned value ≤ total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 300 }).filter((n) => n % 5 !== 0),
        (total) => {
          const markers = getAxisMarkerValues(total);
          const step = total > 120 ? 30 : total > 60 ? 15 : 5;
          // Last marker must be total
          expect(markers[markers.length - 1]).toBe(total);
          // Second-to-last must be the largest multiple of step ≤ total
          const expectedSecondToLast = Math.floor(total / step) * step;
          if (expectedSecondToLast > 0) {
            expect(markers[markers.length - 2]).toBe(expectedSecondToLast);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
