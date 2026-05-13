import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/index';
import { IntensityDots } from '../recipe/IntensityDots.tsx';

interface TasteNote {
  id: string;
  name: string;
  depth: number;
  parentId: string | null;
}

interface Props {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  /** Per-note intensity (1–3). Defaults to 2 for newly added notes. */
  intensities?: Record<string, number>;
  onIntensitiesChange?: (intensities: Record<string, number>) => void;
}

export function TasteAutocomplete({
  selectedIds,
  onSelectionChange,
  intensities = {},
  onIntensitiesChange,
}: Props) {
  const [query, setQuery] = useState('');
  const [allNotes, setAllNotes] = useState<TasteNote[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  useEffect(() => {
    api.get<TasteNote[]>('/taste-notes/flat').then((data) => {
      setAllNotes(data as TasteNote[]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const groupedResults = useMemo(() => {
    const noteById = new Map(allNotes.map((n) => [n.id, n]));

    function getRootId(note: TasteNote): string | null {
      if (note.depth === 0) return note.id;
      if (!note.parentId) return null;
      const parent = noteById.get(note.parentId);
      if (!parent) return null;
      return getRootId(parent);
    }

    const lower = query.trim().toLowerCase();
    const items = allNotes.filter((n) => n.depth >= 1);

    const filtered = lower
      ? items.filter((n) => n.name.toLowerCase().includes(lower))
      : items;

    function hasChildren(note: TasteNote): boolean {
      return filtered.some((n) => n.parentId === note.id);
    }

    const groups = new Map<string, {
      root: TasteNote;
      subGroups: { parent: TasteNote; children: TasteNote[] }[];
      orphanItems: TasteNote[];
    }>();

    for (const item of filtered) {
      const rootId = getRootId(item);
      if (!rootId) continue;
      const root = noteById.get(rootId);
      if (!root) continue;
      if (!groups.has(rootId)) {
        groups.set(rootId, { root, subGroups: [], orphanItems: [] });
      }
      const group = groups.get(rootId)!;

      if (item.depth === 1 && hasChildren(item)) {
        const existing = group.subGroups.find((sg) => sg.parent.id === item.id);
        if (!existing) {
          group.subGroups.push({ parent: item, children: [] });
        }
      } else if (item.depth === 2) {
        const parentId = item.parentId;
        const depth1Parent = parentId ? noteById.get(parentId) : null;
        if (depth1Parent && depth1Parent.depth === 1 && hasChildren(depth1Parent)) {
          let subGroup = group.subGroups.find((sg) => sg.parent.id === parentId);
          if (!subGroup) {
            subGroup = { parent: depth1Parent, children: [] };
            group.subGroups.push(subGroup);
          }
          subGroup.children.push(item);
        } else {
          group.orphanItems.push(item);
        }
      } else {
        group.orphanItems.push(item);
      }
    }

    const sorted = Array.from(groups.values()).sort((a, b) =>
      a.root.name.localeCompare(b.root.name),
    );

    for (const group of sorted) {
      group.subGroups.sort((a, b) => a.parent.name.localeCompare(b.parent.name));
      for (const sg of group.subGroups) {
        sg.children.sort((a, b) => a.name.localeCompare(b.name));
      }
      group.orphanItems.sort((a, b) =>
        a.depth - b.depth || a.name.localeCompare(b.name),
      );
    }

    return sorted;
  }, [allNotes, query]);

  const selectableIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of groupedResults) {
      for (const sg of group.subGroups) {
        for (const child of sg.children) {
          ids.push(child.id);
        }
      }
      for (const item of group.orphanItems) {
        ids.push(item.id);
      }
    }
    return ids;
  }, [groupedResults]);

  useEffect(() => {
    if (isOpen && selectableIds.length > 0) {
      setHighlightedId((prev) =>
        prev && selectableIds.includes(prev) ? prev : selectableIds[0],
      );
    } else {
      setHighlightedId(null);
    }
  }, [isOpen, selectableIds]);

  useEffect(() => {
    if (highlightedId) {
      const el = itemRefs.current.get(highlightedId);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedId]);

  function toggleNote(id: string) {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((sid) => sid !== id));
      if (onIntensitiesChange) {
        const next = { ...intensities };
        delete next[id];
        onIntensitiesChange(next);
      }
    } else {
      onSelectionChange([...selectedIds, id]);
      if (onIntensitiesChange && !(id in intensities)) {
        onIntensitiesChange({ ...intensities, [id]: 2 }); // default intensity 2
      }
    }
    setQuery('');
  }

  function cycleIntensity(id: string) {
    if (!onIntensitiesChange) return;
    const current = intensities[id] ?? 2;
    const next = current >= 3 ? 1 : current + 1;
    onIntensitiesChange({ ...intensities, [id]: next });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    if (selectableIds.length === 0) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = highlightedId ? selectableIds.indexOf(highlightedId) : -1;
      const nextIdx = idx < selectableIds.length - 1 ? idx + 1 : 0;
      setHighlightedId(selectableIds[nextIdx]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = highlightedId ? selectableIds.indexOf(highlightedId) : 0;
      const nextIdx = idx > 0 ? idx - 1 : selectableIds.length - 1;
      setHighlightedId(selectableIds[nextIdx]);
    } else if (e.key === 'Enter') {
      if (highlightedId) {
        e.preventDefault();
        toggleNote(highlightedId);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }

  const selectedNotes = allNotes.filter((n) => selectedIds.includes(n.id));

  return (
    <div ref={wrapperRef} className='relative'>
      {/* Selected chips with intensity controls */}
      {selectedNotes.length > 0 && (
        <div className='flex flex-wrap gap-2 mb-3'>
          {selectedNotes.map((note) => {
            const intensity = intensities[note.id] ?? 2;
            return (
              <div
                key={note.id}
                className='inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium'
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
              >
                <span>{note.name}</span>
                {/* Clickable intensity dots — cycles 1→2→3→1 */}
                <button
                  type='button'
                  onClick={() => cycleIntensity(note.id)}
                  title={`Intensity ${intensity}/3 — click to change`}
                  style={{ lineHeight: 0, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                  aria-label={`Set intensity for ${note.name}`}
                >
                  <IntensityDots intensity={intensity} />
                </button>
                {/* Remove button */}
                <button
                  type='button'
                  onClick={() => toggleNote(note.id)}
                  style={{
                    lineHeight: 0,
                    cursor: 'pointer',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--text-tertiary)',
                    fontSize: '0.75rem',
                  }}
                  aria-label={`Remove ${note.name}`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      <input
        type='text'
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder='Search SCAA taste notes...'
        className='input-field'
      />

      {isOpen && (
        <ul
          className='absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded border'
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
        >
          {allNotes.length === 0 ? (
            <li
              className='px-3 py-4 text-sm text-center'
              style={{ color: 'var(--text-tertiary)' }}
            >
              Loading taste notes...
            </li>
          ) : groupedResults.length > 0 ? (
            groupedResults.map((group) => (
              <Fragment key={group.root.id}>
                <li
                  className='px-3 py-1.5 text-xs font-semibold select-none cursor-default'
                  style={{ color: 'var(--text-tertiary)' }}
                  aria-hidden='true'
                >
                  {group.root.name}
                </li>
                {group.subGroups.map((sg) => (
                  <Fragment key={sg.parent.id}>
                    <li
                      className='px-3 py-1.5 text-xs font-semibold select-none cursor-default'
                      style={{
                        color: 'var(--text-tertiary)',
                        paddingLeft: '1.25rem',
                      }}
                      aria-hidden='true'
                    >
                      {group.root.name} &gt; {sg.parent.name}
                    </li>
                    {sg.children.map((item) => (
                      <li
                        key={item.id}
                        ref={(el) => {
                          if (el) {
                            itemRefs.current.set(item.id, el);
                          } else {
                            itemRefs.current.delete(item.id);
                          }
                        }}
                        className='cursor-pointer px-3 py-2 flex items-center justify-between'
                        style={{
                          paddingLeft: `${item.depth * 0.75 + 1.5}rem`,
                          color: 'var(--text-primary)',
                          backgroundColor:
                            highlightedId === item.id ? 'var(--bg-secondary)' : undefined,
                        }}
                        onClick={() => toggleNote(item.id)}
                        onMouseEnter={() => setHighlightedId(item.id)}
                        role='option'
                        aria-selected={selectedIds.includes(item.id)}
                      >
                        {selectedIds.includes(item.id) && (
                          <span className='mr-1 text-xs' style={{ color: 'var(--accent-primary)' }}>✓</span>
                        )}
                        <span>{item.name}</span>
                      </li>
                    ))}
                  </Fragment>
                ))}
                {group.orphanItems.map((item) => (
                  <li
                    key={item.id}
                    ref={(el) => {
                      if (el) {
                        itemRefs.current.set(item.id, el);
                      } else {
                        itemRefs.current.delete(item.id);
                      }
                    }}
                    className='cursor-pointer px-3 py-2 flex items-center justify-between'
                    style={{
                      paddingLeft: `${item.depth * 1.5 + 0.75}rem`,
                      color: 'var(--text-primary)',
                      backgroundColor:
                        highlightedId === item.id ? 'var(--bg-secondary)' : undefined,
                    }}
                    onClick={() => toggleNote(item.id)}
                    onMouseEnter={() => setHighlightedId(item.id)}
                    role='option'
                    aria-selected={selectedIds.includes(item.id)}
                  >
                    {selectedIds.includes(item.id) && (
                      <span className='mr-1 text-xs' style={{ color: 'var(--accent-primary)' }}>✓</span>
                    )}
                    <span>{item.name}</span>
                  </li>
                ))}
              </Fragment>
            ))
          ) : (
            <li
              className='px-3 py-4 text-sm text-center'
              style={{ color: 'var(--text-tertiary)' }}
            >
              No taste notes found.
            </li>
          )}
        </ul>
      )}

      <p className='mt-1 text-xs' style={{ color: 'var(--text-tertiary)' }}>
        Click intensity dots on selected notes to adjust (1–3).{' '}
        <a
          href='https://notbadcoffee.com/flavor-wheel-en/'
          target='_blank'
          rel='noopener noreferrer'
          style={{ color: 'var(--accent-primary)' }}
        >
          SCAA Flavor Wheel Reference
        </a>
      </p>
    </div>
  );
}
