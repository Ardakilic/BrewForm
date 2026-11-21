import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../contexts/I18nContext.tsx';
import { SCAA_CATEGORIES } from '../../utils/radar-chart-data.ts';
import { ScaaRadarChart } from './ScaaRadarChart.tsx';

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

/** Renders inside an I18nProvider whose stored locale is `locale`. */
function renderInLocale(ui: ReactNode, locale: 'en' | 'tr') {
  localStorage.setItem('brewform_locale', locale);
  return render(<I18nProvider>{ui}</I18nProvider>);
}

const ZEROS = Object.fromEntries(SCAA_CATEGORIES.map((c) => [c, 0]));

/**
 * ScaaRadarChart — responsive SVG radar chart of the SCAA taste profile laid
 * out by `computeRadarLayout`: a fitted viewBox with translated, wrapped
 * labels, one labelled `role="img"` and aria-hidden internals.
 *
 * Feature: wave-6-audit-remediation (t6, chart-rendering)
 */
describe('ScaaRadarChart', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders a responsive root <svg>: width="100%", inline max-width, no overflow style', () => {
    const { container } = render(<ScaaRadarChart categoryValues={{ Fruity: 2 }} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('width')).toBe('100%');
    expect(svg.style.maxWidth).toBe('280px');
    expect(svg.style.overflow).toBe('');
    expect(svg.getAttribute('height')).toBeNull();
    expect(svg.getAttribute('viewBox')).toMatch(/^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/);
  });

  it('honours a custom maxWidthPx', () => {
    const { container } = render(<ScaaRadarChart categoryValues={{}} maxWidthPx={240} />);
    expect((container.querySelector('svg') as SVGSVGElement).style.maxWidth).toBe('240px');
  });

  it('exposes exactly one role="img" whose name lists the non-zero categories and values (en)', () => {
    renderInLocale(<ScaaRadarChart categoryValues={{ ...ZEROS, Fruity: 6, Sweet: 3 }} />, 'en');
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(1);
    const name = images[0].getAttribute('aria-label') ?? '';
    expect(name).toContain('Fruity 6');
    expect(name).toContain('Sweet 3');
    expect(name).not.toContain('Floral');
    expect(name).not.toContain('Roasted');
  });

  it('uses translated category names in the accessible name (tr)', () => {
    renderInLocale(<ScaaRadarChart categoryValues={{ ...ZEROS, Fruity: 6, Sweet: 3 }} />, 'tr');
    const name = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(name).toContain('Meyvemsi 6');
    expect(name).toContain('Tatlı 3');
    expect(name).not.toContain('Fruity');
  });

  it('uses the empty-profile name when every value is 0', () => {
    renderInLocale(<ScaaRadarChart categoryValues={ZEROS} />, 'en');
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'SCAA taste profile radar chart: no taste notes',
    );
  });

  it('hides the SVG internals from assistive technology behind the single role="img"', () => {
    const { container } = render(<ScaaRadarChart categoryValues={{ Fruity: 2 }} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.children.length).toBeGreaterThan(0);
    expect(screen.getByRole('img')).toContainElement(svg as unknown as HTMLElement);
  });

  it('renders 9 axis lines and 3 guide polygons', () => {
    const { container } = render(<ScaaRadarChart categoryValues={{}} />);
    expect(container.querySelectorAll('[data-part="axis"]')).toHaveLength(SCAA_CATEGORIES.length);
    expect(container.querySelectorAll('[data-part="guide"]')).toHaveLength(3);
  });

  it('renders one <text> per category, splitting slash labels into <tspan> lines', () => {
    renderInLocale(<ScaaRadarChart categoryValues={{}} />, 'en');
    const texts = Array.from(document.querySelectorAll('svg text'));
    expect(texts).toHaveLength(SCAA_CATEGORIES.length);
    const green = texts.find((t) => t.textContent === 'Green/Vegetative');
    expect(green).toBeDefined();
    const tspans = Array.from(green?.querySelectorAll('tspan') ?? []).map((t) => t.textContent);
    expect(tspans).toEqual(['Green/', 'Vegetative']);
    const floral = texts.find((t) => t.textContent === 'Floral');
    expect(floral?.querySelectorAll('tspan')).toHaveLength(1);
  });

  it('renders Turkish axis labels under tr, with no English category names', () => {
    renderInLocale(<ScaaRadarChart categoryValues={{}} />, 'tr');
    const texts = Array.from(document.querySelectorAll('svg text')).map((t) => t.textContent);
    expect(texts).toContain('Yeşil/Bitkisel');
    for (const cat of SCAA_CATEGORIES) expect(texts).not.toContain(cat);
    const green = Array.from(document.querySelectorAll('svg text')).find(
      (t) => t.textContent === 'Yeşil/Bitkisel',
    );
    expect(Array.from(green?.querySelectorAll('tspan') ?? []).map((t) => t.textContent)).toEqual([
      'Yeşil/',
      'Bitkisel',
    ]);
  });

  it('renders the data polygon with token colours when values are provided', () => {
    const { container } = render(
      <ScaaRadarChart categoryValues={{ Floral: 3, Fruity: 2, Sweet: 1 }} />,
    );
    const data = container.querySelector('[data-part="data"]') as SVGPolygonElement;
    expect(data.getAttribute('fill')).toBe('var(--accent-primary)');
    expect(data.getAttribute('stroke')).toBe('var(--accent-primary)');
    expect(data.getAttribute('points')).not.toMatch(/NaN|Infinity/);
  });

  it('renders no data polygon for an empty profile but still renders guides and labels', () => {
    const { container } = render(<ScaaRadarChart categoryValues={ZEROS} />);
    expect(container.querySelector('[data-part="data"]')).toBeNull();
    expect(container.querySelectorAll('[data-part="guide"]')).toHaveLength(3);
    expect(container.querySelectorAll('svg text')).toHaveLength(9);
  });

  it('renders a vertex marker for a single-category profile', () => {
    const { container } = render(<ScaaRadarChart categoryValues={{ ...ZEROS, Roasted: 1 }} />);
    const markers = container.querySelectorAll('[data-part="marker"]');
    expect(markers).toHaveLength(1);
    expect(Number(markers[0].getAttribute('r'))).toBeGreaterThanOrEqual(3);
  });

  it('keeps finite coordinates when a value is NaN', () => {
    const { container } = render(
      <ScaaRadarChart categoryValues={{ Fruity: Number.NaN, Sweet: 2 }} />,
    );
    const data = container.querySelector('[data-part="data"]') as SVGPolygonElement;
    expect(data.getAttribute('points')).not.toMatch(/NaN/);
  });

  it('respects an explicit maxValue prop for scaling', () => {
    const { container } = render(<ScaaRadarChart categoryValues={{ Floral: 5 }} maxValue={10} />);
    const data = container.querySelector('[data-part="data"]') as SVGPolygonElement;
    // Floral is axis 0 (straight up): 5/10 of the radius → y = -50.
    expect(data.getAttribute('points')?.split(' ')[0]).toBe('0.000,-50.000');
  });
});
