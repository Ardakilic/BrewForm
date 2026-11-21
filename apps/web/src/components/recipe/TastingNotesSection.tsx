import { useNavigate } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import {
  aggregateByCategory,
  resolveRootCategory,
  scaaCategoryLabelKey,
  type TasteNoteForChart,
} from '../../utils/radar-chart-data.ts';
import { IntensityDots } from './IntensityDots.tsx';
import { ScaaRadarChart } from './ScaaRadarChart.tsx';

interface TasteNote {
  id: string;
  tasteNoteId?: string | null; // explicit tasteNoteId from API; falls back to id
  name: string;
  intensity: number; // 1-3
  parentId: string | null;
  depth: number;
  // The root category name (resolved from hierarchy)
  rootCategoryName?: string | null;
}

interface TastingNotesSectionProps {
  tasteNotes: TasteNote[];
  /** The author's public brewer notes (`currentVersion.personalNotes`), shown read-only. */
  personalNotes?: string | null;
  // Full hierarchy for resolving root categories
  allTasteNotes?: Array<{ id: string; name: string; parentId: string | null; depth: number }>;
}

/**
 * Resolves the root category name for a taste note.
 * Uses `rootCategoryName` if already set, otherwise walks the hierarchy.
 * Returns null if resolution is not possible (hierarchy not loaded).
 */
function getRootCategoryName(
  note: TasteNote,
  allTasteNotes?: Array<{ id: string; name: string; parentId: string | null; depth: number }>,
): string | null {
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
  // Cannot resolve without hierarchy data — return null to signal incomplete resolution
  return null;
}

/**
 * Tasting-notes card: one SCAA radar chart (when every note resolves to a
 * root category) plus intensity chips grouped by category, each linking
 * to the filtered recipe list. Also shows the author's public brewer notes
 * (`personalNotes` on the wire) read-only, labelled `recipe.tastingNotes.brewerNote`, for every
 * viewer including the author; the viewer's private notes live in `RecipeNotesSection`.
 *
 * The card is a container-query `@container`: the chart sits beside the chip
 * groups only when the card is at least 520px wide, and above them otherwise.
 * Chip-group headings that name an SCAA category use the translated
 * `taste.category.*` label; other root names are shown as-is.
 */
export function TastingNotesSection({
  tasteNotes,
  personalNotes,
  allTasteNotes,
}: TastingNotesSectionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const hasTasteNotes = tasteNotes.length > 0;

  /** Translated heading for an SCAA category name, or the raw root name. */
  const categoryHeading = (name: string): string => {
    const key = scaaCategoryLabelKey(name);
    return key ? t(key) : name;
  };

  // Enrich notes with resolved root category names
  const enrichedNotes: TasteNoteForChart[] = tasteNotes.map((note) => ({
    tasteNoteId: note.tasteNoteId ?? note.id, // fallback: API may send id instead of tasteNoteId
    intensity: note.intensity,
    name: note.name,
    parentId: note.parentId,
    depth: note.depth,
    rootCategoryName: getRootCategoryName(note, allTasteNotes),
  }));

  // Build category values for the radar chart
  const aggregation = hasTasteNotes
    ? aggregateByCategory(enrichedNotes)
    : { values: {}, allResolved: false };
  const showChart = hasTasteNotes && aggregation.allResolved;

  // Group chips by root category name (use resolved name or fall back to note name for display)
  const groupedNotes = new Map<string, TasteNote[]>();
  if (hasTasteNotes) {
    for (let i = 0; i < tasteNotes.length; i++) {
      const note = tasteNotes[i];
      const rootName = enrichedNotes[i].rootCategoryName ?? note.name;
      const existing = groupedNotes.get(rootName);
      if (existing) {
        existing.push(note);
      } else {
        groupedNotes.set(rootName, [note]);
      }
    }
  }

  return (
    <section className="card @container" aria-label={t('a11y.tastingNotes.section')}>
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold uppercase tracking-widest text-[color:var(--text-tertiary)]">
          {t('recipe.tastingNotes.title')}
        </span>
      </div>

      {hasTasteNotes && (
        /* Radar chart + grouped chips: stacked in a narrow card, side by side from 520px */
        <div
          data-testid="tasting-notes-layout"
          className="flex flex-col @min-[520px]:flex-row gap-6 mb-4 items-start"
        >
          {/* Radar chart — a single responsive instance, only when all categories resolve */}
          {showChart && (
            <div className="w-full max-w-[280px] shrink-0 self-center @min-[520px]:w-[280px] @min-[520px]:self-start">
              <ScaaRadarChart categoryValues={aggregation.values} />
            </div>
          )}

          {/* Grouped chip columns */}
          <div className="flex-1 min-w-0 flex flex-wrap gap-4">
            {Array.from(groupedNotes.entries()).map(([category, notes]) => (
              <div key={category} className="flex flex-col gap-2 min-w-0">
                {/* Category label — translated when it names an SCAA category */}
                <span className="text-xs uppercase tracking-widest font-semibold text-[color:var(--text-tertiary)]">
                  {categoryHeading(category)}
                </span>
                {/* Chips */}
                <div className="flex flex-wrap gap-2">
                  {notes.map((note) => {
                    const noteId = note.tasteNoteId ?? note.id;
                    return (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => navigate(`/recipes?tasteNoteIds=${noteId}`)}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-opacity hover:opacity-75 bg-[color:var(--bg-tertiary)] border border-[color:var(--border-primary)] text-[color:var(--text-primary)] cursor-pointer"
                        aria-label={t('a11y.tastingNotes.filterBy').replace('{name}', note.name)}
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

      {/* The author's public brewer note */}
      {personalNotes && (
        <blockquote className="[border-left:3px_solid_var(--accent-primary)] pl-4 m-0 text-[color:var(--text-secondary)]">
          <p className="text-sm italic leading-[1.6] m-0">{personalNotes}</p>
          <footer className="text-xs mt-2 uppercase tracking-widest text-[color:var(--text-tertiary)] not-italic">
            {t('recipe.tastingNotes.brewerNote')}
          </footer>
        </blockquote>
      )}

      {/* Empty state: no taste notes and no brewer note */}
      {!hasTasteNotes && !personalNotes && (
        <p className="text-sm text-[color:var(--text-tertiary)]">
          {t('recipe.tastingNotes.empty')}
        </p>
      )}
    </section>
  );
}
