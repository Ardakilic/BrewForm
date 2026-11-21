import { t } from '@brewform/shared/i18n';
import type { TasteNoteOutput } from '@brewform/shared/schemas';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { tasteNotesLoader } from '../../routes/resources/taste-notes.ts';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { TasteAutocomplete } from './TasteAutocomplete.tsx';

// ── Mock the static cache behind the resources/taste-notes route ───────────

vi.mock('../../api/static-cache.ts', () => ({
  getTasteNotesCached: vi.fn(),
}));

import { getTasteNotesCached } from '../../api/static-cache.ts';

const mockGetTasteNotes = vi.mocked(getTasteNotesCached);

/** Renders `ui` with the real `resources/taste-notes` resource route registered. */
function renderWithRouter(ui: ReactElement) {
  const router = createMemoryRouter(
    [
      { path: '/', element: ui },
      { path: '/resources/taste-notes', loader: tasteNotesLoader },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

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

  const utils = renderWithRouter(
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
    mockGetTasteNotes.mockReset();
    mockGetTasteNotes.mockResolvedValue(tasteNotes as TasteNoteOutput[]);
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
    renderWithRouter(<TasteAutocomplete selectedIds={[]} onSelectionChange={onSelectionChange} />);

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

  it('shows a removable chip for a linked note missing from the catalog', async () => {
    const user = userEvent.setup();
    const { onSelectionChange } = setup({
      selectedIds: ['gone-1'],
      linkedNotes: [{ id: 'gone-1', name: 'Tobacco', depth: 2, parentId: 'mid-x' }],
    });

    const remove = await screen.findByRole('button', { name: 'Remove Tobacco' });
    await user.click(remove);

    expect(onSelectionChange).toHaveBeenCalledWith([]);
  });

  it('does not offer a linked-only note in the dropdown', async () => {
    const user = userEvent.setup();
    setup({
      selectedIds: ['gone-1'],
      linkedNotes: [{ id: 'gone-1', name: 'Tobacco', depth: 2, parentId: 'mid-x' }],
    });

    await user.click(screen.getByPlaceholderText('Search SCAA taste notes...'));
    await screen.findByText('Raspberry');

    expect(screen.queryByRole('option', { name: /Tobacco/ })).toBeNull();
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
    // NOTE: jsdom 31 no longer echoes var() through computed style, so assert
    // the inline style the component sets instead of toHaveStyle().
    expect(options[0].style.backgroundColor).toBe('var(--bg-secondary)');

    // ArrowDown to second item
    await user.keyboard('{ArrowDown}');
    expect(options[1].style.backgroundColor).toBe('var(--bg-secondary)');

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
    mockGetTasteNotes.mockImplementation(() => new Promise(() => undefined)); // never resolves
    setup();

    const input = screen.getByPlaceholderText('Search SCAA taste notes...');
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByText('Loading taste notes...')).toBeInTheDocument();
    });
  });

  it('loads the notes once through the resource route, forwarding the request signal', async () => {
    setup();

    await waitFor(() => {
      expect(mockGetTasteNotes).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
    });
    expect(mockGetTasteNotes).toHaveBeenCalledTimes(1);
  });

  it('stays in the loading state when the lookup fails', async () => {
    mockGetTasteNotes.mockRejectedValue(new Error('down'));
    setup();

    fireEvent.focus(screen.getByPlaceholderText('Search SCAA taste notes...'));

    await waitFor(() => expect(mockGetTasteNotes).toHaveBeenCalled());
    expect(screen.getByText('Loading taste notes...')).toBeInTheDocument();
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

describe('tr locale', () => {
  beforeEach(() => {
    mockGetTasteNotes.mockReset();
    mockGetTasteNotes.mockResolvedValue(tasteNotes as TasteNoteOutput[]);
    localStorage.clear();
  });

  /** Renders the picker with the app providers in Turkish and the taste-notes resource route. */
  function renderTr(props: Partial<React.ComponentProps<typeof TasteAutocomplete>> = {}) {
    return renderWithAppProviders(
      [
        {
          path: '/',
          element: (
            <TasteAutocomplete
              selectedIds={[]}
              onSelectionChange={vi.fn()}
              onIntensitiesChange={vi.fn()}
              {...props}
            />
          ),
        },
        { path: '/resources/taste-notes', loader: tasteNotesLoader },
      ],
      { locale: 'tr' },
    );
  }

  it('renders the hint and the flavour-wheel link in Turkish', async () => {
    renderTr();

    expect(
      await screen.findByText(t('taste.autocomplete.intensityHint', 'tr')),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t('taste.reference', 'tr') })).toBeInTheDocument();
  });

  it('shows the Turkish loading text while the lookup runs', async () => {
    mockGetTasteNotes.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    renderTr();

    await user.click(await screen.findByPlaceholderText(t('taste.autocomplete.placeholder', 'tr')));

    expect(screen.getByText(t('taste.autocomplete.loading', 'tr'))).toBeInTheDocument();
  });

  it('titles the intensity button in Turkish', async () => {
    renderTr({ selectedIds: ['leaf-1'], intensities: { 'leaf-1': 2 } });

    const button = await screen.findByRole('button', {
      name: t('a11y.taste.setIntensity', 'tr').replace('{name}', 'Raspberry'),
    });

    expect(button).toHaveAttribute(
      'title',
      t('a11y.taste.intensityTitle', 'tr').replace('{level}', '2'),
    );
  });

  it('shows the Turkish empty text when nothing matches', async () => {
    const user = userEvent.setup();
    renderTr();
    const input = await screen.findByPlaceholderText(t('taste.autocomplete.placeholder', 'tr'));
    await user.click(input);
    await screen.findByText('Raspberry');

    fireEvent.change(input, { target: { value: 'zzz' } });

    expect(await screen.findByText(t('taste.notFound', 'tr'))).toBeInTheDocument();
  });
});
