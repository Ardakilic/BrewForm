/**
 * Tests for EquipmentSection component — equipment compatibility status
 *
 * Property 6: Equipment compatibility status
 * Validates: Requirements 7.5, 7.6
 *
 * For any set of equipment items with types and a brew method with associated
 * compatibility rules, the compatibility status SHALL be "compatible" if and
 * only if every equipment item's type either has no rule defined for the brew
 * method OR has a rule with `compatible: true`; otherwise the status SHALL be
 * "incompatible".
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import { EquipmentSection } from './EquipmentSection';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../icons/equipment/index.ts', () => ({
  getEquipmentIcon: () =>
    function MockIcon({ size }: { size?: number }) {
      return <svg data-testid='equipment-icon' width={size} height={size} />;
    },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(
  overrides: Partial<{
    id: string;
    equipmentId: string;
    name: string;
    type: string;
    compatible: boolean | undefined;
  }> = {},
) {
  return {
    id: overrides.id ?? 'item-1',
    equipmentId: overrides.equipmentId ?? 'equip-1',
    name: overrides.name ?? 'Test Item',
    type: overrides.type ?? 'portafilter',
    compatible: overrides.compatible,
  };
}

// ---------------------------------------------------------------------------
// Unit tests — specific examples
// ---------------------------------------------------------------------------

describe('EquipmentSection — unit tests', () => {
  it('returns null when items array is empty', () => {
    const { container } = render(<EquipmentSection items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows item count in header — singular', () => {
    render(<EquipmentSection items={[makeItem()]} />);
    expect(screen.getByText(/1 item/)).toBeInTheDocument();
  });

  it('shows item count in header — plural', () => {
    render(
      <EquipmentSection
        items={[makeItem({ id: 'a', equipmentId: 'ea' }), makeItem({ id: 'b', equipmentId: 'eb' })]}
      />,
    );
    expect(screen.getByText(/2 items/)).toBeInTheDocument();
  });

  it('shows "all compatible" when all items have compatible=true', () => {
    render(
      <EquipmentSection
        items={[
          makeItem({ id: 'a', equipmentId: 'ea', compatible: true }),
          makeItem({ id: 'b', equipmentId: 'eb', compatible: true }),
        ]}
      />,
    );
    expect(screen.getByText('all compatible')).toBeInTheDocument();
  });

  it('shows "all compatible" when all items have compatible=undefined', () => {
    render(
      <EquipmentSection
        items={[
          makeItem({ id: 'a', equipmentId: 'ea', compatible: undefined }),
          makeItem({ id: 'b', equipmentId: 'eb', compatible: undefined }),
        ]}
      />,
    );
    expect(screen.getByText('all compatible')).toBeInTheDocument();
  });

  it('shows "incompatible items" when any item has compatible=false', () => {
    render(
      <EquipmentSection
        items={[
          makeItem({ id: 'a', equipmentId: 'ea', compatible: true }),
          makeItem({ id: 'b', equipmentId: 'eb', compatible: false }),
        ]}
      />,
    );
    expect(screen.getByText('incompatible items')).toBeInTheDocument();
  });

  it('shows "incompatible items" when only item has compatible=false', () => {
    render(<EquipmentSection items={[makeItem({ compatible: false })]} />);
    expect(screen.getByText('incompatible items')).toBeInTheDocument();
  });

  it('clicking an item navigates to /recipes?equipmentId={id}', async () => {
    const user = userEvent.setup();
    render(
      <EquipmentSection items={[makeItem({ id: 'item-x', equipmentId: 'equip-abc' })]} />,
    );
    const button = screen.getByRole('button', { name: /Test Item/i });
    await user.click(button);
    expect(mockNavigate).toHaveBeenCalledWith('/recipes?equipmentId=equip-abc');
  });

  it('shows equipment type label in uppercase', () => {
    render(<EquipmentSection items={[makeItem({ type: 'portafilter' })]} />);
    // The component replaces underscores with spaces and renders in uppercase via CSS,
    // but the text content itself is the type with underscores replaced by spaces.
    // We check the element has the uppercase tracking class.
    const typeLabel = screen.getByText('portafilter');
    expect(typeLabel).toBeInTheDocument();
    expect(typeLabel.className).toMatch(/uppercase/);
  });

  it('shows equipment type label with underscores replaced by spaces', () => {
    render(<EquipmentSection items={[makeItem({ type: 'puck_screen' })]} />);
    expect(screen.getByText('puck screen')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Property-based test — Property 6: Equipment compatibility status
// Validates: Requirements 7.5, 7.6
// ---------------------------------------------------------------------------

describe('EquipmentSection — Property 6: Equipment compatibility status', () => {
  /**
   * For any non-empty set of items where all have compatible !== false,
   * the component shows "all compatible".
   */
  it('for any non-empty set of items where all have compatible !== false, shows "all compatible"', () => {
    // Arbitrary: compatible is true or undefined (never false)
    const compatibleValue = fc.oneof(fc.constant(true), fc.constant(undefined));

    const itemArb = fc.record({
      id: fc.uuid(),
      equipmentId: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 30 }),
      type: fc.constantFrom('portafilter', 'basket', 'puck_screen', 'scale', 'thermometer'),
      compatible: compatibleValue,
    });

    fc.assert(
      fc.property(
        fc.array(itemArb, { minLength: 1, maxLength: 10 }),
        (items) => {
          const { unmount } = render(<EquipmentSection items={items} />);
          expect(screen.getByText('all compatible')).toBeInTheDocument();
          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * For any non-empty set of items where at least one has compatible === false,
   * the component shows "incompatible items".
   */
  it('for any non-empty set of items where at least one has compatible === false, shows "incompatible items"', () => {
    const compatibleValue = fc.oneof(fc.constant(true), fc.constant(false), fc.constant(undefined));

    const itemArb = fc.record({
      id: fc.uuid(),
      equipmentId: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 30 }),
      type: fc.constantFrom('portafilter', 'basket', 'puck_screen', 'scale', 'thermometer'),
      compatible: compatibleValue,
    });

    // Generate an array of items, then force at least one to have compatible=false
    fc.assert(
      fc.property(
        fc.array(itemArb, { minLength: 1, maxLength: 9 }),
        fc.record({
          id: fc.uuid(),
          equipmentId: fc.uuid(),
          name: fc.string({ minLength: 1, maxLength: 30 }),
          type: fc.constantFrom('portafilter', 'basket', 'puck_screen', 'scale', 'thermometer'),
        }),
        (otherItems, incompatibleItem) => {
          const items = [
            ...otherItems,
            { ...incompatibleItem, compatible: false as const },
          ];

          const { unmount } = render(<EquipmentSection items={items} />);
          expect(screen.getByText('incompatible items')).toBeInTheDocument();
          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });
});
