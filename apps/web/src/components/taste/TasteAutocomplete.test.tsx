import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TasteAutocomplete } from './TasteAutocomplete.tsx';

// ── Mock API ───────────────────────────────────────────────────────────────

vi.mock('../../api/index.ts', () => ({
  api: { get: vi.fn() },
}));

import { api } from '../../api/index.ts';
const mockApiGet = vi.mocked(api.get);

// ── Taste note fixtures ────────────────────────────────────────────────────

const tasteNotes = [
  { id: 'root-1', name: 'Fruity', depth: 0, parentId: null },
  { id: 'mid-1', name: 'Berry', depth: 1, parentId: 'root-1' },
  { id: 'leaf-1', name: 'Raspberry', depth: 2, parentId: 'mid-1' },
  { id: 'leaf-2', name: 'Blueberry', depth: 2, parentId: 'mid-1' },
  { id: 'root-2', name: 'Floral', depth: 0, parentId: null },
  { id: 'mid-2', name: 'Rose', depth: 1, parentId: 'root-2' },
];

// ── Helper ─────────────────────────────────────────────────────────────────

function setup(props: Partial<React.ComponentProps<typeof TasteAutocomplete>> = {}) {
  const onSelectionChange = vi.fn();
  const onIntensitiesChange = vi.fn();

  const utils = render(
    <TasteAutocomplete
      selectedIds={[]}
      onSelectionChange={onSelectionChange}
      onIntensitiesChange={onIntensitiesChange}
      {...props}
    />,
  );

  return { ...utils, onSelectionChange, onIntensitiesChange };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('TasteAutocomplete', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiGet.mockResolvedValue(tasteNotes);
  });

  it('shows all notes grouped by category on focus', async () => {
    const user = userEvent.setup();
    setup();

    const input = screen.getByPlaceholderText('Search SCAA taste notes...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByText('Fruity')).toBeInTheDocument();
      expect(screen.getByText('Floral')).toBeInTheDocument();
    });

    // Sub-group label under Fruity
    expect(screen.getByText('Fruity > Berry')).toBeInTheDocument();
    // Items under Fruity
    expect(screen.getByText('Raspberry')).toBeInTheDocument();
    expect(screen.getByText('Blueberry')).toBeInTheDocument();

    // Item under Floral (Rose is depth-1 without children — still selectable)
    expect(screen.getByText('Rose')).toBeInTheDocument();
  });

  it('filters items when typing in the search input', async () => {
    const user = userEvent.setup();
    setup();

    const input = screen.getByPlaceholderText('Search SCAA taste notes...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBe(3);
    });

    await user.type(input, 'Rasp');

    await waitFor(() => {
      const options = screen.getAllByRole('option');
      expect(options.length).toBe(1);
      expect(options[0]).toHaveTextContent('Raspberry');
    });
  });

  it('shows empty state when search yields no results', async () => {
    const user = userEvent.setup();
    setup();

    const input = screen.getByPlaceholderText('Search SCAA taste notes...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    });

    await user.type(input, 'zzz');

    await waitFor(() => {
      expect(screen.getByText('No taste notes found.')).toBeInTheDocument();
      expect(screen.queryAllByRole('option').length).toBe(0);
    });
  });

  it('categories are not selectable and do not have option role', async () => {
    const user = userEvent.setup();
    setup();

    const input = screen.getByPlaceholderText('Search SCAA taste notes...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByText('Fruity')).toBeInTheDocument();
    });

    const fruity = screen.getByText('Fruity');
    expect(fruity.closest('li')).not.toHaveAttribute('role', 'option');

    // Clicking a category should not trigger selection
    const onSelectionChange = vi.fn();
    render(
      <TasteAutocomplete
        selectedIds={[]}
        onSelectionChange={onSelectionChange}
      />,
    );

    const input2 = screen.getAllByPlaceholderText('Search SCAA taste notes...')[1];
    await user.click(input2);

    await waitFor(() => {
      expect(screen.getAllByText('Fruity').length).toBeGreaterThan(0);
    });

    const category = screen.getAllByText('Fruity')[1];
    await user.click(category);

    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('renders selected chips with intensity controls', async () => {
    setup({
      selectedIds: ['leaf-1'],
      intensities: { 'leaf-1': 2 },
    });

    await waitFor(() => {
      expect(screen.getByText('Raspberry')).toBeInTheDocument();
    });

    const chip = screen.getByText('Raspberry').closest('div');
    expect(chip).toBeTruthy();

    const intensityButton = screen.getByLabelText('Set intensity for Raspberry');
    expect(intensityButton).toBeInTheDocument();

    const removeButton = screen.getByLabelText('Remove Raspberry');
    expect(removeButton).toBeInTheDocument();
  });

  it('cycles intensity when clicking the intensity button', async () => {
    const onIntensitiesChange = vi.fn();
    setup({
      selectedIds: ['leaf-1'],
      intensities: { 'leaf-1': 2 },
      onIntensitiesChange,
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Set intensity for Raspberry')).toBeInTheDocument();
    });

    const intensityButton = screen.getByLabelText('Set intensity for Raspberry');
    fireEvent.click(intensityButton);

    expect(onIntensitiesChange).toHaveBeenCalledWith({ 'leaf-1': 3 });
  });

  it('removes a note when clicking the remove button', async () => {
    const onSelectionChange = vi.fn();
    setup({
      selectedIds: ['leaf-1'],
      onSelectionChange,
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Remove Raspberry')).toBeInTheDocument();
    });

    const removeButton = screen.getByLabelText('Remove Raspberry');
    fireEvent.click(removeButton);

    expect(onSelectionChange).toHaveBeenCalledWith([]);
  });

  it('navigates with keyboard arrow keys and selects with Enter', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    setup({ onSelectionChange });

    const input = screen.getByPlaceholderText('Search SCAA taste notes...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBe(3);
    });

    // First item should be highlighted by default
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveStyle({ backgroundColor: 'var(--bg-secondary)' });

    // ArrowDown to second item
    await user.keyboard('{ArrowDown}');
    expect(options[1]).toHaveStyle({ backgroundColor: 'var(--bg-secondary)' });

    // Enter selects second item
    await user.keyboard('{Enter}');
    expect(onSelectionChange).toHaveBeenCalled();
  });

  it('closes the dropdown on Escape', async () => {
    const user = userEvent.setup();
    setup();

    const input = screen.getByPlaceholderText('Search SCAA taste notes...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBe(3);
    });

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryAllByRole('option').length).toBe(0);
    });
  });

  it('shows loading state when taste notes have not loaded yet', async () => {
    mockApiGet.mockImplementation(() => new Promise(() => {})); // never resolves
    setup();

    const input = screen.getByPlaceholderText('Search SCAA taste notes...');
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByText('Loading taste notes...')).toBeInTheDocument();
    });
  });

  it('toggles a note on click', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    setup({ onSelectionChange });

    const input = screen.getByPlaceholderText('Search SCAA taste notes...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByText('Raspberry')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Raspberry'));
    expect(onSelectionChange).toHaveBeenCalledWith(['leaf-1']);
  });
});
