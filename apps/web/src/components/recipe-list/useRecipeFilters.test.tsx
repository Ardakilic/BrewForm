import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { useRecipeFilters } from './useRecipeFilters.ts';

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const UUID_A = '11111111-1111-1111-1111-111111111111';
const UUID_B = '22222222-2222-2222-2222-222222222222';

/**
 * TestConsumer renders the hook's return fields to data-testid spans so the
 * test can assert on them. A button is also rendered to invoke updateFilter /
 * clearAllFilters so the test can drive mutations.
 */
function TestConsumer({
  onAction,
}: {
  onAction?: (hooks: ReturnType<typeof useRecipeFilters>) => void;
}) {
  const f = useRecipeFilters();
  return (
    <div>
      <span data-testid='page'>{f.page}</span>
      <span data-testid='sortBy'>{f.sortBy}</span>
      <span data-testid='brewMethod'>{f.brewMethod}</span>
      <span data-testid='drinkType'>{f.drinkType}</span>
      <span data-testid='visibility'>{f.visibility}</span>
      <span data-testid='search'>{f.search}</span>
      <span data-testid='equipmentId'>{f.equipmentId}</span>
      <span data-testid='mainBrewer'>{f.mainBrewer}</span>
      <span data-testid='coffeeVarietyId'>{f.coffeeVarietyId}</span>
      <span data-testid='tasteNoteIds'>{f.tasteNoteIds.join(',')}</span>
      <button
        type='button'
        data-testid='setBrewMethod'
        onClick={() => f.updateFilter('brewMethod', 'v60')}
      >
        setBrewMethod
      </button>
      <button
        type='button'
        data-testid='clearBrewMethod'
        onClick={() => f.updateFilter('brewMethod', '')}
      >
        clearBrewMethod
      </button>
      <button
        type='button'
        data-testid='setTasteNoteIds'
        onClick={() => f.updateFilter('tasteNoteIds', [UUID_A, UUID_B])}
      >
        setTasteNoteIds
      </button>
      <button
        type='button'
        data-testid='setPage'
        onClick={() => f.updateFilter('page', '3')}
      >
        setPage
      </button>
      <button
        type='button'
        data-testid='clearAll'
        onClick={() => f.clearAllFilters()}
      >
        clearAll
      </button>
      {onAction && (
        <button type='button' data-testid='custom' onClick={() => onAction(f)}>custom</button>
      )}
    </div>
  );
}

function renderWithRouter(initialEntries: string[] = ['/']) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <TestConsumer />,
      },
    ],
    { initialEntries },
  );
  return render(<RouterProvider router={router} />);
}

describe('useRecipeFilters', () => {
  it('should return default values when no search params are present', () => {
    renderWithRouter(['/']);
    expect(screen.getByTestId('page').textContent).toBe('1');
    expect(screen.getByTestId('sortBy').textContent).toBe('createdAt');
    expect(screen.getByTestId('brewMethod').textContent).toBe('');
    expect(screen.getByTestId('tasteNoteIds').textContent).toBe('');
  });

  it('should parse scalar filters from the URL query string', () => {
    renderWithRouter(['/?page=2&brewMethod=v60&drinkType=espresso&sortBy=likeCount&search=kenya']);
    expect(screen.getByTestId('page').textContent).toBe('2');
    expect(screen.getByTestId('brewMethod').textContent).toBe('v60');
    expect(screen.getByTestId('drinkType').textContent).toBe('espresso');
    expect(screen.getByTestId('sortBy').textContent).toBe('likeCount');
    expect(screen.getByTestId('search').textContent).toBe('kenya');
  });

  it('should parse tasteNoteIds as comma-separated UUIDs and drop non-UUID entries', () => {
    renderWithRouter([`/?tasteNoteIds=${UUID_A},not-a-uuid,${UUID_B}`]);
    expect(screen.getByTestId('tasteNoteIds').textContent).toBe(`${UUID_A},${UUID_B}`);
  });

  it('should call setSearchParams with the new value when updateFilter sets a scalar', async () => {
    renderWithRouter(['/']);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('setBrewMethod'));
    await waitFor(() => {
      expect(screen.getByTestId('brewMethod').textContent).toBe('v60');
    });
  });

  it('should delete the param when updateFilter is called with an empty string', async () => {
    renderWithRouter(['/?brewMethod=v60']);
    expect(screen.getByTestId('brewMethod').textContent).toBe('v60');
    const user = userEvent.setup();
    await user.click(screen.getByTestId('clearBrewMethod'));
    await waitFor(() => {
      expect(screen.getByTestId('brewMethod').textContent).toBe('');
    });
  });

  it('should join array values with a comma when updateFilter is called with an array', async () => {
    renderWithRouter(['/']);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('setTasteNoteIds'));
    await waitFor(() => {
      expect(screen.getByTestId('tasteNoteIds').textContent).toBe(`${UUID_A},${UUID_B}`);
    });
  });

  it('should always clear the page param when updateFilter is called (reset to page 1)', async () => {
    renderWithRouter(['/?page=3&brewMethod=v60']);
    expect(screen.getByTestId('page').textContent).toBe('3');
    const user = userEvent.setup();
    await user.click(screen.getByTestId('setBrewMethod'));
    // brewMethod stays v60 (already set), but page should reset
    await waitFor(() => {
      expect(screen.getByTestId('page').textContent).toBe('1');
    });
  });

  it('should clear all params when clearAllFilters is called', async () => {
    renderWithRouter(['/?brewMethod=v60&page=2&search=kenya']);
    expect(screen.getByTestId('brewMethod').textContent).toBe('v60');
    const user = userEvent.setup();
    await user.click(screen.getByTestId('clearAll'));
    await waitFor(() => {
      expect(screen.getByTestId('brewMethod').textContent).toBe('');
      expect(screen.getByTestId('search').textContent).toBe('');
      expect(screen.getByTestId('page').textContent).toBe('1');
    });
  });
});
