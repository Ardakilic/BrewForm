interface BrewTimelineProps {
  extractionTimeSeconds: number | null | undefined;
  preInfusionTimeSeconds?: number | null;
  flowRate?: number | null;
}

function generateAxisMarkers(totalSeconds: number): number[] {
  const markers: number[] = [];
  // Add markers at 0, 5, 10, ... up to the largest multiple of 5 <= totalSeconds
  for (let s = 0; s <= totalSeconds; s += 5) {
    markers.push(s);
  }
  // Add final marker at totalSeconds if it's not already a multiple of 5
  if (totalSeconds % 5 !== 0) {
    markers.push(totalSeconds);
  }
  return markers;
}

export function BrewTimeline({
  extractionTimeSeconds,
  preInfusionTimeSeconds,
  flowRate,
}: BrewTimelineProps) {
  // Hide entirely if extractionTimeSeconds is null/undefined (Req 6.6)
  if (extractionTimeSeconds == null) {
    return null;
  }

  const total = extractionTimeSeconds;
  const preInfusion =
    preInfusionTimeSeconds != null && preInfusionTimeSeconds > 0
      ? preInfusionTimeSeconds
      : null;

  // Segment widths as percentages (Req 6.1, 6.2)
  const preInfusionPct = preInfusion != null ? (preInfusion / total) * 100 : 0;
  const extractionPct = 100 - preInfusionPct;

  const markers = generateAxisMarkers(total);

  return (
    <div className='card'>
      {/* Section header */}
      <div className='flex items-center justify-between mb-4'>
        <span
          className='text-xs font-semibold uppercase tracking-widest'
          style={{ color: 'var(--text-tertiary)' }}
        >
          Brew Timeline
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

      {/* Timeline bar */}
      <div
        className='flex w-full overflow-hidden'
        style={{
          height: '48px',
          borderRadius: '0.5rem',
          border: '1px solid var(--border-primary)',
        }}
        role='img'
        aria-label={`Brew timeline: ${preInfusion != null ? `${preInfusion}s pre-infusion, ` : ''}${preInfusion != null ? total - preInfusion : total}s extraction`}
      >
        {/* Pre-infusion segment (Req 6.2, 6.5) */}
        {preInfusion != null && (
          <div
            className='flex items-center justify-center overflow-hidden flex-shrink-0'
            style={{
              width: `${preInfusionPct}%`,
              backgroundColor: 'var(--bg-tertiary)',
            }}
          >
            <div className='flex flex-col items-center px-2 min-w-0'>
              <span
                className='text-xs font-semibold uppercase tracking-wide truncate'
                style={{ color: 'var(--text-secondary)', fontSize: '0.65rem' }}
              >
                Pre-Infusion
              </span>
              <span
                className='text-xs font-bold'
                style={{ color: 'var(--text-primary)' }}
              >
                {preInfusion}s
              </span>
            </div>
          </div>
        )}

        {/* Extraction segment (Req 6.1, 6.5) */}
        <div
          className='flex items-center justify-center overflow-hidden flex-grow'
          style={{
            width: `${extractionPct}%`,
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          <div className='flex flex-col items-center px-2 min-w-0'>
            <span
              className='text-xs font-semibold uppercase tracking-wide truncate'
              style={{ color: 'var(--text-secondary)', fontSize: '0.65rem' }}
            >
              Extraction
            </span>
            <span
              className='text-xs font-bold'
              style={{ color: 'var(--text-primary)' }}
            >
              {preInfusion != null ? total - preInfusion : total}s
            </span>
          </div>
        </div>
      </div>

      {/* Time axis (Req 6.4) */}
      <div className='relative mt-2' style={{ height: '20px' }}>
        {markers.map((seconds) => {
          const positionPct = (seconds / total) * 100;
          return (
            <div
              key={seconds}
              className='absolute flex flex-col items-center'
              style={{
                left: `${positionPct}%`,
                transform: positionPct === 0
                  ? 'translateX(0)'
                  : positionPct === 100
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)',
                top: 0,
              }}
            >
              <span
                className='text-xs'
                style={{ color: 'var(--text-tertiary)', fontSize: '0.65rem', whiteSpace: 'nowrap' }}
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
