import { t } from '@brewform/shared/i18n';
import type { EquipmentOutput } from '@brewform/shared/schemas';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { EquipmentPicker, toggleEquipmentId } from './EquipmentPicker.tsx';

const GRINDER = { id: 'eq-1', name: 'Niche Zero', type: 'grinder' } as EquipmentOutput;
const BASKET = { id: 'eq-2', name: 'VST 18g', type: 'basket' } as EquipmentOutput;

/** Controlled harness: owns the selection and reports every change to `onChange`. */
function Harness({
  equipment,
  initial = [],
  onChange,
}: {
  equipment: EquipmentOutput[];
  initial?: string[];
  onChange: (ids: string[]) => void;
}) {
  const [ids, setIds] = useState(initial);
  return (
    <EquipmentPicker
      equipment={equipment}
      selectedIds={ids}
      onChange={(next) => {
        setIds(next);
        onChange(next);
      }}
    />
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('toggleEquipmentId', () => {
  it('appends an unselected id and keeps the order of the others', () => {
    expect(toggleEquipmentId(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });

  it('removes a selected id', () => {
    expect(toggleEquipmentId(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('returns an empty list when the last id is removed', () => {
    expect(toggleEquipmentId(['a'], 'a')).toEqual([]);
  });
});

describe('EquipmentPicker', () => {
  it('renders one checkbox per item with its name and type, checked from selectedIds', () => {
    renderWithAppProviders(
      <Harness equipment={[GRINDER, BASKET]} initial={['eq-2']} onChange={vi.fn()} />,
    );

    expect(screen.getByRole('group', { name: t('equipment.title') })).toBeInTheDocument();
    // Each checkbox is named by its own item only (no nested label leaks other items' text).
    expect(
      screen.getByRole('checkbox', { name: /^Niche Zero\s*\(grinder\)$/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Niche Zero/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /VST 18g/ })).toBeChecked();
    expect(screen.getByText('(grinder)')).toBeInTheDocument();
    expect(screen.getByText('(basket)')).toBeInTheDocument();
  });

  it('reports the new selection when an item is ticked and unticked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithAppProviders(
      <Harness equipment={[GRINDER, BASKET]} initial={['eq-2']} onChange={onChange} />,
    );

    await user.click(screen.getByRole('checkbox', { name: /Niche Zero/ }));
    expect(onChange).toHaveBeenLastCalledWith(['eq-2', 'eq-1']);
    expect(screen.getByRole('checkbox', { name: /Niche Zero/ })).toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: /VST 18g/ }));
    await user.click(screen.getByRole('checkbox', { name: /Niche Zero/ }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('shows the empty hint when there is no equipment', () => {
    renderWithAppProviders(<Harness equipment={[]} onChange={vi.fn()} />);

    expect(screen.getByText(t('recipe.form.noEquipment'))).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('renders its label and empty hint in Turkish', () => {
    renderWithAppProviders(<Harness equipment={[]} onChange={vi.fn()} />, { locale: 'tr' });

    expect(screen.getByText(t('equipment.title', 'tr'))).toBeInTheDocument();
    expect(screen.getByText(t('recipe.form.noEquipment', 'tr'))).toBeInTheDocument();
  });
});
