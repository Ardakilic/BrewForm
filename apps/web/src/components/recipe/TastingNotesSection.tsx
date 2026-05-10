import { ScaaRadarChart } from './ScaaRadarChart.tsx';
import { IntensityDots } from './IntensityDots.tsx';
import {
  aggregateByCategory,
  resolveRootCategory,
  type TasteNoteForChart,
} from '../../utils/radar-chart-data.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useNavigate } from 'react-router';

interface TasteNote {
  id: string;
  tasteNoteId?: string;  // explicit tasteNoteId from API; falls back to id
  name: string;
  intensity: number; // 1-3
  parentId: string | null;
  depth: number;
  // The root category name (resolved from hierarchy)
  rootCategoryName?: string;
}

interface TastingNotesSectionProps {
  tasteNotes: TasteNote[];
  personalNotes?: string | null;
  // Full hierarchy for resolving root categories
  allTasteNotes?: Array<{ id: string; name: string; parentId: string | null; depth: number }>;
}

/**
 * Resolves the root category name for a taste note.
 * Uses `rootCategoryName` if already set, otherwise walks the hierarchy.
 * Falls back to "Other" if resolution fails.
 */
function getRootCategoryName(
  note: TasteNote,
  allTasteNotes?: Array<{ id: string; name: string; parentId: string | null; depth: number }>
): string {
  if (note.rootCategoryName) {
    return note.rootCategoryName;
  }
  if (allTasteNotes && allTasteNotes.length > 0) {
    // Use tasteNoteId if available, fall back to id (API may send either)
    const lookupId = note.tasteNoteId ?? note.id;
    const resolved = resolveRootCategory(lookupId, allTasteNotes);
    if (resolved) return resolved;
  }
  // If depth=0, the note itself is a root category
  if (note.depth === 0) {
    return note.name;
  }
  return 'Other';
}

export function TastingNotesSection({
  tasteNotes,
  personalNotes,
  allTasteNotes,
}: TastingNotesSectionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const hasTasteNotes = tasteNotes.length > 0;

  // Enrich notes with resolved root category names
  const enrichedNotes: TasteNoteForChart[] = tasteNotes.map((note) => ({
    tasteNoteId: note.tasteNoteId ?? note.id,  // fallback: API may send id instead of tasteNoteId
    intensity: note.intensity,
    name: note.name,
    parentId: note.parentId,
    depth: note.depth,
    rootCategoryName: getRootCategoryName(note, allTasteNotes),
  }));

  // Build category values for the radar chart
  const categoryValues = hasTasteNotes ? aggregateByCategory(enrichedNotes) : {};

  // Group chips by root category name
  const groupedNotes = new Map<string, TasteNote[]>();
  if (hasTasteNotes) {
    for (let i = 0; i < tasteNotes.length; i++) {
      const note = tasteNotes[i];
      const rootName = enrichedNotes[i].rootCategoryName ?? 'Other';
      const existing = groupedNotes.get(rootName);
      if (existing) {
        existing.push(note);
      } else {
        groupedNotes.set(rootName, [note]);
      }
    }
  }

  return (
    <section className='card' aria-label='Tasting notes'>
      {/* Section header */}
      <div className='flex items-center justify-between mb-4'>
        <span
          className='text-xs font-semibold uppercase tracking-widest'
          style={{ color: 'var(--text-tertiary)' }}
        >
          {t('recipe.tastingNotes.title')}
        </span>
      </div>

      {hasTasteNotes && (
        /* Radar chart + grouped chips side by side */
        <div
          className='flex flex-col sm:flex-row gap-6 mb-4'
          style={{ alignItems: 'flex-start' }}
        >
          {/* Left: Radar chart */}
          <div className='flex-shrink-0 flex justify-center sm:justify-start'>
            <div className='hidden sm:block'>
              <ScaaRadarChart categoryValues={categoryValues} size={200} />
            </div>
            <div className='block sm:hidden'>
              <ScaaRadarChart categoryValues={categoryValues} size={160} />
            </div>
          </div>

          {/* Right: Grouped chip columns */}
          <div className='flex-1 flex flex-wrap gap-4'>
            {Array.from(groupedNotes.entries()).map(([category, notes]) => (
              <div key={category} className='flex flex-col gap-2 min-w-0'>
                {/* Category label */}
                <span
                  className='text-xs uppercase tracking-widest font-semibold'
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {category}
                </span>
                {/* Chips */}
                <div className='flex flex-wrap gap-2'>
                  {notes.map((note) => {
                    const noteId = note.tasteNoteId ?? note.id;
                    return (
                      <button
                        key={note.id}
                        type='button'
                        onClick={() => navigate(`/recipes?tasteNoteId=${noteId}`)}
                        className='inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-opacity hover:opacity-75'
                        style={{
                          backgroundColor: 'var(--bg-tertiary)',
                          border: '1px solid var(--border-primary)',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                        }}
                        aria-label={`Filter recipes by ${note.name}`}
                      >
                        <span>{note.name}</span>
                        <IntensityDots intensity={note.intensity} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Personal notes blockquote */}
      {personalNotes && (
        <blockquote
          style={{
            borderLeft: '3px solid var(--accent-primary)',
            paddingLeft: '1rem',
            margin: hasTasteNotes ? '0' : '0',
            color: 'var(--text-secondary)',
          }}
        >
          <p
            className='text-sm'
            style={{
              fontStyle: 'italic',
              lineHeight: '1.6',
              margin: 0,
            }}
          >
            {personalNotes}
          </p>
          <footer
            className='text-xs mt-2 uppercase tracking-widest'
            style={{ color: 'var(--text-tertiary)', fontStyle: 'normal' }}
          >
            {t('recipe.tastingNotes.personalNote')}
          </footer>
        </blockquote>
      )}

      {/* Empty state: no taste notes and no personal notes */}
      {!hasTasteNotes && !personalNotes && (
        <p className='text-sm' style={{ color: 'var(--text-tertiary)' }}>
          {t('recipe.tastingNotes.empty')}
        </p>
      )}
    </section>
  );
}
