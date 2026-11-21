/**
 * Tests for BrewTimeline component
 *
 * Property 4: Timeline segment proportional widths
 * Validates: Requirements 6.1, 6.2 — the phase boxes' inline widths are
 * proportional to the phase durations and sum to 100%.
 *
 * Wave-6 chart-rendering (t6): the axis comes from `durationTicks` (≤ 8 ticks,
 * always 0 and the total, ascending), the stretched SVG holds shapes only,
 * phase labels are HTML confined to their phase (hidden durations move to a
 * caption row), every inline percentage is finite and in [0, 100], and an
 * inconsistent pre-infusion renders a single phase plus one warn log.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import fc from 'fast-check';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../contexts/I18nContext.tsx';
import { BrewTimeline } from './BrewTimeline.tsx';

const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }));

vi.mock('../../utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: mockWarn,
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

function withI18n(ui: ReactNode) {
  return <I18nProvider>{ui}</I18nProvider>;
}

/** Renders inside an I18nProvider with a stored locale. */
function renderInLocale(ui: ReactNode, locale: 'en' | 'tr') {
  localStorage.setItem('brewform_locale', locale);
  return render(withI18n(ui));
}

beforeEach(() => {
  mockWarn.mockClear();
});

afterEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Width percentages of the rendered phase boxes, in order. */
function getPhaseWidths(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-phase]')).map((el) =>
    parseFloat(el.style.width),
  );
}

/** Tick label texts and left percentages, in DOM order. */
function getTicks(container: HTMLElement): { label: string; left: number }[] {
  const axis = container.querySelector('[data-testid="brew-timeline-axis"]');
  if (!axis) throw new Error('Axis not found');
  return Array.from(axis.children as HTMLCollectionOf<HTMLElement>).map((el) => ({
    label: el.textContent ?? '',
    left: parseFloat(el.style.left),
  }));
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

  it.each([0, -5, Number.NaN])('returns null (no NaN%% styles) for a total of %s', (total) => {
    const { container } = render(withI18n(<BrewTimeline extractionTimeSeconds={total} />));
    expect(container.firstChild).toBeNull();
    expect(container.innerHTML).not.toContain('NaN');
  });

  it('renders when extractionTimeSeconds is present', async () => {
    const { container } = render(withI18n(<BrewTimeline extractionTimeSeconds={30} />));
    await waitFor(() => expect(container.firstChild).not.toBeNull());
  });

  it('shows flow rate when present', () => {
    render(withI18n(<BrewTimeline extractionTimeSeconds={30} flowRate={2.5} />));
    expect(screen.getByText('2.5 ml/s')).toBeInTheDocument();
  });

  it('rounds the flow rate to one decimal with the locale separator', () => {
    const { unmount } = renderInLocale(
      <BrewTimeline extractionTimeSeconds={30} flowRate={1.2857143} />,
      'en',
    );
    expect(screen.getByText('1.3 ml/s')).toBeInTheDocument();
    unmount();
    renderInLocale(<BrewTimeline extractionTimeSeconds={30} flowRate={1.2857143} />, 'tr');
    expect(screen.getByText('1,3 ml/s')).toBeInTheDocument();
  });

  it('does not show flow rate when null', () => {
    render(withI18n(<BrewTimeline extractionTimeSeconds={30} flowRate={null} />));
    expect(screen.queryByText(/ml\/s/)).toBeNull();
  });

  it('wraps the header as whole items', () => {
    const { container } = render(withI18n(<BrewTimeline extractionTimeSeconds={30} />));
    const header = container.querySelector('.card > div') as HTMLElement;
    expect(header).toHaveClass('flex', 'flex-wrap', 'gap-x-3');
  });

  it('renders a pre-infusion phase when preInfusionTimeSeconds is present', () => {
    const { container } = render(
      withI18n(<BrewTimeline extractionTimeSeconds={30} preInfusionTimeSeconds={10} />),
    );
    expect(container.querySelector('[data-phase="preInfusion"]')).not.toBeNull();
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Brew timeline: 10s pre-infusion, 20s extraction',
    );
  });

  it('does not render a pre-infusion phase when preInfusionTimeSeconds is null', () => {
    const { container } = render(
      withI18n(<BrewTimeline extractionTimeSeconds={30} preInfusionTimeSeconds={null} />),
    );
    expect(container.querySelector('[data-phase="preInfusion"]')).toBeNull();
    expect(screen.queryByText('Pre-Infusion')).toBeNull();
  });

  it('exposes exactly one role="img" named with formatted durations (43200s → 12h)', () => {
    render(withI18n(<BrewTimeline extractionTimeSeconds={43200} />));
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAccessibleName('Brew timeline: 12h extraction');
    expect(images[0].getAttribute('aria-label')).not.toContain('43200');
  });

  it('uses Turkish formatted durations in the accessible name', () => {
    renderInLocale(<BrewTimeline extractionTimeSeconds={28} preInfusionTimeSeconds={5} />, 'tr');
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Demleme çizelgesi: 5 sn ön ıslatma, 23 sn ekstraksiyon',
    );
  });

  it('moves a narrow pre-infusion duration to the caption (28s / 3s at the 200px fallback)', () => {
    const { container } = render(
      withI18n(<BrewTimeline extractionTimeSeconds={28} preInfusionTimeSeconds={3} />),
    );
    const pre = container.querySelector('[data-phase="preInfusion"]') as HTMLElement;
    expect(pre.textContent).toBe('');
    const caption = screen.getByTestId('brew-timeline-caption');
    expect(within(caption).getByText('Pre-Infusion')).toBeInTheDocument();
    expect(within(caption).getByText('3s')).toBeInTheDocument();
    const extraction = container.querySelector('[data-phase="extraction"]') as HTMLElement;
    expect(within(extraction).getByText('Extraction')).toBeInTheDocument();
    expect(within(extraction).getByText('25s')).toBeInTheDocument();
  });

  it('renders no caption when every duration fits', () => {
    render(withI18n(<BrewTimeline extractionTimeSeconds={30} />));
    expect(screen.queryByTestId('brew-timeline-caption')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Stretched SVG holds shapes only
// ---------------------------------------------------------------------------

describe('BrewTimeline — stretched SVG', () => {
  it('has no <text> or <tspan> inside the preserveAspectRatio="none" SVG', () => {
    const { container } = render(
      withI18n(<BrewTimeline extractionTimeSeconds={28} preInfusionTimeSeconds={5} />),
    );
    const svg = container.querySelector('svg[preserveAspectRatio="none"]') as SVGSVGElement;
    expect(svg).not.toBeNull();
    expect(svg.querySelectorAll('text, tspan')).toHaveLength(0);
  });

  it('gives every stroked path and line vector-effect="non-scaling-stroke"', () => {
    const { container } = render(
      withI18n(<BrewTimeline extractionTimeSeconds={28} preInfusionTimeSeconds={5} />),
    );
    const svg = container.querySelector('svg[preserveAspectRatio="none"]') as SVGSVGElement;
    const stroked = Array.from(svg.querySelectorAll('path[stroke], line'));
    expect(stroked.length).toBeGreaterThanOrEqual(2);
    for (const el of stroked) {
      expect(el.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    }
  });
});

// ---------------------------------------------------------------------------
// Unit tests — phase widths (specific examples)
// ---------------------------------------------------------------------------

describe('BrewTimeline — phase width unit tests', () => {
  it('pre-infusion 10s out of 30s total → 33.33% pre-infusion, 66.67% extraction', () => {
    const { container } = render(
      withI18n(<BrewTimeline extractionTimeSeconds={30} preInfusionTimeSeconds={10} />),
    );
    const [pre, extraction] = getPhaseWidths(container);
    expect(pre).toBeCloseTo((10 / 30) * 100, 3);
    expect(extraction).toBeCloseTo((20 / 30) * 100, 3);
  });

  it('pre-infusion 5s out of 25s total → 20% / 80%', () => {
    const { container } = render(
      withI18n(<BrewTimeline extractionTimeSeconds={25} preInfusionTimeSeconds={5} />),
    );
    expect(getPhaseWidths(container)).toEqual([20, 80]);
  });

  it('pre ≥ total → one extraction phase at 100%, no minus sign, one warn log', () => {
    const { container, rerender } = render(
      withI18n(<BrewTimeline extractionTimeSeconds={28} preInfusionTimeSeconds={30} />),
    );
    expect(getPhaseWidths(container)).toEqual([100]);
    expect(container.querySelector('[data-phase="extraction"]')?.textContent).toContain('28s');
    expect(container.textContent).not.toMatch(/[-−]\d/);
    expect(screen.getByRole('img').getAttribute('aria-label')).not.toMatch(/[-−]/);
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn).toHaveBeenCalledWith(
      { extractionTimeSeconds: 28, preInfusionTimeSeconds: 30 },
      'inconsistent pre-infusion ignored',
    );
    rerender(withI18n(<BrewTimeline extractionTimeSeconds={28} preInfusionTimeSeconds={30} />));
    expect(mockWarn).toHaveBeenCalledTimes(1);
  });

  it('does not warn for a consistent pre-infusion', () => {
    render(withI18n(<BrewTimeline extractionTimeSeconds={28} preInfusionTimeSeconds={5} />));
    expect(mockWarn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Unit tests — axis ticks
// ---------------------------------------------------------------------------

describe('BrewTimeline — axis ticks', () => {
  it('43200s → 0 2h 4h 6h 8h 12h (en)', () => {
    const { container } = render(withI18n(<BrewTimeline extractionTimeSeconds={43200} />));
    expect(getTicks(container).map((t) => t.label)).toEqual(['0', '2h', '4h', '6h', '8h', '12h']);
  });

  it('43200s → 0 2 sa … 12 sa (tr)', () => {
    const { container } = renderInLocale(<BrewTimeline extractionTimeSeconds={43200} />, 'tr');
    expect(getTicks(container).map((t) => t.label)).toEqual([
      '0',
      '2 sa',
      '4 sa',
      '6 sa',
      '8 sa',
      '12 sa',
    ]);
  });

  it('2,147,483,647s renders ≤ 8 ticks quickly', () => {
    const start = performance.now();
    const { container } = render(withI18n(<BrewTimeline extractionTimeSeconds={2147483647} />));
    const elapsed = performance.now() - start;
    const ticks = getTicks(container);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks.length).toBeLessThanOrEqual(8);
    expect(ticks.at(-1)?.label).toBe('596,523h 14m');
    expect(elapsed).toBeLessThan(1000);
  });

  it('colours tick labels with --text-secondary', () => {
    const { container } = render(withI18n(<BrewTimeline extractionTimeSeconds={30} />));
    const axis = container.querySelector('[data-testid="brew-timeline-axis"]') as HTMLElement;
    for (const tick of Array.from(axis.children)) {
      expect(tick.className).toContain('text-[color:var(--text-secondary)]');
    }
  });

  it('PBT: ≤ 8 ticks, starting at 0 (left 0%), ending at the total (left 100%), ascending', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200_000 }), (total) => {
        const { container, unmount } = render(
          withI18n(<BrewTimeline extractionTimeSeconds={total} />),
        );
        const ticks = getTicks(container);
        expect(ticks.length).toBeGreaterThanOrEqual(2);
        expect(ticks.length).toBeLessThanOrEqual(8);
        expect(ticks[0]).toEqual({ label: '0', left: 0 });
        expect(ticks.at(-1)?.left).toBe(100);
        for (let i = 1; i < ticks.length; i++) {
          expect(ticks[i].left).toBeGreaterThan(ticks[i - 1].left);
        }
        unmount();
      }),
      { numRuns: 100 },
    );
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
  it('for any valid (preInfusion, extraction) pair, the phase widths are proportional and sum to 100%', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 300 }),
        fc.integer({ min: 1, max: 299 }),
        (extraction, preInfusionRaw) => {
          const preInfusion = (preInfusionRaw % (extraction - 1)) + 1;
          const { container, unmount } = render(
            withI18n(
              <BrewTimeline
                extractionTimeSeconds={extraction}
                preInfusionTimeSeconds={preInfusion}
              />,
            ),
          );
          const [prePct, extractionPct] = getPhaseWidths(container);
          // Widths round-trip through jsdom's CSS serializer (4 decimals).
          expect(prePct).toBeGreaterThan(0);
          expect(extractionPct).toBeGreaterThan(0);
          expect(prePct).toBeCloseTo((preInfusion / extraction) * 100, 3);
          expect(extractionPct).toBeCloseTo(((extraction - preInfusion) / extraction) * 100, 3);
          expect(prePct + extractionPct).toBeCloseTo(100, 3);
          unmount();
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('BrewTimeline — inline percentages never leave range', () => {
  it('PBT: every inline width/left % is finite and in [0, 100] for inputs in [-10, 100000] plus NaN', () => {
    const input = fc.oneof(
      { arbitrary: fc.integer({ min: -10, max: 100_000 }), weight: 10 },
      { arbitrary: fc.constant(Number.NaN), weight: 1 },
    );
    fc.assert(
      fc.property(input, input, (total, pre) => {
        const { container, unmount } = render(
          withI18n(<BrewTimeline extractionTimeSeconds={total} preInfusionTimeSeconds={pre} />),
        );
        expect(container.innerHTML).not.toContain('NaN');
        for (const el of Array.from(container.querySelectorAll<HTMLElement>('[style]'))) {
          for (const prop of ['width', 'left'] as const) {
            const raw = el.style[prop];
            if (!raw.endsWith('%')) continue;
            const value = parseFloat(raw);
            expect(Number.isFinite(value), `${prop}: ${raw}`).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(100);
          }
        }
        unmount();
      }),
      { numRuns: 150 },
    );
  });
});
