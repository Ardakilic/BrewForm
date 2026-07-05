/**
 * ScaaRadarChart — pure SVG radar chart for SCAA taste profile visualization.
 * No external charting library. No animation, no interactivity (print-compatible).
 *
 * Validates: Requirements 8.1
 */

import { SCAA_CATEGORIES } from '../../utils/radar-chart-data.ts';

export interface ScaaRadarChartProps {
  /** category name → aggregated intensity */
  categoryValues: Record<string, number>;
  /** default: auto-calculated as max of all values (min 3) */
  maxValue?: number;
  /** default: 300 */
  size?: number;
}

const NUM_AXES = 9;
const MAX_RADIUS = 100;
const LABEL_RADIUS_FACTOR = 1.15;
const GUIDE_FRACTIONS = [1 / 3, 2 / 3, 1] as const;

/**
 * Compute the angle (in radians) for axis i.
 * Starts from the top (−π/2) and goes clockwise.
 */
function axisAngle(i: number): number {
  return ((2 * Math.PI) / NUM_AXES) * i - Math.PI / 2;
}

/**
 * Compute the (x, y) point on a given axis at a given radius from center.
 */
function axisPoint(
  cx: number,
  cy: number,
  radius: number,
  i: number,
): [number, number] {
  const angle = axisAngle(i);
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

/**
 * Build an SVG polygon `points` string for a regular 9-gon at the given radius.
 */
function polygonPoints(cx: number, cy: number, radius: number): string {
  return Array.from({ length: NUM_AXES }, (_, i) => {
    const [x, y] = axisPoint(cx, cy, radius, i);
    return `${x.toFixed(3)},${y.toFixed(3)}`;
  }).join(' ');
}

/**
 * Determine the SVG `text-anchor` value for a label based on its x position
 * relative to the center.
 */
function textAnchor(x: number, cx: number): 'start' | 'middle' | 'end' {
  const delta = x - cx;
  if (delta > 2) return 'start';
  if (delta < -2) return 'end';
  return 'middle';
}

/**
 * Determine the dominant-baseline for a label based on its y position
 * relative to the center.
 */
function dominantBaseline(
  y: number,
  cy: number,
): 'auto' | 'middle' | 'hanging' {
  const delta = y - cy;
  if (delta > 2) return 'hanging';
  if (delta < -2) return 'auto';
  return 'middle';
}

/**
 * Static 9-axis SVG radar chart of SCAA category intensities with
 * guide polygons and positioned labels; scale auto-fits to the max
 * value (minimum 3) unless `maxValue` is given.
 */
export function ScaaRadarChart({
  categoryValues,
  maxValue,
  size = 300,
}: ScaaRadarChartProps) {
  const cx = size / 2;
  const cy = size / 2;

  // Scale MAX_RADIUS proportionally if size differs from 300
  const maxRadius = (MAX_RADIUS / 300) * size;

  // Compute effective max value: max of all category values, minimum 3
  const allValues = SCAA_CATEGORIES.map((cat) => categoryValues[cat] ?? 0);
  const computedMax = Math.max(...allValues, 3);
  const effectiveMax = maxValue != null ? Math.max(maxValue, 1) : computedMax;

  // Build data polygon points
  const dataPoints = SCAA_CATEGORIES.map((cat, i) => {
    const value = categoryValues[cat] ?? 0;
    const r = (value / effectiveMax) * maxRadius;
    return axisPoint(cx, cy, r, i);
  });
  const dataPolygonPoints = dataPoints
    .map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role='img'
      aria-label='SCAA taste profile radar chart'
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* Axis lines from center to each vertex */}
      {SCAA_CATEGORIES.map((_, i) => {
        const [x, y] = axisPoint(cx, cy, maxRadius, i);
        return (
          <line
            key={`axis-${i}`}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke='var(--border-secondary)'
            strokeWidth={1}
          />
        );
      })}

      {/* Concentric guide polygons at 33%, 66%, 100% */}
      {GUIDE_FRACTIONS.map((fraction) => (
        <polygon
          key={`guide-${fraction}`}
          points={polygonPoints(cx, cy, maxRadius * fraction)}
          fill='none'
          stroke='var(--border-primary)'
          strokeWidth={1}
        />
      ))}

      {/* Data polygon */}
      <polygon
        points={dataPolygonPoints}
        fill='var(--accent-primary)'
        fillOpacity={0.3}
        stroke='var(--accent-primary)'
        strokeWidth={2}
      />

      {/* Category labels */}
      {SCAA_CATEGORIES.map((cat, i) => {
        const labelRadius = maxRadius * LABEL_RADIUS_FACTOR;
        const [lx, ly] = axisPoint(cx, cy, labelRadius, i);
        return (
          <text
            key={`label-${i}`}
            x={lx.toFixed(3)}
            y={ly.toFixed(3)}
            fontSize={10}
            fill='var(--text-secondary)'
            textAnchor={textAnchor(lx, cx)}
            dominantBaseline={dominantBaseline(ly, cy)}
          >
            {cat}
          </text>
        );
      })}
    </svg>
  );
}
