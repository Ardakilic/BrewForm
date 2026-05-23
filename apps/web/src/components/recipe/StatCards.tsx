import { buildStatCards } from '../../utils/stat-cards.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';

interface StatCardsProps {
  version: {
    groundWeightGrams?: number | null;
    extractionVolumeMl?: number | null;
    extractionTimeSeconds?: number | null;
    brewRatio?: number | null;
    temperatureCelsius?: number | null;
    tds?: number | null;
  };
}

export function StatCards({ version }: StatCardsProps) {
  const { t } = useTranslation();
  const cards = buildStatCards(version, 'metric');

  return (
    <div className='flex flex-row overflow-x-auto gap-3 md:grid md:grid-cols-5 lg:grid-cols-6 md:overflow-visible'>
      {cards.map((card) => (
        <div
          key={card.label}
          className='flex flex-col rounded-lg p-4 min-w-[80px] flex-shrink-0 md:flex-shrink md:min-w-0 bg-[color:var(--bg-secondary)] border border-[color:var(--border-primary)]'
        >
          <span className='text-xs uppercase tracking-widest text-[color:var(--text-tertiary)]'>
            {t(card.label)}
          </span>
          <span className='text-2xl font-bold mt-1 text-[color:var(--text-primary)]'>
            {card.value}
          </span>
        </div>
      ))}
    </div>
  );
}
