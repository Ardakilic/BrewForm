import { buildStatCards } from '../../utils/stat-cards.ts';

interface StatCardsProps {
  version: {
    groundWeightGrams?: number | null;
    extractionVolumeMl?: number | null;
    extractionTimeSeconds?: number | null;
    brewRatio?: number | null;
    temperatureCelsius?: number | null;
  };
}

export function StatCards({ version }: StatCardsProps) {
  const cards = buildStatCards(version);

  return (
    <div className='flex flex-row overflow-x-auto gap-3 md:grid md:grid-cols-5 md:overflow-visible'>
      {cards.map((card) => (
        <div
          key={card.label}
          className='flex flex-col rounded-lg p-4 min-w-[80px] flex-shrink-0 md:flex-shrink md:min-w-0'
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
          }}
        >
          <span
            className='text-xs uppercase tracking-widest'
            style={{ color: 'var(--text-tertiary)' }}
          >
            {card.label}
          </span>
          <span
            className='text-2xl font-bold mt-1'
            style={{ color: 'var(--text-primary)' }}
          >
            {card.value}
          </span>
        </div>
      ))}
    </div>
  );
}
