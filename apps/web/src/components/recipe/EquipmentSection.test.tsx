/**
 * Tests for EquipmentSection component
 *
 * Validates: Requirements 2.3, 2.4
 *
 * The equipment section shows item count only (no compatibility status).
 * All user-visible strings use the i18n t() function.
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

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'recipe.equipment.title': 'EQUIPMENT',
        'recipe.equipment.item': 'item',
        'recipe.equipment.items': 'items',
        'recipe.mainBrewer': 'Main Brewer',
      };
      return translations[key] ?? key;
    },
  }),
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
  }> = {},
) {
  return {
    id: overrides.id ?? 'item-1',
    equipmentId: overrides.equipmentId ?? 'equip-1',
    name: overrides.name ?? 'Test Item',
    type: overrides.type ?? 'portafilter',
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

  it('does NOT show compatibility status text', () => {
    render(
      <EquipmentSection
        items={[
          makeItem({ id: 'a', equipmentId: 'ea' }),
          makeItem({ id: 'b', equipmentId: 'eb' }),
        ]}
      />,
    );
    expect(screen.queryByText('all compatible')).not.toBeInTheDocument();
    expect(screen.queryByText('incompatible items')).not.toBeInTheDocument();
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
    const typeLabel = screen.getByText('portafilter');
    expect(typeLabel).toBeInTheDocument();
    expect(typeLabel.className).toMatch(/uppercase/);
  });

  it('shows equipment type label with underscores replaced by spaces', () => {
    render(<EquipmentSection items={[makeItem({ type: 'puck_screen' })]} />);
    expect(screen.getByText('puck screen')).toBeInTheDocument();
  });

  it('renders without crashing when item type is undefined', () => {
    const item = { id: 'x', equipmentId: 'eq-x', name: 'No Type Item', type: undefined };
    const { container } = render(<EquipmentSection items={[item as any]} />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders without crashing when item name is null', () => {
    const item = { id: 'x', equipmentId: 'eq-x', name: null, type: 'portafilter' };
    const { container } = render(<EquipmentSection items={[item]} />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders brewerDetails as a Main Brewer card', () => {
    render(<EquipmentSection items={[makeItem()]} brewerDetails='V60 02 ceramic' />);
    expect(screen.getByText('V60 02 ceramic')).toBeInTheDocument();
    expect(screen.getByText('Main Brewer')).toBeInTheDocument();
  });

  it('renders when items is empty but brewerDetails is provided', () => {
    const { container } = render(<EquipmentSection items={[]} brewerDetails='Aeropress' />);
    expect(container.firstChild).not.toBeNull();
    expect(screen.getByText('Aeropress')).toBeInTheDocument();
    expect(screen.getByText('Main Brewer')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Property-based test — item count display
// Validates: Requirements 2.3, 2.4
// ---------------------------------------------------------------------------

describe('EquipmentSection — property tests', () => {
  /**
   * For any non-empty set of items, the component shows the correct item count
   * and never shows compatibility status text.
   */
  it('for any non-empty set of items, shows correct count and no compatibility text', () => {
    const itemArb = fc.record({
      id: fc.uuid(),
      equipmentId: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 30 }),
      type: fc.constantFrom('portafilter', 'basket', 'puck_screen', 'scale', 'thermometer'),
    });

    fc.assert(
      fc.property(
        fc.array(itemArb, { minLength: 1, maxLength: 10 }),
        (items) => {
          const { unmount } = render(<EquipmentSection items={items} />);

          // Item count is shown
          const countLabel = items.length === 1 ? '1 item' : `${items.length} items`;
          expect(screen.getByText(new RegExp(countLabel))).toBeInTheDocument();

          // No compatibility text
          expect(screen.queryByText('all compatible')).not.toBeInTheDocument();
          expect(screen.queryByText('incompatible items')).not.toBeInTheDocument();

          unmount();
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * For any non-empty set of items, the component renders exactly items.length buttons.
   */
  it('renders exactly items.length equipment buttons for any non-empty array', () => {
    const itemArb = fc.record({
      id: fc.uuid(),
      equipmentId: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 30 }),
      type: fc.constantFrom('portafilter', 'basket', 'puck_screen', 'scale', 'thermometer'),
    });

    fc.assert(
      fc.property(
        fc.array(itemArb, { minLength: 1, maxLength: 10 }),
        (items) => {
          const { unmount } = render(<EquipmentSection items={items} />);
          const buttons = screen.getAllByRole('button');
          expect(buttons).toHaveLength(items.length);
          unmount();
        },
      ),
      { numRuns: 50 },
    );
  });
});
