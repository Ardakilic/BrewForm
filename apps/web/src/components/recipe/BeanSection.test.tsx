/**
 * Tests for BeanSection component — bean section conditional rendering
 *
 * Property 12: Bean section conditional rendering
 * Validates: Requirements 5.1, 5.7
 *
 * For any recipe version data object, the bean section SHALL render if and only
 * if at least one of the following is non-null: productName, coffeeBrand,
 * coffeeProcessing, roastDate, packageOpenDate, grindDate, or the linked bean
 * record (with non-null origin, roaster, or roastLevel). When rendered, only
 * fields with non-null values SHALL be displayed.
 */

import { render, screen } from '@testing-library/react';
import fc from 'fast-check';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../contexts/I18nContext.tsx';
import { BeanSection } from './BeanSection.tsx';

function withI18n(ui: ReactNode) {
  return <I18nProvider>{ui}</I18nProvider>;
}

// ---------------------------------------------------------------------------
// Mock relative-date utilities to return predictable labels
// ---------------------------------------------------------------------------

vi.mock('../../utils/relative-date.ts', () => ({
  roastDateResult: (_roastDate: Date, _brewDate: Date) => ({ type: 'daysPostRoast', days: 7 }),
  packageOpenDateResult: (_openDate: Date, _brewDate: Date) => ({
    type: 'daysSinceOpened',
    days: 3,
  }),
  grindDateResult: (_grindDate: Date, _brewDate: Date) => ({ type: 'daysAgo', days: 1 }),
  // daysBetween is used by isPeakWindow inside BeanSection
  daysBetween: (_a: Date, _b: Date) => 14,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the rendered container or null if BeanSection returns null */
function renderBeanSection(props: Parameters<typeof BeanSection>[0]) {
  const { container } = render(withI18n(<BeanSection {...props} />));
  return container.firstChild;
}

// ---------------------------------------------------------------------------
// Unit tests — specific examples
// ---------------------------------------------------------------------------

describe('BeanSection — conditional rendering unit tests', () => {
  it('renders when productName is present', async () => {
    const node = renderBeanSection({ productName: 'Ethiopia Yirgacheffe' });
    await new Promise((r) => setTimeout(r, 0));
    expect(node).not.toBeNull();
  });

  it('renders when only coffeeBrand is present', async () => {
    const node = renderBeanSection({ coffeeBrand: 'Blue Bottle' });
    await new Promise((r) => setTimeout(r, 0));
    expect(node).not.toBeNull();
  });

  it('renders when only roastDate is present', async () => {
    const node = renderBeanSection({ roastDate: '2024-01-15' });
    await new Promise((r) => setTimeout(r, 0));
    expect(node).not.toBeNull();
  });

  it('renders when only bean.origin is present', async () => {
    const node = renderBeanSection({
      bean: { origin: 'Ethiopia', roaster: null, roastLevel: null },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(node).not.toBeNull();
  });

  it('returns null when all fields are null/undefined', () => {
    const node = renderBeanSection({
      productName: null,
      coffeeBrand: null,
      coffeeProcessing: null,
      roastDate: null,
      packageOpenDate: null,
      grindDate: null,
      bean: null,
    });
    expect(node).toBeNull();
  });

  it('returns null when bean is present but all bean fields are null', () => {
    const node = renderBeanSection({
      productName: null,
      coffeeBrand: null,
      coffeeProcessing: null,
      roastDate: null,
      packageOpenDate: null,
      grindDate: null,
      bean: { origin: null, roaster: null, roastLevel: null },
    });
    expect(node).toBeNull();
  });

  it('shows product name when present', () => {
    render(withI18n(<BeanSection productName="Ethiopia Yirgacheffe" />));
    expect(screen.getByText('Ethiopia Yirgacheffe')).toBeInTheDocument();
  });

  it('does NOT show product name when null', () => {
    render(withI18n(<BeanSection coffeeBrand="Blue Bottle" productName={null} />));
    expect(screen.queryByText('Ethiopia Yirgacheffe')).toBeNull();
  });

  it('shows relative date label for roast date', () => {
    render(withI18n(<BeanSection roastDate="2024-01-01" />));
    // The mocked roastDateResult returns { type: 'daysPostRoast', days: 7 } which t() renders as '7 days post-roast'
    // The label appears in both the section header and the date field
    const labels = screen.getAllByText('7 days post-roast');
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });

  it('shows origin from bean record', () => {
    render(
      withI18n(<BeanSection bean={{ origin: 'Colombia', roaster: null, roastLevel: null }} />),
    );
    expect(screen.getByText('Colombia')).toBeInTheDocument();
  });

  it('renders the short ages through the en day key', () => {
    render(
      withI18n(
        <BeanSection roastDate="2026-01-01" packageOpenDate="2026-02-01" grindDate="2026-02-02" />,
      ),
    );
    for (const age of ['7d', '3d', '1d']) {
      expect(screen.getByText(age)).toBeInTheDocument();
    }
  });

  it('renders the short ages in Turkish under tr, never a hard-coded "d" unit', () => {
    localStorage.setItem('brewform_locale', 'tr');
    try {
      const { container } = render(
        withI18n(
          <BeanSection
            roastDate="2026-01-01"
            packageOpenDate="2026-02-01"
            grindDate="2026-02-02"
          />,
        ),
      );
      for (const age of ['7 gün', '3 gün', '1 gün']) {
        expect(screen.getByText(age)).toBeInTheDocument();
      }
      expect(container.textContent).not.toMatch(/\d+d\b/);
    } finally {
      localStorage.removeItem('brewform_locale');
    }
  });

  it('stacks the date grid below sm and lets each date and age wrap (320 px, V1)', () => {
    render(
      withI18n(
        <BeanSection roastDate="2026-01-01" packageOpenDate="2026-02-01" grindDate="2026-02-02" />,
      ),
    );
    // jsdom has no layout: assert the responsive classes.
    const field = screen.getByText('Bag Opened').parentElement as HTMLElement;
    const grid = field.parentElement as HTMLElement;
    expect(grid).toHaveClass('grid', 'grid-cols-1', 'sm:grid-cols-2');
    expect(grid.className.split(/\s+/)).not.toContain('grid-cols-2');

    for (const label of ['Roasted', 'Bag Opened', 'Ground']) {
      const dateLine = screen.getByText(label).nextElementSibling as HTMLElement;
      expect(dateLine).toHaveClass('flex-wrap');
    }
  });
});

// ---------------------------------------------------------------------------
// Property-based test — Property 12: Bean section conditional rendering
// Validates: Requirements 5.1, 5.7
// ---------------------------------------------------------------------------

/**
 * Arbitraries for nullable string and date fields
 */
const nullableString = fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null });
const nullableDateString = fc.option(
  fc
    .date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
    .filter((d) => !isNaN(d.getTime()))
    .map((d) => d.toISOString()),
  { nil: null },
);

/** Arbitrary for the bean sub-object: either null, or an object with nullable fields */
const beanArb = fc.option(
  fc.record({
    origin: nullableString,
    roaster: nullableString,
    roastLevel: nullableString,
  }),
  { nil: null },
);

/** Determines whether a given set of props should cause the section to render */
function shouldRender(props: {
  productName: string | null;
  coffeeBrand: string | null;
  coffeeProcessing: string | null;
  roastDate: string | null;
  packageOpenDate: string | null;
  grindDate: string | null;
  bean: { origin: string | null; roaster: string | null; roastLevel: string | null } | null;
}): boolean {
  const {
    productName,
    coffeeBrand,
    coffeeProcessing,
    roastDate,
    packageOpenDate,
    grindDate,
    bean,
  } = props;
  return (
    productName != null ||
    coffeeBrand != null ||
    coffeeProcessing != null ||
    roastDate != null ||
    packageOpenDate != null ||
    grindDate != null ||
    (bean != null && (bean.origin != null || bean.roaster != null || bean.roastLevel != null))
  );
}

describe('BeanSection — Property 12: Bean section conditional rendering', () => {
  it('for any combination of all-null fields, renders null', () => {
    fc.assert(
      fc.property(
        beanArb.filter(
          (b) => b === null || (b.origin === null && b.roaster === null && b.roastLevel === null),
        ),
        (bean) => {
          const node = renderBeanSection({
            productName: null,
            coffeeBrand: null,
            coffeeProcessing: null,
            roastDate: null,
            packageOpenDate: null,
            grindDate: null,
            bean,
          });
          expect(node).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('for any combination where at least one field is non-null, renders something', () => {
    fc.assert(
      fc.property(
        fc
          .record({
            productName: nullableString,
            coffeeBrand: nullableString,
            coffeeProcessing: nullableString,
            roastDate: nullableDateString,
            packageOpenDate: nullableDateString,
            grindDate: nullableDateString,
            bean: beanArb,
          })
          .filter((props) => shouldRender(props)),
        (props) => {
          const node = renderBeanSection(props);
          expect(node).not.toBeNull();
        },
      ),
      { numRuns: 200 },
    );
  });

  it('renders if and only if at least one field is non-null (bidirectional)', () => {
    fc.assert(
      fc.property(
        fc.record({
          productName: nullableString,
          coffeeBrand: nullableString,
          coffeeProcessing: nullableString,
          roastDate: nullableDateString,
          packageOpenDate: nullableDateString,
          grindDate: nullableDateString,
          bean: beanArb,
        }),
        (props) => {
          const node = renderBeanSection(props);
          const expected = shouldRender(props);
          if (expected) {
            expect(node).not.toBeNull();
          } else {
            expect(node).toBeNull();
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
