/**
 * ScaaRadarChart — pure SVG radar chart for SCAA taste profile visualization.
 * No external charting library. No animation, no interactivity (print-compatible).
 *
 * Geometry comes from the pure `computeRadarLayout` (fitted viewBox, labels
 * wrapped after `/`, values clamped), rendered at `width="100%"` up to
 * `maxWidthPx` so labels scale uniformly and always stay inside the viewBox.
 *
 * Validates: Requirements 8.1; wave-6 chart-rendering (t6)
 */

import { formatDecimal } from '../../utils/format.ts';
import { SCAA_CATEGORIES, scaaCategoryLabelKey } from '../../utils/radar-chart-data.ts';
import { computeRadarLayout } from '../../utils/radar-layout.ts';
import { useSafeLocale, useSafeT } from '../../utils/safe-translation.ts';

/** Props for {@link ScaaRadarChart} — category→intensity values plus optional scale and width. */
export interface ScaaRadarChartProps {
  /** category name → aggregated intensity */
  categoryValues: Record<string, number>;
  /** default: auto-calculated as max of all values (min 3); a caller value is at least 1 */
  maxValue?: number;
  /** maximum rendered width in px (default 280); the chart shrinks to its container below it */
  maxWidthPx?: number;
}

/** Rounds a coordinate for compact SVG attributes. */
function round(n: number): number {
  return Number(n.toFixed(2));
}

/**
 * Static 9-axis SVG radar chart of SCAA category intensities with guide
 * polygons, translated labels and vertex markers for sparse profiles. One
 * `role="img"` wrapper carries a localized name listing the non-zero
 * categories and their values; the whole SVG is `aria-hidden`.
 */
export function ScaaRadarChart({
  categoryValues,
  maxValue,
  maxWidthPx = 280,
}: ScaaRadarChartProps) {
  const t = useSafeT();
  const locale = useSafeLocale();

  const labels = SCAA_CATEGORIES.map((cat) => {
    const key = scaaCategoryLabelKey(cat);
    return key ? t(key) : cat;
  });
  const layout = computeRadarLayout({
    labels,
    values: SCAA_CATEGORIES.map((cat) => categoryValues[cat]),
    maxValue,
    maxWidthPx,
  });

  const valueList = layout.values
    .map((value, i) => ({ value, label: labels[i] }))
    .filter(({ value }) => value > 0)
    .map(({ value, label }) => `${label} ${formatDecimal(value, locale, 1)}`)
    .join(', ');
  const accessibleName = valueList
    ? t('a11y.scaaRadarChartValues').replace('{values}', valueList)
    : t('a11y.scaaRadarChartEmpty');

  const vb = layout.viewBox;
  const viewBox = [vb.x, vb.y, vb.width, vb.height].map(round).join(' ');

  return (
    <div role="img" aria-label={accessibleName}>
      <svg
        viewBox={viewBox}
        width="100%"
        aria-hidden="true"
        style={{ display: 'block', maxWidth: `${maxWidthPx}px`, height: 'auto' }}
      >
        {/* Axis lines from center to each vertex */}
        {layout.axes.map((p, i) => (
          <line
            key={`axis-${SCAA_CATEGORIES[i]}`}
            data-part="axis"
            x1={0}
            y1={0}
            x2={round(p.x)}
            y2={round(p.y)}
            stroke="var(--border-secondary)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Concentric guide polygons at 33%, 66%, 100% */}
        {layout.guides.map((points) => (
          <polygon
            key={points}
            data-part="guide"
            points={points}
            fill="none"
            stroke="var(--border-primary)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Data polygon — omitted for an all-zero profile */}
        {layout.polygon && (
          <polygon
            data-part="data"
            points={layout.polygon}
            fill="var(--accent-primary)"
            fillOpacity={0.3}
            stroke="var(--accent-primary)"
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Vertex markers keep 1–2 category profiles visible */}
        {layout.markers.map((m) => (
          <circle
            key={`marker-${round(m.x)}-${round(m.y)}`}
            data-part="marker"
            cx={round(m.x)}
            cy={round(m.y)}
            r={m.r}
            fill="var(--accent-primary)"
          />
        ))}

        {/* Category labels, one <tspan> per wrapped line */}
        {layout.labels.map((label, i) => (
          <text
            key={`label-${SCAA_CATEGORIES[i]}`}
            fontSize={layout.fontSize}
            fill="var(--text-secondary)"
            textAnchor={label.anchor}
          >
            {label.lines
              .map((line, li) => ({ line, y: round(label.lineYs[li]) }))
              .map(({ line, y }) => (
                <tspan key={`${line}@${y}`} x={round(label.x)} y={y}>
                  {line}
                </tspan>
              ))}
          </text>
        ))}
      </svg>
    </div>
  );
}
