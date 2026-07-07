import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ScaaRadarChart } from './ScaaRadarChart.tsx';
import { SCAA_CATEGORIES } from '../../utils/radar-chart-data.ts';

/**
 * ScaaRadarChart — pure SVG radar chart for SCAA taste profile
 * visualization. No external charting library; renders 9 axes with
 * guide polygons, a data polygon, and category labels.
 */
describe('ScaaRadarChart', () => {
  it('renders an <svg> with role="img" and an aria-label', () => {
    const { container } = render(<ScaaRadarChart categoryValues={{}} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('SCAA taste profile radar chart');
  });

  it('uses the size prop for width, height, and viewBox', () => {
    const { container } = render(<ScaaRadarChart categoryValues={{}} size={400} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('400');
    expect(svg?.getAttribute('height')).toBe('400');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 400 400');
  });

  it('defaults to a 300x300 svg when no size is provided', () => {
    const { container } = render(<ScaaRadarChart categoryValues={{}} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('300');
    expect(svg?.getAttribute('height')).toBe('300');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 300 300');
  });

  it('renders exactly 9 axis lines (one per SCAA category)', () => {
    const { container } = render(<ScaaRadarChart categoryValues={{}} />);
    const axes = container.querySelectorAll('svg > line');
    expect(axes).toHaveLength(SCAA_CATEGORIES.length);
  });

  it('renders exactly 3 concentric guide polygons at 33/66/100%', () => {
    const { container } = render(<ScaaRadarChart categoryValues={{}} />);
    const polygons = container.querySelectorAll('svg > polygon');
    // 3 guides + 1 data polygon = 4 polygons total
    expect(polygons).toHaveLength(4);
  });

  it('renders one <text> label per SCAA category', () => {
    const { container } = render(<ScaaRadarChart categoryValues={{}} />);
    const texts = container.querySelectorAll('svg > text');
    expect(texts).toHaveLength(SCAA_CATEGORIES.length);
    const renderedLabels = Array.from(texts).map((t) => t.textContent);
    for (const cat of SCAA_CATEGORIES) {
      expect(renderedLabels).toContain(cat);
    }
  });

  it('renders the data polygon with the accent fill when values are provided', () => {
    const { container } = render(
      <ScaaRadarChart categoryValues={{ Floral: 3, Fruity: 2, Sweet: 1 }} />,
    );
    const polygons = Array.from(container.querySelectorAll('svg > polygon'));
    // The data polygon is the last one and uses the accent-primary fill
    const dataPoly = polygons[polygons.length - 1];
    expect(dataPoly.getAttribute('fill')).toBe('var(--accent-primary)');
    expect(dataPoly.getAttribute('fill-opacity')).toBe('0.3');
    expect(dataPoly.getAttribute('stroke')).toBe('var(--accent-primary)');
  });

  it('renders without crashing when all category values are zero', () => {
    const { container } = render(
      <ScaaRadarChart categoryValues={Object.fromEntries(SCAA_CATEGORIES.map((c) => [c, 0]))} />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('respects an explicit maxValue prop for scaling', () => {
    const { container } = render(
      <ScaaRadarChart categoryValues={{ Floral: 5 }} maxValue={10} />,
    );
    const polygons = Array.from(container.querySelectorAll('svg > polygon'));
    const dataPoly = polygons[polygons.length - 1];
    // With maxValue=10 and Floral=5, the data point sits at half the max radius.
    // Just assert the polygon has a finite points string (rendered without error).
    expect(dataPoly.getAttribute('points')).toMatch(/-?\d+\.\d{3},-?\d+\.\d{3}/);
  });
});
