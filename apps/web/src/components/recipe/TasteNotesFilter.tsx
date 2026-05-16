import { useMemo, useState } from 'react';
import { Select } from '@base-ui/react/select';

export interface TasteNoteFlat {
  id: string;
  name: string;
  depth: number;
  parentId: string | null;
}

interface SubGroup {
  parent: TasteNoteFlat;
  children: TasteNoteFlat[];
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
  const [searchQuery, setSearchQuery] = useState('');

  function handleChange(ids: string[]) {
    if (ids.length <= maxSelections) {
      onChange(ids);
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setSearchQuery('');
    }
  }

  const noteById = useMemo(() => new Map(allTasteNotes.map((n) => [n.id, n])), [allTasteNotes]);

  function getRootId(note: TasteNoteFlat): string | null {
    if (note.depth === 0) return note.id;
    if (!note.parentId) return null;
    const parent = noteById.get(note.parentId);
    if (!parent) return null;
    return getRootId(parent);
  }

  function hasChildren(note: TasteNoteFlat): boolean {
    return allTasteNotes.some((n) => n.parentId === note.id);
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const visibleRoots = useMemo(() => {
    const roots = allTasteNotes.filter((n) => n.depth === 0);

    const rootGroups = roots.map((root) => {
      const subGroups: SubGroup[] = [];
      const orphanItems: TasteNoteFlat[] = [];

      const items = allTasteNotes.filter((n) => {
        if (n.depth < 1) return false;
        const rootId = getRootId(n);
        return rootId === root.id;
      });

      const filtered = normalizedQuery
        ? items.filter((item) => item.name.toLowerCase().includes(normalizedQuery))
        : items;

      for (const item of filtered) {
        const itemHasChildren = hasChildren(item);

        if (item.depth === 1 && itemHasChildren) {
          const existing = subGroups.find((sg) => sg.parent.id === item.id);
          if (!existing) {
            subGroups.push({ parent: item, children: [] });
          }
        } else if (item.depth === 2) {
          const depth1Parent = item.parentId ? noteById.get(item.parentId) : null;
          if (depth1Parent && depth1Parent.depth === 1 && hasChildren(depth1Parent)) {
            let subGroup = subGroups.find((sg) => sg.parent.id === item.parentId);
            if (!subGroup) {
              subGroup = { parent: depth1Parent, children: [] };
              subGroups.push(subGroup);
            }
            subGroup.children.push(item);
          } else {
            orphanItems.push(item);
          }
        } else {
          orphanItems.push(item);
        }
      }

      subGroups.sort((a, b) => a.parent.name.localeCompare(b.parent.name));
      for (const sg of subGroups) {
        sg.children.sort((a, b) => a.name.localeCompare(b.name));
      }
      orphanItems.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));

      return {
        root,
        subGroups,
        orphanItems,
      };
    }).filter((g) => g.subGroups.length > 0 || g.orphanItems.length > 0);

    rootGroups.sort((a, b) => a.root.name.localeCompare(b.root.name));
    return rootGroups;
  }, [allTasteNotes, normalizedQuery, noteById]);

  const hasVisibleItems = visibleRoots.length > 0;

  const valueText = count === 0 ? placeholder : `${count} selected`;

  return (
    <Select.Root
      multiple
      value={selectedIds}
      onValueChange={handleChange}
      onOpenChange={handleOpenChange}
    >
      <Select.Trigger
        className={[
          'flex items-center justify-between gap-1.5 w-full rounded-lg py-2 px-3',
          'border border-[color:var(--border-primary)]',
          'bg-[color:var(--bg-primary)] text-[color:var(--text-primary)]',
          'text-sm cursor-default select-none',
          'transition-[border-color] duration-150 ease',
          'hover:border-[color:var(--border-secondary)]',
          'focus-visible:outline-none focus-visible:border-[color:var(--accent-primary)]',
          'focus-visible:shadow-[0_0_0_3px_rgba(111,78,55,0.1)]',
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
              'min-w-[var(--anchor-width)] max-h-80 overflow-y-auto rounded-lg py-1',
              'bg-[color:var(--bg-tertiary)]',
              'border border-[color:var(--border-primary)]',
              'shadow-lg',
              'origin-[var(--transform-origin)]',
              'transition-[transform,scale,opacity] duration-150 ease-out motion-reduce:duration-0',
              'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
              'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
            ].join(' ')}
          >
            {/* Search input */}
            <div className='px-3 py-2 sticky top-0 bg-[color:var(--bg-tertiary)] z-10 border-b border-[color:var(--border-primary)]'>
              <input
                type='text'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='Search taste notes...'
                className={[
                  'w-full rounded-md py-1.5 px-2.5 text-sm',
                  'bg-[color:var(--bg-primary)]',
                  'border border-[color:var(--border-primary)]',
                  'text-[color:var(--text-primary)]',
                  'placeholder:text-[color:var(--text-tertiary)]',
                  'focus:outline-none focus:border-[color:var(--accent-primary)]',
                ].join(' ')}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>

            <Select.ScrollUpArrow
              className='flex items-center justify-center py-1 text-[color:var(--text-tertiary)] cursor-default'
              keepMounted={false}
            >
              <svg
                width='10'
                height='6'
                viewBox='0 0 10 6'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.5'
              >
                <path d='M1 5l4-4 4 4' />
              </svg>
            </Select.ScrollUpArrow>

            <Select.List>
              {hasVisibleItems
                ? (
                  visibleRoots.map(({ root, subGroups, orphanItems }) => (
                    <Select.Group key={root.id}>
                      <Select.GroupLabel className='px-3 py-1.5 text-xs font-semibold text-[color:var(--text-tertiary)] cursor-default select-none'>
                        {root.name}
                      </Select.GroupLabel>
                      {subGroups.map((sg) => (
                        <div key={sg.parent.id}>
                          <div
                            className='px-3 py-1 text-xs font-semibold text-[color:var(--text-tertiary)] select-none'
                            style={{ paddingLeft: '1.25rem' }}
                            aria-hidden='true'
                          >
                            {root.name} &gt; {sg.parent.name}
                          </div>
                          {sg.children.map((item) => (
                            <Select.Item
                              key={item.id}
                              value={item.id}
                              className={[
                                'grid grid-cols-[1rem_1fr] items-center gap-2 px-3 py-2',
                                'text-sm text-[color:var(--text-primary)] cursor-default',
                                'outline-none select-none',
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
                        </div>
                      ))}
                      {orphanItems.map((item) => (
                        <Select.Item
                          key={item.id}
                          value={item.id}
                          className={[
                            'grid grid-cols-[1rem_1fr] items-center gap-2 px-3 py-2',
                            'text-sm text-[color:var(--text-primary)] cursor-default',
                            'outline-none select-none',
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
                  ))
                )
                : (
                  <div className='px-3 py-4 text-sm text-center text-[color:var(--text-tertiary)]'>
                    No taste notes found.
                  </div>
                )}
            </Select.List>

            <Select.ScrollDownArrow
              className='flex items-center justify-center py-1 text-[color:var(--text-tertiary)] cursor-default'
              keepMounted={false}
            >
              <svg
                width='10'
                height='6'
                viewBox='0 0 10 6'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.5'
              >
                <path d='M1 1l4 4 4-4' />
              </svg>
            </Select.ScrollDownArrow>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
