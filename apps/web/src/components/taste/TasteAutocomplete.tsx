import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../api/index';

interface TasteNote {
  id: string;
  name: string;
  depth: number;
  parentId: string | null;
}

interface Props {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function TasteAutocomplete({ selectedIds, onSelectionChange }: Props) {
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
      matched.some((m) => m.id === note.id) || parentIds.has(note.id),
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
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  }

  const selectedNotes = allNotes.filter((n) => selectedIds.includes(n.id));

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex flex-wrap gap-2 mb-2">
        {selectedNotes.map((note) => (
          <span
            key={note.id}
            className="badge cursor-pointer"
            onClick={() => toggleNote(note.id)}
          >
            {note.name} ×
          </span>
        ))}
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="Search taste notes (type 3+ characters)..."
        className="input-field"
      />
      {isOpen && results.length > 0 && (
        <ul
          className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded border"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
        >
          {results.map((note) => (
            <li
              key={note.id}
              className="cursor-pointer px-3 py-2 hover:opacity-80"
              style={{ paddingLeft: `${note.depth * 1.5 + 0.75}rem`, color: 'var(--text-primary)' }}
              onClick={() => toggleNote(note.id)}
            >
              {selectedIds.includes(note.id) ? '✓ ' : ''}{note.name}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        <a
          href="https://notbadcoffee.com/flavor-wheel-en/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent-primary)' }}
        >
          SCAA Flavor Wheel Reference
        </a>
      </p>
    </div>
  );
}