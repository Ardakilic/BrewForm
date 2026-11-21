import { t } from '@brewform/shared/i18n';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// The resource route behind the picker calls the coffee-variety client; it is mocked here.
vi.mock('../../api/index.ts', () => ({
  coffeeVarietyApi: { search: vi.fn() },
}));

import { coffeeVarietyApi } from '../../api/index.ts';
import type { CoffeeVarietySearchResult } from '../../api/types.ts';
import { coffeeVarietySearchLoader } from '../../routes/resources/coffee-varieties.ts';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { CoffeeVarietyPicker, type CoffeeVarietySelection } from './CoffeeVarietyPicker.tsx';

const mockSearch = vi.mocked(coffeeVarietyApi.search);

const GESHA: CoffeeVarietySearchResult = { id: 'var-gesha', name: 'Gesha', category: 'variety' };
const GESHA_VILLAGE: CoffeeVarietySearchResult = {
  id: 'var-gv',
  name: 'Gesha Village',
  category: 'cultivar',
};

/** Controlled harness: owns the selection and reports every change to `onChange`. */
function Harness({
  initial = null,
  onChange,
}: {
  initial?: CoffeeVarietySelection | null;
  onChange: (value: CoffeeVarietySelection | null) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <CoffeeVarietyPicker
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

/** Renders the picker with the real `resources/coffee-varieties/search` resource route. */
function renderPicker(
  props: { initial?: CoffeeVarietySelection | null; onChange?: () => void } = {},
  locale: 'en' | 'tr' = 'en',
) {
  const onChange = props.onChange ?? vi.fn();
  const utils = renderWithAppProviders(
    [
      { path: '/', element: <Harness initial={props.initial} onChange={onChange} /> },
      { path: '/resources/coffee-varieties/search', loader: coffeeVarietySearchLoader },
    ],
    { locale },
  );
  return { ...utils, onChange };
}

/** The labelled search input. */
function searchInput(locale: 'en' | 'tr' = 'en') {
  return screen.getByRole('textbox', { name: t('recipe.form.coffeeVariety', locale) });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockSearch.mockResolvedValue([GESHA, GESHA_VILLAGE]);
});

describe('CoffeeVarietyPicker', () => {
  it('searches through the resource route and lists the matches with their category', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.type(searchInput(), 'ges');

    expect(await screen.findByRole('button', { name: /Gesha Village/ })).toBeInTheDocument();
    expect(screen.getByText('cultivar')).toBeInTheDocument();
    expect(mockSearch).toHaveBeenCalledWith('ges', { signal: expect.any(AbortSignal) });
  });

  it('sends no request for a query shorter than two characters', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.type(searchInput(), 'g');
    // Longer than the debounce delay, so a search would have been triggered by now.
    await new Promise((resolve) => setTimeout(resolve, 450));

    expect(mockSearch).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Gesha/ })).toBeNull();
  });

  it('selects a variety, shows it and resets the search text', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();

    await user.type(searchInput(), 'ges');
    await screen.findByText('Gesha Village');
    await user.click(screen.getByText('Gesha'));

    expect(onChange).toHaveBeenCalledWith({ id: 'var-gesha', name: 'Gesha' });
    expect(searchInput()).toHaveValue('');
    expect(screen.getByText('Gesha')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gesha Village/ })).toBeNull();
  });

  it('shows a pre-selected variety and clears it', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ initial: { id: 'var-pb', name: 'Pink Bourbon' } });

    expect(await screen.findByText('Pink Bourbon')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('recipe.form.coffeeVariety.clear') }));

    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.queryByText('Pink Bourbon')).toBeNull();
  });

  it('says so when nothing matches', async () => {
    mockSearch.mockResolvedValue([]);
    const user = userEvent.setup();
    renderPicker();

    await user.type(searchInput(), 'zzz');

    expect(await screen.findByText(t('recipe.list.coffeeVarietyNoResults'))).toBeInTheDocument();
  });

  it('shows no results when the search fails', async () => {
    mockSearch.mockRejectedValue(new Error('search down'));
    const user = userEvent.setup();
    renderPicker();

    await user.type(searchInput(), 'ges');

    await waitFor(() => expect(mockSearch).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Gesha/ })).toBeNull();
    expect(screen.queryByText(t('recipe.list.coffeeVarietyNoResults'))).toBeNull();
  });

  it('closes the list on Escape', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.type(searchInput(), 'ges');
    await screen.findByRole('button', { name: /Gesha Village/ });
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('button', { name: /Gesha Village/ })).toBeNull();
  });

  it('renders its label, placeholder and clear button in Turkish', async () => {
    renderPicker({ initial: { id: 'var-pb', name: 'Pink Bourbon' } }, 'tr');

    const input = await screen.findByRole('textbox', {
      name: t('recipe.form.coffeeVariety', 'tr'),
    });
    expect(input).toHaveAttribute('placeholder', t('recipe.form.coffeeVariety.placeholder', 'tr'));
    expect(
      screen.getByRole('button', { name: t('recipe.form.coffeeVariety.clear', 'tr') }),
    ).toBeInTheDocument();
  });
});
