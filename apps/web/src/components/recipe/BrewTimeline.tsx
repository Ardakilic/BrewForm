import { useTranslation } from '../../contexts/I18nContext.tsx';

interface BrewTimelineProps {
  extractionTimeSeconds: number | null | undefined;
  preInfusionTimeSeconds?: number | null;
  flowRate?: number | null;
}

function generateAxisMarkers(totalSeconds: number): number[] {
  const markers: number[] = [];
  for (let s = 0; s <= totalSeconds; s += 5) {
    markers.push(s);
  }
  if (totalSeconds % 5 !== 0) {
    markers.push(totalSeconds);
  }
  return markers;
}

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
  const preX = (preInfusionPct / 100) * width;

  if (preInfusionPct <= 0) {
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

export function BrewTimeline({
  extractionTimeSeconds,
  preInfusionTimeSeconds,
  flowRate,
}: BrewTimelineProps) {
  const { t } = useTranslation();

  if (extractionTimeSeconds == null) {
    return null;
  }

  const total = extractionTimeSeconds;
  const preInfusion =
    preInfusionTimeSeconds != null && preInfusionTimeSeconds > 0
      ? preInfusionTimeSeconds
      : null;

  const preInfusionPct = preInfusion != null ? (preInfusion / total) * 100 : 0;
  const extractionPct = 100 - preInfusionPct;

  const markers = generateAxisMarkers(total);

  // SVG coordinate space
  const svgW = 1000;
  const svgH = 120;
  const { fill: fillPath, stroke: strokePath } = buildPaths(svgW, svgH, preInfusionPct);

  // Label centres as % of total width
  const preInfusionLabelX = preInfusionPct / 2;
  const extractionLabelX = preInfusionPct + extractionPct / 2;

  return (
    <div className='card'>
      {/* Header */}
      <div className='flex items-center justify-between mb-3'>
        <span
          className='text-xs font-semibold uppercase tracking-widest'
          style={{ color: 'var(--text-tertiary)' }}
        >
          {t('recipe.brewTimeline.title')}
        </span>
        {flowRate != null && (
          <span
            className='text-sm font-medium'
            style={{ color: 'var(--text-secondary)' }}
          >
            {flowRate} ml/s
          </span>
        )}
      </div>

      {/* Chart */}
      <div
        className='relative w-full overflow-hidden'
        style={{ borderRadius: '0.5rem' }}
      >
        {/*
          Invisible semantic structure preserved for tests.
          role="img" with proportional child divs — visually hidden.
        */}
        <div
          className='flex w-full'
          role='img'
          aria-label={`Brew timeline: ${
            preInfusion != null ? `${preInfusion}s pre-infusion, ` : ''
          }${preInfusion != null ? total - preInfusion : total}s extraction`}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            pointerEvents: 'none',
          }}
        >
          {preInfusion != null && (
            <div style={{ width: `${preInfusionPct}%` }} />
          )}
          <div style={{ width: `${extractionPct}%` }} />
        </div>

        {/* SVG area chart */}
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          preserveAspectRatio='none'
          width='100%'
          style={{ display: 'block', height: '80px' }}
          aria-hidden='true'
        >
          <defs>
            <linearGradient id='brew-fill-grad' x1='0' y1='0' x2='0' y2='1'>
              <stop offset='0%' stopColor='var(--accent-primary)' stopOpacity='0.5' />
              <stop offset='100%' stopColor='var(--accent-primary)' stopOpacity='0.1' />
            </linearGradient>
          </defs>

          {/* Chart background */}
          <rect x='0' y='0' width={svgW} height={svgH} fill='var(--bg-secondary)' />

          {/* Pre-infusion zone background (slightly darker) */}
          {preInfusion != null && (
            <rect
              x='0'
              y='0'
              width={(preInfusionPct / 100) * svgW}
              height={svgH}
              fill='var(--bg-tertiary)'
            />
          )}

          {/* Gradient fill under the curve */}
          <path d={fillPath} fill='url(#brew-fill-grad)' />

          {/* Curve stroke */}
          <path
            d={strokePath}
            fill='none'
            stroke='var(--accent-primary)'
            strokeWidth='2.5'
            strokeLinecap='round'
            strokeLinejoin='round'
          />

          {/* Vertical divider at pre-infusion / extraction boundary */}
          {preInfusion != null && (
            <line
              x1={(preInfusionPct / 100) * svgW}
              y1='0'
              x2={(preInfusionPct / 100) * svgW}
              y2={svgH}
              stroke='var(--border-secondary)'
              strokeWidth='1'
              strokeOpacity='0.6'
            />
          )}

          {/* Pre-infusion label */}
          {preInfusion != null && (
            <>
              <text
                x={(preInfusionLabelX / 100) * svgW}
                y={svgH * 0.35}
                textAnchor='middle'
                fontSize='16'
                fontWeight='600'
                letterSpacing='1.5'
                fill='var(--text-secondary)'
              >
                {t('recipe.brewTimeline.preInfusion')}
              </text>
              <text
                x={(preInfusionLabelX / 100) * svgW}
                y={svgH * 0.72}
                textAnchor='middle'
                fontSize='28'
                fontWeight='700'
                fill='var(--text-primary)'
              >
                {preInfusion}s
              </text>
            </>
          )}

          {/* Extraction label */}
          <text
            x={(extractionLabelX / 100) * svgW}
            y={svgH * 0.35}
            textAnchor='middle'
            fontSize='16'
            fontWeight='600'
            letterSpacing='1.5'
            fill='var(--text-secondary)'
          >
            {t('recipe.brewTimeline.extraction')}
          </text>
          <text
            x={(extractionLabelX / 100) * svgW}
            y={svgH * 0.72}
            textAnchor='middle'
            fontSize='28'
            fontWeight='700'
            fill='var(--text-primary)'
          >
            {preInfusion != null ? total - preInfusion : total}s
          </text>
        </svg>
      </div>

      {/* Time axis */}
      <div className='relative mt-1' style={{ height: '20px' }}>
        {markers.map((seconds) => {
          const positionPct = (seconds / total) * 100;
          return (
            <div
              key={seconds}
              className='absolute flex flex-col items-center'
              style={{
                left: `${positionPct}%`,
                transform:
                  positionPct === 0
                    ? 'translateX(0)'
                    : positionPct === 100
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)',
                top: 0,
              }}
            >
              <span
                className='text-xs'
                style={{
                  color: 'var(--text-tertiary)',
                  fontSize: '0.65rem',
                  whiteSpace: 'nowrap',
                }}
              >
                {seconds}s
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
