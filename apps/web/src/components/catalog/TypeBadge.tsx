interface TypeBadgeProps {
  label: string;
}

/** Small accent-coloured pill showing a catalog entry's type or category label. */
export function TypeBadge({ label }: TypeBadgeProps) {
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2"
      style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--bg-primary)' }}
    >
      {label}
    </span>
  );
}

/** Maps a coffee-variety category (`variety`, `processing`, `market_name`) to its short translated label; unknown categories are returned unchanged. */
export function varietyCategoryLabel(t: (key: string) => string, category: string): string {
  switch (category) {
    case 'variety':
      return t('coffeeVarieties.category.varietyShort');
    case 'processing':
      return t('coffeeVarieties.category.processingShort');
    case 'market_name':
      return t('coffeeVarieties.category.marketNameShort');
    default:
      return category;
  }
}
