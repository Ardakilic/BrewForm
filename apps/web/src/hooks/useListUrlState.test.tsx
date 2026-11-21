import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readBoolean, readEnum, readPage, readText } from '../utils/list-params.ts';
import { useDebouncedUrlText, useListUrlState } from './useListUrlState.ts';

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

const CATEGORIES = ['', 'arabica', 'robusta', 'recipe'] as const;
const SORTS = ['createdAt', 'rating'] as const;

/** The test page's shared parser (used by both the loader and the controls). */
function parseList(sp: URLSearchParams) {
  return {
    page: readPage(sp),
    category: readEnum(sp, 'category', CATEGORIES, ''),
    sort: readEnum(sp, 'sort', SORTS, 'createdAt'),
    q: readText(sp, 'q', { legacyKeys: ['search'] }),
    unreadOnly: readBoolean(sp, 'unreadOnly'),
  };
}

const DEFAULTS = { sort: 'createdAt' };

let loaderCalls: ReturnType<typeof parseList>[] = [];

/** Loader for the test list route: records what it parsed from the URL. */
function listLoader({ request }: { request: Request }) {
  loaderCalls.push(parseList(new URL(request.url).searchParams));
  return null;
}

/** A list page wired the way real pages use the hooks. */
function ListPage() {
  const { state, setFilter, setPage, clearAll } = useListUrlState(parseList, {
    defaults: DEFAULTS,
  });
  const search = useDebouncedUrlText('q', { legacyKeys: ['search'] });
  return (
    <div>
      <input
        aria-label="search"
        value={search.value}
        onChange={(e) => search.setValue(e.target.value)}
      />
      <select
        aria-label="category"
        value={state.category}
        onChange={(e) => setFilter('category', e.target.value)}
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c || 'all'}
          </option>
        ))}
      </select>
      <select
        aria-label="sort"
        value={state.sort}
        onChange={(e) => setFilter('sort', e.target.value)}
      >
        {SORTS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => setFilter('unreadOnly', !state.unreadOnly)}>
        toggle unread
      </button>
      <span data-testid="page">{state.page}</span>
      <button type="button" onClick={() => setPage(state.page + 1)}>
        next
      </button>
      <button type="button" onClick={() => setPage(1)}>
        first
      </button>
      <button type="button" onClick={clearAll}>
        clear
      </button>
    </div>
  );
}

const HydrateFallback = () => null;

/** Renders the list page at `entry`, after an `/elsewhere` history entry. */
function renderList(entry: string) {
  const router = createMemoryRouter(
    [
      { path: '/list', element: <ListPage />, loader: listLoader, HydrateFallback },
      { path: '/elsewhere', element: <p>elsewhere</p> },
    ],
    { initialEntries: ['/elsewhere', entry], initialIndex: 1 },
  );
  render(<RouterProvider router={router} />);
  return router;
}

/** Waits for the router to be idle. */
async function settled(router: ReturnType<typeof createMemoryRouter>) {
  await waitFor(() => {
    expect(router.state.initialized).toBe(true);
    expect(router.state.navigation.state).toBe('idle');
  });
}

beforeEach(() => {
  loaderCalls = [];
});

describe('useListUrlState — the URL is the source of truth', () => {
  it('a shared link reproduces the view', async () => {
    const router = renderList('/list?category=robusta&sort=rating&page=3');
    await settled(router);

    expect(screen.getByTestId('page').textContent).toBe('3');
    expect((screen.getByLabelText('category') as HTMLSelectElement).value).toBe('robusta');
    expect((screen.getByLabelText('sort') as HTMLSelectElement).value).toBe('rating');
    expect(loaderCalls[0]).toMatchObject({ page: 3, category: 'robusta', sort: 'rating' });
  });

  it('Back and Forward restore selections (discrete controls push history)', async () => {
    const router = renderList('/list');
    await settled(router);

    fireEvent.change(screen.getByLabelText('category'), { target: { value: 'recipe' } });
    await waitFor(() => expect(router.state.location.search).toBe('?category=recipe'));
    fireEvent.click(screen.getByText('next'));
    await waitFor(() => expect(router.state.location.search).toBe('?category=recipe&page=2'));

    await act(() => router.navigate(-1));
    expect(router.state.location.search).toBe('?category=recipe');
    expect(screen.getByTestId('page').textContent).toBe('1');

    await act(() => router.navigate(-1));
    expect(router.state.location.search).toBe('');
    expect((screen.getByLabelText('category') as HTMLSelectElement).value).toBe('');

    await act(() => router.navigate(1));
    expect((screen.getByLabelText('category') as HTMLSelectElement).value).toBe('recipe');
  });

  it('a reload keeps the view (search box and page come from the URL)', async () => {
    const router = renderList('/list?q=ali&page=2');
    await settled(router);

    expect((screen.getByLabelText('search') as HTMLInputElement).value).toBe('ali');
    expect(screen.getByTestId('page').textContent).toBe('2');
  });
});

describe('useListUrlState — page and filter rules', () => {
  it('Next keeps every filter and adds page=2', async () => {
    const router = renderList('/list?category=arabica&sort=rating');
    await settled(router);

    fireEvent.click(screen.getByText('next'));

    await waitFor(() =>
      expect(router.state.location.search).toBe('?category=arabica&sort=rating&page=2'),
    );
    await waitFor(() =>
      expect(loaderCalls.at(-1)).toMatchObject({ page: 2, category: 'arabica', sort: 'rating' }),
    );
  });

  it('a filter change removes the page param (back to page 1)', async () => {
    const router = renderList('/list?category=arabica&page=4');
    await settled(router);

    fireEvent.change(screen.getByLabelText('category'), { target: { value: 'robusta' } });

    await waitFor(() => expect(router.state.location.search).toBe('?category=robusta'));
  });

  it('setPage(1) omits the page param', async () => {
    const router = renderList('/list?category=arabica&page=4');
    await settled(router);

    fireEvent.click(screen.getByText('first'));

    await waitFor(() => expect(router.state.location.search).toBe('?category=arabica'));
  });

  it('defaults are not written (default sort, unreadOnly=false)', async () => {
    const router = renderList('/list?unreadOnly=true&sort=rating&page=3');
    await settled(router);

    fireEvent.click(screen.getByText('toggle unread'));
    await waitFor(() => expect(router.state.location.search).toBe('?sort=rating'));

    fireEvent.change(screen.getByLabelText('sort'), { target: { value: 'createdAt' } });
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it.each(['/list?page=-3', '/list?page=abc', '/list?page=0'])(
    'normalises an invalid page (%s) to page 1 without an error',
    async (entry) => {
      const router = renderList(entry);
      await settled(router);

      expect(screen.getByTestId('page').textContent).toBe('1');
      expect(loaderCalls[0].page).toBe(1);
    },
  );

  it('normalises an unknown enum value to its default', async () => {
    const router = renderList('/list?category=nonsense');
    await settled(router);

    expect((screen.getByLabelText('category') as HTMLSelectElement).value).toBe('');
  });
});

describe('useDebouncedUrlText — debounced, replacing text input', () => {
  it('typing commits once after the pause, replaces history and runs the loader once', async () => {
    const router = renderList('/list?page=2');
    await settled(router);
    const callsBefore = loaderCalls.length;

    await userEvent.type(screen.getByLabelText('search'), 'kenya');
    expect(router.state.location.search).toBe('?page=2');

    await waitFor(() => expect(router.state.location.search).toBe('?q=kenya'), { timeout: 2000 });
    await settled(router);
    expect(router.state.historyAction).toBe('REPLACE');
    expect(loaderCalls.length - callsBefore).toBe(1);
    expect(loaderCalls.at(-1)).toMatchObject({ q: 'kenya', page: 1 });

    // One Back leaves the list entirely: no k, ke, ken, keny entries were pushed.
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe('/elsewhere');
  });

  it('the input follows Back while the text stays committed', async () => {
    const router = renderList('/list');
    await settled(router);

    await userEvent.type(screen.getByLabelText('search'), 'kenya');
    await waitFor(() => expect(router.state.location.search).toBe('?q=kenya'), { timeout: 2000 });
    fireEvent.change(screen.getByLabelText('category'), { target: { value: 'arabica' } });
    await waitFor(() => expect(router.state.location.search).toBe('?q=kenya&category=arabica'));

    await act(() => router.navigate(-1));

    await waitFor(() =>
      expect((screen.getByLabelText('category') as HTMLSelectElement).value).toBe(''),
    );
    expect((screen.getByLabelText('search') as HTMLInputElement).value).toBe('kenya');
  });

  it('re-syncs the input when Back removes the committed text', async () => {
    const router = renderList('/list?q=kenya');
    await settled(router);
    fireEvent.change(screen.getByLabelText('category'), { target: { value: 'arabica' } });
    await waitFor(() => expect(router.state.location.search).toBe('?q=kenya&category=arabica'));

    fireEvent.click(screen.getByText('clear'));

    await waitFor(() => expect(router.state.location.search).toBe(''));
    await waitFor(() =>
      expect((screen.getByLabelText('search') as HTMLInputElement).value).toBe(''),
    );

    await act(() => router.navigate(-1));
    await waitFor(() =>
      expect((screen.getByLabelText('search') as HTMLInputElement).value).toBe('kenya'),
    );
  });

  it('clear-all empties the input along with the URL and drops a pending commit', async () => {
    const router = renderList('/list?q=kenya');
    await settled(router);

    await userEvent.type(screen.getByLabelText('search'), ' aa');
    fireEvent.click(screen.getByText('clear'));

    await waitFor(() => expect(router.state.location.search).toBe(''));
    await waitFor(() =>
      expect((screen.getByLabelText('search') as HTMLInputElement).value).toBe(''),
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(router.state.location.search).toBe('');
  });

  it('accepts a legacy key on read and canonicalises it on commit', async () => {
    const router = renderList('/list?search=gesha&page=3');
    await settled(router);
    expect((screen.getByLabelText('search') as HTMLInputElement).value).toBe('gesha');

    await userEvent.type(screen.getByLabelText('search'), 's');

    await waitFor(() => expect(router.state.location.search).toBe('?q=geshas'), { timeout: 2000 });
  });
});
