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

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import fc from 'fast-check';
import { BeanSection } from './BeanSection';
import { I18nProvider } from '../../contexts/I18nContext.tsx';
import type { ReactNode } from 'react';

function withI18n(ui: ReactNode) {
  return <I18nProvider>{ui}</I18nProvider>;
}

// ---------------------------------------------------------------------------
// Mock relative-date utilities to return predictable labels
// ---------------------------------------------------------------------------

vi.mock('../../utils/relative-date.ts', () => ({
  roastDateLabel: (_roastDate: Date, _brewDate: Date) => '7 days post-roast',
  packageOpenDateLabel: (_openDate: Date, _brewDate: Date) => '3 days since opened',
  grindDateLabel: (_grindDate: Date, _brewDate: Date) => '1 days ago',
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
  it('renders when productName is present', () => {
    const node = renderBeanSection({ productName: 'Ethiopia Yirgacheffe' });
    expect(node).not.toBeNull();
  });

  it('renders when only coffeeBrand is present', () => {
    const node = renderBeanSection({ coffeeBrand: 'Blue Bottle' });
    expect(node).not.toBeNull();
  });

  it('renders when only roastDate is present', () => {
    const node = renderBeanSection({ roastDate: '2024-01-15' });
    expect(node).not.toBeNull();
  });

  it('renders when only bean.origin is present', () => {
    const node = renderBeanSection({ bean: { origin: 'Ethiopia', roaster: null, roastLevel: null } });
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
    render(withI18n(<BeanSection productName='Ethiopia Yirgacheffe' />));
    expect(screen.getByText('Ethiopia Yirgacheffe')).toBeInTheDocument();
  });

  it('does NOT show product name when null', () => {
    render(withI18n(<BeanSection coffeeBrand='Blue Bottle' productName={null} />));
    expect(screen.queryByText('Ethiopia Yirgacheffe')).toBeNull();
  });

  it('shows relative date label for roast date', () => {
    render(withI18n(<BeanSection roastDate='2024-01-01' />));
    // The mocked roastDateLabel returns '7 days post-roast'
    // The label appears in both the section header and the date field
    const labels = screen.getAllByText('7 days post-roast');
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });

  it('shows origin from bean record', () => {
    render(withI18n(<BeanSection bean={{ origin: 'Colombia', roaster: null, roastLevel: null }} />));
    expect(screen.getByText('Colombia')).toBeInTheDocument();
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
  fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map((d) => d.toISOString()),
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
  const { productName, coffeeBrand, coffeeProcessing, roastDate, packageOpenDate, grindDate, bean } = props;
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
        fc.record({
          productName: nullableString,
          coffeeBrand: nullableString,
          coffeeProcessing: nullableString,
          roastDate: nullableDateString,
          packageOpenDate: nullableDateString,
          grindDate: nullableDateString,
          bean: beanArb,
        }).filter((props) => shouldRender(props)),
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
