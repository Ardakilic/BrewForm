import { useEffect, useId, useRef } from 'react';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { computeTimelineModel, layoutPhaseLabels } from '../../utils/brew-timeline.ts';
import { clampPct, durationTicks, MIN_CHART_WIDTH_PX } from '../../utils/chart/index.ts';
import { formatDecimal, formatDuration, formatDurationTick } from '../../utils/format.ts';
import { createLogger } from '../../utils/logger.ts';
import { useElementWidth } from '../../utils/useElementWidth.ts';

const log = createLogger('BrewTimeline');

interface BrewTimelineProps {
  extractionTimeSeconds: number | null | undefined;
  preInfusionTimeSeconds?: number | null;
  flowRate?: number | null;
}

/** SVG coordinate space of the stretched shape layer. */
const SVG_W = 1000;
const SVG_H = 120;

/** CSS transform that anchors a tick label at its position. */
const TICK_TRANSFORM = {
  start: 'translateX(0)',
  middle: 'translateX(-50%)',
  end: 'translateX(-100%)',
} as const;

/**
 * Returns two SVG path strings:
 *  - `fill`: closed area path (curve + bottom edge) for the gradient fill
 *  - `stroke`: open path (curve only) for the line on top
 *
 * Shape:
 *  - Pre-infusion phase (0 → preX): cubic ease-in rise from bottom to plateau
 *  - Extraction phase (preX → width): flat plateau at the top
 */
function buildPaths(
  width: number,
  height: number,
  preInfusionPct: number,
): { fill: string; stroke: string } {
  const bottom = height;
  const top = height * 0.1; // plateau height (10% from top)
  const preX = (clampPct(preInfusionPct) / 100) * width;

  if (preX <= 0) {
    // No pre-infusion: flat line at plateau across full width
    const stroke = `M 0 ${top} L ${width} ${top}`;
    const fill = `M 0 ${top} L ${width} ${top} L ${width} ${bottom} L 0 ${bottom} Z`;
    return { fill, stroke };
  }

  // Cubic bezier rise:
  //   starts at bottom-left (0, bottom)
  //   cp1: 55% of preX horizontally, still at bottom (slow start)
  //   cp2: at preX, very close to top (fast finish)
  //   end: (preX, top)
  const cp1x = preX * 0.55;
  const cp1y = bottom;
  const cp2x = preX * 0.98;
  const cp2y = top + (bottom - top) * 0.04;

  const curvePart = `M 0 ${bottom} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${preX} ${top}`;
  const plateauPart = `L ${width} ${top}`;

  const stroke = `${curvePart} ${plateauPart}`;
  const fill = `${stroke} L ${width} ${bottom} L 0 ${bottom} Z`;

  return { fill, stroke };
}

/**
 * Brew timeline: an eased pre-infusion rise into an extraction plateau.
 *
 * - The stretched SVG (`preserveAspectRatio="none"`) holds shapes only, with
 *   non-scaling strokes; phase titles and durations are HTML boxes confined to
 *   their phase, and any duration that does not fit moves to a caption row.
 * - The time axis comes from `durationTicks` at the 200px minimum width
 *   (≤ 8 ticks, never overlapping at any wider width).
 * - One `role="img"` element carries the formatted phase durations.
 * - Renders nothing for a missing, non-finite or ≤ 0 total; a pre-infusion
 *   ≥ the total is ignored (single phase) and logged once per mount.
 */
export function BrewTimeline({
  extractionTimeSeconds,
  preInfusionTimeSeconds,
  flowRate,
}: BrewTimelineProps) {
  const { t, locale } = useTranslation();
  const chartRef = useRef<HTMLDivElement>(null);
  const chartWidth = useElementWidth(chartRef, MIN_CHART_WIDTH_PX);
  const gradientId = useId();
  const warnedRef = useRef(false);

  const model = computeTimelineModel(extractionTimeSeconds, preInfusionTimeSeconds);
  const inconsistent = model?.inconsistent ?? false;

  useEffect(() => {
    if (!inconsistent || warnedRef.current) return;
    warnedRef.current = true;
    log.warn(
      { extractionTimeSeconds, preInfusionTimeSeconds },
      'inconsistent pre-infusion ignored',
    );
  }, [inconsistent, extractionTimeSeconds, preInfusionTimeSeconds]);

  if (!model) return null;

  const labels = layoutPhaseLabels(model, chartWidth, locale);
  const ticks = durationTicks(model.total, {
    widthPx: MIN_CHART_WIDTH_PX,
    formatTick: (seconds, step) => formatDurationTick(seconds, step, locale),
    formatTotal: (seconds) => formatDuration(seconds, locale),
  });
  const { fill: fillPath, stroke: strokePath } = buildPaths(SVG_W, SVG_H, model.preInfusionPct);
  const dividerX = (clampPct(model.preInfusionPct) / 100) * SVG_W;
  const hasSplit = model.phases.length === 2;

  const [first, second] = model.phases;
  const accessibleName = hasSplit
    ? t('a11y.brewTimeline')
        .replace('{preInfusion}', formatDuration(first.seconds, locale))
        .replace('{extraction}', formatDuration(second.seconds, locale))
    : t('a11y.brewTimelineNoPreInfusion').replace(
        '{extraction}',
        formatDuration(first.seconds, locale),
      );

  const showFlowRate = typeof flowRate === 'number' && Number.isFinite(flowRate);

  return (
    <div className="card">
      {/* Header: title and flow rate wrap as whole items */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-[color:var(--text-tertiary)]">
          {t('recipe.brewTimeline.title')}
        </span>
        {showFlowRate && (
          <span className="text-sm font-medium whitespace-nowrap text-[color:var(--text-secondary)]">
            {t('recipe.brewTimeline.flowRate').replace(
              '{value}',
              formatDecimal(flowRate, locale, 1),
            )}
          </span>
        )}
      </div>

      <div role="img" aria-label={accessibleName}>
        {/* Chart: stretched shape layer + HTML phase labels */}
        <div
          ref={chartRef}
          aria-hidden="true"
          className="relative w-full h-[80px] overflow-hidden rounded-lg"
        >
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            preserveAspectRatio="none"
            width="100%"
            height="100%"
            className="absolute inset-0 block"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.5" />
                <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0.1" />
              </linearGradient>
            </defs>

            {/* Chart background */}
            <rect x="0" y="0" width={SVG_W} height={SVG_H} fill="var(--bg-secondary)" />

            {/* Pre-infusion zone background (slightly darker) */}
            {hasSplit && (
              <rect x="0" y="0" width={dividerX} height={SVG_H} fill="var(--bg-tertiary)" />
            )}

            {/* Gradient fill under the curve */}
            <path d={fillPath} fill={`url(#${gradientId})`} />

            {/* Curve stroke */}
            <path
              d={strokePath}
              fill="none"
              stroke="var(--accent-primary)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />

            {/* Vertical divider at pre-infusion / extraction boundary */}
            {hasSplit && (
              <line
                x1={dividerX}
                y1="0"
                x2={dividerX}
                y2={SVG_H}
                stroke="var(--border-secondary)"
                strokeWidth="1"
                strokeOpacity="0.6"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* Phase labels: HTML boxes confined to their phase */}
          {labels.phases.map((phase) => (
            <div
              key={phase.kind}
              data-phase={phase.kind}
              className="absolute top-0 bottom-0 flex flex-col items-center justify-center gap-0.5"
              style={{
                left: `${clampPct(phase.startPct)}%`,
                width: `${clampPct(phase.widthPct)}%`,
              }}
            >
              {phase.showTitle && (
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] leading-tight whitespace-nowrap text-[color:var(--text-secondary)]">
                  {phase.title}
                </span>
              )}
              {phase.showValue && (
                <span className="text-lg font-bold leading-tight whitespace-nowrap text-[color:var(--text-primary)]">
                  {phase.value}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Caption: phase durations that do not fit inside their phase */}
        {labels.caption.length > 0 && (
          <div
            data-testid="brew-timeline-caption"
            aria-hidden="true"
            className="mt-1 flex flex-wrap gap-x-3 text-xs text-[color:var(--text-secondary)]"
          >
            {labels.caption.map((item) => (
              <span key={item.kind} className="whitespace-nowrap">
                <span className="font-semibold uppercase tracking-[0.05em]">{item.title}</span>{' '}
                <span className="font-bold text-[color:var(--text-primary)]">{item.value}</span>
              </span>
            ))}
          </div>
        )}

        {/* Time axis */}
        <div data-testid="brew-timeline-axis" aria-hidden="true" className="relative mt-1 h-[16px]">
          {ticks.map((tick) => (
            <span
              key={tick.value}
              className="absolute top-0 text-[0.65rem] leading-4 whitespace-nowrap text-[color:var(--text-secondary)]"
              style={{ left: `${clampPct(tick.pct)}%`, transform: TICK_TRANSFORM[tick.anchor] }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
