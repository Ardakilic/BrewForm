/** One filter pill of {@link CategoryTabs}: the value it selects and its translated label. */
export interface CategoryTab {
  value: string;
  label: string;
}

interface CategoryTabsProps {
  tabs: CategoryTab[];
  active: string;
  onSelect: (value: string) => void;
}

/**
 * Row of pill buttons that filters a catalog page by category. Highlights the tab whose value
 * equals `active` and calls `onSelect` with a tab's value on click; holds no state itself.
 */
export function CategoryTabs({ tabs, active, onSelect }: CategoryTabsProps) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onSelect(tab.value)}
          className={[
            'rounded-full px-3 py-1.5 text-sm transition-colors',
            active === tab.value
              ? 'bg-[color:var(--accent-primary)] text-[color:var(--bg-primary)]'
              : 'bg-[color:var(--bg-tertiary)] text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-primary)]',
          ].join(' ')}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
