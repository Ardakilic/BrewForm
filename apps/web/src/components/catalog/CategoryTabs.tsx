export interface CategoryTab {
  value: string;
  label: string;
}

interface CategoryTabsProps {
  tabs: CategoryTab[];
  active: string;
  onSelect: (value: string) => void;
}

export function CategoryTabs({ tabs, active, onSelect }: CategoryTabsProps) {
  return (
    <div className='flex flex-wrap gap-2 mb-4'>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type='button'
          onClick={() => onSelect(tab.value)}
          className={[
            'rounded-full px-3 py-1.5 text-sm transition-colors',
            active === tab.value
              ? 'bg-[color:var(--accent-primary)] text-white'
              : 'bg-[color:var(--bg-tertiary)] text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-primary)]',
          ].join(' ')}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
