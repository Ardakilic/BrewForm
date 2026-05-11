import { Select } from '@base-ui-components/react/select';

export interface TasteNoteFlat {
  id: string;
  name: string;
  depth: number;
  parentId: string | null;
}

interface TasteNotesFilterProps {
  allTasteNotes: TasteNoteFlat[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  maxSelections?: number;
}

export function TasteNotesFilter({
  allTasteNotes,
  selectedIds,
  onChange,
  placeholder,
  maxSelections = 10,
}: TasteNotesFilterProps) {
  const count = selectedIds.length;

  function handleChange(ids: string[]) {
    if (ids.length <= maxSelections) {
      onChange(ids);
    }
  }

  // Group taste notes by their root ancestor (depth-0)
  const roots = allTasteNotes.filter((n) => n.depth === 0);

  function getRootId(note: TasteNoteFlat): string | null {
    if (note.depth === 0) return note.id;
    if (!note.parentId) return null;
    const parent = allTasteNotes.find((n) => n.id === note.parentId);
    if (!parent) return null;
    return getRootId(parent);
  }

  const itemsByRoot = new Map<string, TasteNoteFlat[]>();
  for (const root of roots) {
    itemsByRoot.set(root.id, []);
  }

  for (const note of allTasteNotes) {
    if (note.depth === 1 || note.depth === 2) {
      const rootId = getRootId(note);
      if (rootId && itemsByRoot.has(rootId)) {
        itemsByRoot.get(rootId)!.push(note);
      }
    }
  }

  const valueText = count === 0 ? placeholder : `${count} selected`;

  return (
    <Select.Root multiple value={selectedIds} onValueChange={handleChange}>
      <Select.Trigger
        className={[
          'flex items-center gap-1.5 rounded-full px-3 py-1 min-h-11',
          'border border-[color:var(--border-primary)]',
          'bg-[color:var(--bg-tertiary)] text-[color:var(--text-primary)]',
          'text-sm cursor-default select-none',
          'transition-colors duration-300 ease-in-out motion-reduce:duration-0',
          'hover:border-[color:var(--border-secondary)]',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1',
          'focus-visible:outline-[color:var(--accent-primary)]',
          'data-[popup-open]:border-[color:var(--accent-primary)]',
        ].join(' ')}
      >
        <Select.Value>{valueText}</Select.Value>
        <Select.Icon className='flex items-center text-[color:var(--text-secondary)]'>
          <svg
            width='10'
            height='6'
            viewBox='0 0 10 6'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.5'
            strokeLinecap='round'
            strokeLinejoin='round'
            aria-hidden='true'
          >
            <path d='M1 1l4 4 4-4' />
          </svg>
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Positioner
          alignItemWithTrigger={false}
          sideOffset={8}
          className='z-50 outline-none select-none'
        >
          <Select.Popup
            className={[
              'min-w-[var(--anchor-width)] rounded-lg py-1',
              'bg-[color:var(--bg-tertiary)]',
              'border border-[color:var(--border-primary)]',
              'shadow-lg',
              'origin-[var(--transform-origin)]',
              'transition-[transform,scale,opacity] duration-150 ease-out motion-reduce:duration-0',
              'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
              'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
            ].join(' ')}
          >
            {roots.map((root) => {
              const items = itemsByRoot.get(root.id) || [];
              if (items.length === 0) return null;
              return (
                <Select.Group key={root.id}>
                  <Select.GroupLabel className='px-3 py-1.5 text-xs font-semibold text-[color:var(--text-tertiary)] cursor-default select-none'>
                    {root.name}
                  </Select.GroupLabel>
                  {items.map((item) => (
                    <Select.Item
                      key={item.id}
                      value={item.id}
                      className={[
                        'grid grid-cols-[1rem_1fr] items-center gap-2 px-3 py-2',
                        'text-sm text-[color:var(--text-primary)] cursor-default',
                        'outline-none select-none rounded-md mx-1',
                        'data-[highlighted]:bg-[color:var(--bg-secondary)] data-[highlighted]:text-[color:var(--text-primary)]',
                        'transition-colors duration-150 ease-in-out motion-reduce:duration-0',
                      ].join(' ')}
                    >
                      <Select.ItemIndicator className='col-start-1 flex items-center justify-center text-[color:var(--accent-primary)]'>
                        <svg
                          width='12'
                          height='12'
                          viewBox='0 0 12 12'
                          fill='none'
                          stroke='currentColor'
                          strokeWidth='2'
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          aria-hidden='true'
                        >
                          <path d='M2 6l3 3 5-5' />
                        </svg>
                      </Select.ItemIndicator>
                      <Select.ItemText className='col-start-2'>{item.name}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Group>
              );
            })}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
