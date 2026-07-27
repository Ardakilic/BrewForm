interface TypeBadgeProps {
  label: string;
}

export function TypeBadge({ label }: TypeBadgeProps) {
  return (
    <span
      className='text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2'
      style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
    >
      {label}
    </span>
  );
}

export function varietyCategoryLabel(
  t: (key: string) => string,
  category: string,
): string {
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
