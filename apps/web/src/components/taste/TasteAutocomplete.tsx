import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [results, setResults] = useState<TasteNote[]>([]);
  const [allNotes, setAllNotes] = useState<TasteNote[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

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

  const search = useCallback((q: string) => {
    if (q.length < 3) {
      setResults([]);
      return;
    }
    const lower = q.toLowerCase();
    const matched = allNotes.filter((note) => note.name.toLowerCase().includes(lower));
    const parentIds = new Set<string>();
    matched.forEach((note) => {
      if (note.parentId) parentIds.add(note.parentId);
    });
    const expanded = allNotes.filter((note) =>
      matched.some((m) => m.id === note.id) || parentIds.has(note.id)
    );
    const unique = Array.from(new Map(expanded.map((n) => [n.id, n])).values());
    unique.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
    setResults(unique);
  }, [allNotes]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

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
  }

  function cycleIntensity(id: string) {
    if (!onIntensitiesChange) return;
    const current = intensities[id] ?? 2;
    const next = current >= 3 ? 1 : current + 1;
    onIntensitiesChange({ ...intensities, [id]: next });
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
        placeholder='Search SCAA taste notes (type 3+ characters)...'
        className='input-field'
      />

      {isOpen && results.length > 0 && (
        <ul
          className='absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded border'
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
        >
          {results.map((note) => (
            <li
              key={note.id}
              className='cursor-pointer px-3 py-2 hover:opacity-80 flex items-center justify-between'
              style={{
                paddingLeft: `${note.depth * 1.5 + 0.75}rem`,
                color: 'var(--text-primary)',
              }}
              onClick={() => toggleNote(note.id)}
            >
              <span>
                {selectedIds.includes(note.id) ? '✓ ' : ''}
                {note.name}
              </span>
              {note.depth === 0 && (
                <span className='text-xs ml-2' style={{ color: 'var(--text-tertiary)' }}>
                  category
                </span>
              )}
            </li>
          ))}
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
