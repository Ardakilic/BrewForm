import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import * as fc from 'fast-check';
import { I18nProvider } from '../../../contexts/I18nContext.tsx';
import { EquipmentSection } from '../EquipmentSection.tsx';
import { BrewTimeline } from '../BrewTimeline.tsx';
import { BeanSection } from '../BeanSection.tsx';
import { TastingNotesSection } from '../TastingNotesSection.tsx';
import { ShareSection } from '../ShareSection.tsx';

/**
 * Preservation tests — Property 2: Preservation
 * These tests capture EXISTING CORRECT behavior that must be preserved after fixes.
 * They MUST PASS on unfixed code.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
 */

/** Helper: wrap component with all required providers */
function withProviders(ui: React.ReactElement) {
  return (
    <I18nProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </I18nProvider>
  );
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates a valid equipment item (type and name are always defined strings) */
const validEquipmentItemArb = fc.record({
  id: fc.uuid(),
  equipmentId: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
  type: fc
    .constantFrom(
      'grinder',
      'espresso_machine',
      'scale',
      'portafilter',
      'basket',
      'tamper',
      'kettle',
      'dripper',
      'filter',
    )
    .map((t) => t as string),
  compatible: fc.option(fc.boolean(), { nil: undefined }),
});

/** Generates a non-empty array of valid equipment items (1–8 items) */
const validEquipmentArrayArb = fc.array(validEquipmentItemArb, { minLength: 1, maxLength: 8 });

/** Generates extractionTimeSeconds > 0 */
const positiveExtractionArb = fc.integer({ min: 1, max: 120 });

// ---------------------------------------------------------------------------
// EquipmentSection preservation properties
// ---------------------------------------------------------------------------

describe('Preservation - EquipmentSection with valid items', () => {
  /**
   * Property: for all valid equipment arrays (items with defined type and name),
   * EquipmentSection renders exactly items.length equipment buttons.
   */
  it('renders exactly items.length equipment buttons for any valid items array', () => {
    fc.assert(
      fc.property(validEquipmentArrayArb, (items) => {
        const { unmount } = render(withProviders(<EquipmentSection items={items} />));
        const buttons = screen.getAllByRole('button');
        const result = buttons.length === items.length;
        unmount();
        return result;
      }),
      { numRuns: 50 },
    );
  });

  it('returns null when items array is empty', () => {
    const { container } = render(withProviders(<EquipmentSection items={[]} />));
    expect(container.firstChild).toBeNull();
  });

  it('displays item names for valid items', () => {
    const items = [{ id: '1', equipmentId: 'eq1', name: 'Acaia Lunar', type: 'scale' }];
    render(withProviders(<EquipmentSection items={items} />));
    expect(screen.getByText('Acaia Lunar')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// BrewTimeline preservation properties
// ---------------------------------------------------------------------------

describe('Preservation - BrewTimeline behavior', () => {
  /**
   * Property: for all extractionTimeSeconds > 0 with preInfusionTimeSeconds = null,
   * BrewTimeline renders only the extraction segment (no pre-infusion segment).
   */
  it('renders only extraction segment for any positive extractionTimeSeconds with null preInfusion', () => {
    fc.assert(
      fc.property(positiveExtractionArb, (extractionTimeSeconds) => {
        const { container, unmount } = render(
          <I18nProvider>
            <BrewTimeline
              extractionTimeSeconds={extractionTimeSeconds}
              preInfusionTimeSeconds={null}
            />
          </I18nProvider>,
        );
        // Component must render (not null)
        const rendered = container.firstChild !== null;
        // Pre-infusion segment must NOT be present
        const preInfusionLabel = container.querySelector('[class*="Pre-Infusion"]');
        const hasPreInfusion = preInfusionLabel !== null || !!screen.queryByText(/pre-infusion/i);
        unmount();
        return rendered && !hasPreInfusion;
      }),
      { numRuns: 50 },
    );
  });

  /**
   * Property: for all null/undefined extractionTimeSeconds, BrewTimeline returns null.
   */
  it('returns null for null extractionTimeSeconds', () => {
    fc.assert(
      fc.property(fc.constant(null as null), (val) => {
        const { container, unmount } = render(
          <I18nProvider>
            <BrewTimeline extractionTimeSeconds={val} />
          </I18nProvider>,
        );
        const isNull = container.firstChild === null;
        unmount();
        return isNull;
      }),
      { numRuns: 10 },
    );
  });

  it('returns null for undefined extractionTimeSeconds', () => {
    fc.assert(
      fc.property(fc.constant(undefined as undefined), (val) => {
        const { container, unmount } = render(
          <I18nProvider>
            <BrewTimeline extractionTimeSeconds={val} />
          </I18nProvider>,
        );
        const isNull = container.firstChild === null;
        unmount();
        return isNull;
      }),
      { numRuns: 10 },
    );
  });

  it('renders when extractionTimeSeconds is provided', () => {
    const { container } = render(
      <I18nProvider>
        <BrewTimeline extractionTimeSeconds={28} />
      </I18nProvider>,
    );
    expect(container.firstChild).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// BeanSection preservation properties
// ---------------------------------------------------------------------------

describe('Preservation - BeanSection graceful hiding', () => {
  /**
   * Property: for all recipes with no bean data fields set, BeanSection returns null.
   */
  it('returns null when no bean data is provided (property)', () => {
    // The "no data" case is a single fixed input — verify it consistently
    fc.assert(
      fc.property(fc.constant({}), (_emptyProps) => {
        const { container, unmount } = render(
          <I18nProvider>
            <BeanSection />
          </I18nProvider>,
        );
        const isNull = container.firstChild === null;
        unmount();
        return isNull;
      }),
      { numRuns: 10 },
    );
  });

  it('returns null when all bean fields are explicitly null/undefined', () => {
    const { container } = render(
      <I18nProvider>
        <BeanSection
          productName={null}
          coffeeBrand={null}
          coffeeProcessing={null}
          roastDate={null}
          packageOpenDate={null}
          grindDate={null}
          brewDate={null}
          bean={null}
        />
      </I18nProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when productName is provided', () => {
    const { container } = render(
      <I18nProvider>
        <BeanSection productName='Heart Ethiopia' />
      </I18nProvider>,
    );
    expect(container.firstChild).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TastingNotesSection preservation properties
// ---------------------------------------------------------------------------

describe('Preservation - TastingNotesSection empty state', () => {
  /**
   * Property: for all empty tasteNotes arrays with null personalNotes,
   * TastingNotesSection shows empty state message.
   */
  it('shows empty state message for any empty tasteNotes with null personalNotes (property)', () => {
    fc.assert(
      fc.property(fc.constant([]), (_emptyNotes) => {
        const { unmount } = render(
          withProviders(<TastingNotesSection tasteNotes={_emptyNotes} personalNotes={null} />),
        );
        const emptyMsg = screen.queryByText(/no tasting notes/i);
        const hasEmptyState = emptyMsg !== null;
        unmount();
        return hasEmptyState;
      }),
      { numRuns: 10 },
    );
  });

  it('shows empty state when tasteNotes is empty and no personalNotes', () => {
    render(withProviders(<TastingNotesSection tasteNotes={[]} personalNotes={null} />));
    expect(screen.getByText(/no tasting notes/i)).toBeTruthy();
  });

  it('shows personal notes blockquote when personalNotes is provided', () => {
    render(withProviders(<TastingNotesSection tasteNotes={[]} personalNotes='Beautiful sweet shot' />));
    expect(screen.getByText('Beautiful sweet shot')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// ShareSection preservation properties
// ---------------------------------------------------------------------------

describe('Preservation - ShareSection visibility gating', () => {
  /**
   * Property: ShareSection returns null for private or draft visibility.
   */
  it('returns null for private or draft visibility (property)', () => {
    fc.assert(
      fc.property(fc.constantFrom('private', 'draft'), (visibility) => {
        const { container, unmount } = render(
          withProviders(<ShareSection slug='test' title='Test' visibility={visibility} />),
        );
        const isNull = container.firstChild === null;
        unmount();
        return isNull;
      }),
      { numRuns: 20 },
    );
  });

  it('returns null for private visibility', () => {
    const { container } = render(
      withProviders(<ShareSection slug='test' title='Test' visibility='private' />),
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null for draft visibility', () => {
    const { container } = render(
      withProviders(<ShareSection slug='test' title='Test' visibility='draft' />),
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders for public visibility', () => {
    const { container } = render(
      withProviders(<ShareSection slug='test' title='Test' visibility='public' />),
    );
    expect(container.firstChild).not.toBeNull();
  });
});
