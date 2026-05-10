/**
 * Tests for TastingNotesSection component
 *
 * Property 8: Taste note grouping and intensity display
 * Validates: Requirements 8.3, 8.4
 *
 * For any set of taste notes with hierarchy information, the grouping function
 * SHALL assign each note to exactly one top-level SCAA category group
 * (determined by walking up the parent chain to depth 0), and each note's
 * intensity indicator SHALL display exactly N dots where N equals the note's
 * intensity value (1, 2, or 3).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import fc from 'fast-check';
import { TastingNotesSection } from './TastingNotesSection';
import { I18nProvider } from '../../contexts/I18nContext.tsx';
import type { ReactNode } from 'react';

function withI18n(ui: ReactNode) {
  return <I18nProvider>{ui}</I18nProvider>;
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock radar-chart-data to control category aggregation
vi.mock('../../utils/radar-chart-data.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/radar-chart-data.ts')>();
  return {
    ...actual,
    aggregateByCategory: vi.fn((notes) => actual.aggregateByCategory(notes)),
  };
});

// Mock ScaaRadarChart to avoid SVG rendering complexity
vi.mock('./ScaaRadarChart.tsx', () => ({
  ScaaRadarChart: ({ categoryValues }: { categoryValues: Record<string, number> }) => (
    <div data-testid='scaa-radar-chart' data-categories={JSON.stringify(categoryValues)} />
  ),
}));

// Mock IntensityDots to a simple div with data-intensity attribute
vi.mock('./IntensityDots.tsx', () => ({
  IntensityDots: ({ intensity }: { intensity: number }) => (
    <div data-testid='intensity-dots' data-intensity={intensity} />
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TasteNote {
  id: string;
  tasteNoteId: string;
  name: string;
  intensity: number;
  parentId: string | null;
  depth: number;
  rootCategoryName?: string;
}

function makeNote(overrides: Partial<TasteNote> & { id: string; tasteNoteId: string; name: string }): TasteNote {
  return {
    intensity: 1,
    parentId: null,
    depth: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Unit tests — specific examples
// ---------------------------------------------------------------------------

describe('TastingNotesSection — unit tests', () => {
  it('renders empty state message when no taste notes and no personalNotes', () => {
    render(withI18n(<TastingNotesSection tasteNotes={[]} personalNotes={null} />));
    expect(screen.getByText('No tasting notes recorded.')).toBeInTheDocument();
    // No radar chart when no taste notes
    expect(screen.queryAllByTestId('scaa-radar-chart')).toHaveLength(0);
    // No blockquote
    expect(document.querySelector('blockquote')).toBeNull();
  });

  it('shows personalNotes blockquote when present even with no taste notes', () => {
    render(
      withI18n(<TastingNotesSection tasteNotes={[]} personalNotes='Bright and citrusy.' />),
    );
    const blockquote = document.querySelector('blockquote');
    expect(blockquote).not.toBeNull();
    expect(screen.getByText('Bright and citrusy.')).toBeInTheDocument();
    // No radar chart when no taste notes
    expect(screen.queryAllByTestId('scaa-radar-chart')).toHaveLength(0);
  });

  it('shows radar chart when taste notes are present', () => {
    const notes: TasteNote[] = [
      makeNote({ id: '1', tasteNoteId: 'tn1', name: 'Jasmine', rootCategoryName: 'Floral' }),
    ];
    render(withI18n(<TastingNotesSection tasteNotes={notes} />));
    // The component renders two radar charts (one for sm:block, one for block sm:hidden)
    const charts = screen.getAllByTestId('scaa-radar-chart');
    expect(charts.length).toBeGreaterThanOrEqual(1);
  });

  it('shows grouped chips by category', () => {
    const notes: TasteNote[] = [
      makeNote({ id: '1', tasteNoteId: 'tn1', name: 'Jasmine', rootCategoryName: 'Floral' }),
      makeNote({ id: '2', tasteNoteId: 'tn2', name: 'Blueberry', rootCategoryName: 'Fruity' }),
      makeNote({ id: '3', tasteNoteId: 'tn3', name: 'Rose', rootCategoryName: 'Floral' }),
    ];
    render(withI18n(<TastingNotesSection tasteNotes={notes} />));
    // Category labels should appear
    expect(screen.getByText('Floral')).toBeInTheDocument();
    expect(screen.getByText('Fruity')).toBeInTheDocument();
  });

  it('each chip shows the note name', () => {
    const notes: TasteNote[] = [
      makeNote({ id: '1', tasteNoteId: 'tn1', name: 'Jasmine', rootCategoryName: 'Floral' }),
      makeNote({ id: '2', tasteNoteId: 'tn2', name: 'Blueberry', rootCategoryName: 'Fruity' }),
    ];
    render(withI18n(<TastingNotesSection tasteNotes={notes} />));
    expect(screen.getByText('Jasmine')).toBeInTheDocument();
    expect(screen.getByText('Blueberry')).toBeInTheDocument();
  });

  it('shows personal notes in blockquote when present alongside taste notes', () => {
    const notes: TasteNote[] = [
      makeNote({ id: '1', tasteNoteId: 'tn1', name: 'Jasmine', rootCategoryName: 'Floral' }),
    ];
    render(
      withI18n(<TastingNotesSection tasteNotes={notes} personalNotes='Very floral and delicate.' />),
    );
    const blockquote = document.querySelector('blockquote');
    expect(blockquote).not.toBeNull();
    expect(screen.getByText('Very floral and delicate.')).toBeInTheDocument();
    // Radar chart also present (rendered twice for responsive breakpoints)
    const charts = screen.getAllByTestId('scaa-radar-chart');
    expect(charts.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Property-based test — Property 8: Taste note grouping and intensity display
// Validates: Requirements 8.3, 8.4
// ---------------------------------------------------------------------------

const SCAA_CATEGORIES = ['Floral', 'Fruity', 'Sweet', 'Nutty/Cocoa', 'Spices', 'Roasted', 'Other'] as const;

/** Arbitrary for a valid intensity value (1, 2, or 3) */
const intensityArb = fc.integer({ min: 1, max: 3 });

/** Arbitrary for a single taste note with rootCategoryName set */
const tasteNoteArb = fc.record({
  id: fc.uuid(),
  tasteNoteId: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
  intensity: intensityArb,
  parentId: fc.constant(null),
  depth: fc.constant(0),
  rootCategoryName: fc.constantFrom(...SCAA_CATEGORIES),
});

/** Arbitrary for a non-empty array of taste notes (1–10 notes) */
const tasteNotesArb = fc.array(tasteNoteArb, { minLength: 1, maxLength: 10 });

describe('TastingNotesSection — Property 8: Taste note grouping and intensity display', () => {
  /**
   * **Validates: Requirements 8.3**
   *
   * For any set of taste notes with rootCategoryName set, each note appears
   * in exactly one group (the group matching its rootCategoryName).
   * We verify this by checking that the total number of intensity-dots rendered
   * equals the total number of input notes (one dot indicator per note, no duplicates).
   */
  it('each note appears in exactly one group — total intensity-dots equals total notes', () => {
    fc.assert(
      fc.property(tasteNotesArb, (notes) => {
        const { container } = render(
          withI18n(<TastingNotesSection tasteNotes={notes} />),
        );

        const intensityDots = container.querySelectorAll('[data-testid="intensity-dots"]');
        // Each note should have exactly one intensity-dots rendered
        expect(intensityDots.length).toBe(notes.length);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.4**
   *
   * For any note with intensity N, the IntensityDots mock receives exactly N
   * as its data-intensity attribute.
   */
  it('each note intensity indicator receives exactly the note intensity value', () => {
    fc.assert(
      fc.property(tasteNotesArb, (notes) => {
        const { container } = render(
          withI18n(<TastingNotesSection tasteNotes={notes} />),
        );

        const intensityDots = Array.from(
          container.querySelectorAll('[data-testid="intensity-dots"]'),
        ) as HTMLElement[];

        // There should be exactly one intensity-dots per note
        expect(intensityDots.length).toBe(notes.length);

        // The rendered intensities (sorted) should match the input intensities (sorted)
        // We sort both because grouping may reorder notes within/across categories
        const renderedIntensities = intensityDots
          .map((el) => parseInt(el.getAttribute('data-intensity') ?? '0', 10))
          .sort((a, b) => a - b);

        const inputIntensities = notes.map((n) => n.intensity).sort((a, b) => a - b);

        expect(renderedIntensities).toEqual(inputIntensities);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 8.3**
   *
   * Notes with the same rootCategoryName are grouped together under the same
   * category label. The number of distinct category labels rendered equals the
   * number of distinct rootCategoryName values in the input.
   * Uses within(container) to scope queries to the current render only.
   */
  it('number of rendered category groups equals number of distinct rootCategoryNames', () => {
    fc.assert(
      fc.property(tasteNotesArb, (notes) => {
        const { container } = render(
          withI18n(<TastingNotesSection tasteNotes={notes} />),
        );

        const distinctCategories = new Set(notes.map((n) => n.rootCategoryName));

        // Each distinct category should appear as a label in the DOM exactly once
        for (const category of distinctCategories) {
          // Use within(container) to scope to this render only
          const labels = within(container as HTMLElement).getAllByText(category as string);
          expect(labels.length).toBe(1);
        }
      }),
      { numRuns: 100 },
    );
  });
});
