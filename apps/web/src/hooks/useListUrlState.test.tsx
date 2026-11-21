import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
/** While set, every loader waits for it (a slow load); `release` resolves it. */
let gate: Promise<void> | null = null;
let release: () => void = () => undefined;

/** Holds every loader open until {@link release} is called. */
function holdLoaders() {
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
}

/** Loader for the test list route: records what it parsed from the URL. */
function listLoader({ request }: { request: Request }) {
  loaderCalls.push(parseList(new URL(request.url).searchParams));
  return gate ? gate.then(() => null) : null;
}

/** Loader for the `/elsewhere` route: slow while {@link gate} is set. */
function elsewhereLoader() {
  return gate ? gate.then(() => null) : null;
}

/** A list page wired the way real pages use the hooks. */
function ListPage() {
  const { state, setFilter, setPage, clearAll } = useListUrlState(parseList, {
    defaults: DEFAULTS,
  });
  const search = useDebouncedUrlText('q', { legacyKeys: ['search'] });
  const author = useDebouncedUrlText('author');
  return (
    <div>
      <input
        aria-label="search"
        value={search.value}
        onChange={(e) => search.setValue(e.target.value)}
      />
      <input
        aria-label="author"
        value={author.value}
        onChange={(e) => author.setValue(e.target.value)}
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
      <Link to="/elsewhere">go elsewhere</Link>
    </div>
  );
}

const HydrateFallback = () => null;

/** Renders the list page at `entry`, after an `/elsewhere` history entry. */
function renderList(entry: string) {
  const router = createMemoryRouter(
    [
      { path: '/list', element: <ListPage />, loader: listLoader, HydrateFallback },
      { path: '/elsewhere', element: <p>elsewhere</p>, loader: elsewhereLoader, HydrateFallback },
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
  gate = null;
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

/** The current URL's search params (compare them as a set, not as a string). */
function currentParams(router: ReturnType<typeof createMemoryRouter>) {
  return new URLSearchParams(router.state.location.search);
}

/** Waits (advancing the fake timers) until the router is idle. */
async function settledFake(router: ReturnType<typeof createMemoryRouter>) {
  await vi.waitFor(() => {
    expect(router.state.initialized).toBe(true);
    expect(router.state.navigation.state).toBe('idle');
  });
}

/** Waits until a navigation is loading and the page has re-rendered with it. */
async function loading(router: ReturnType<typeof createMemoryRouter>) {
  await vi.waitFor(() => expect(router.state.navigation.state).toBe('loading'));
  // Flush the re-render that carries the pending navigation.
  await act(() => Promise.resolve());
}

describe('URL writes build on the latest URL (fake timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    release();
    vi.useRealTimers();
  });

  it('a filter chosen during the typing pause is kept', async () => {
    const router = renderList('/list');
    await settledFake(router);

    fireEvent.change(screen.getByLabelText('search'), { target: { value: 'latte' } });
    fireEvent.change(screen.getByLabelText('category'), { target: { value: 'arabica' } });
    await settledFake(router);
    await act(() => vi.advanceTimersByTimeAsync(350));
    await settledFake(router);

    const params = currentParams(router);
    expect(params.get('q')).toBe('latte');
    expect(params.get('category')).toBe('arabica');
  });

  it("two debounced inputs keep each other's text", async () => {
    const router = renderList('/list');
    await settledFake(router);

    fireEvent.change(screen.getByLabelText('search'), { target: { value: 'kenya' } });
    await act(() => vi.advanceTimersByTimeAsync(100));
    fireEvent.change(screen.getByLabelText('author'), { target: { value: 'ali' } });
    // The search box commits at 300 ms and the page renders it before the author box commits.
    await act(() => vi.advanceTimersByTimeAsync(200));
    await settledFake(router);
    await act(() => vi.advanceTimersByTimeAsync(150));
    await settledFake(router);

    const params = currentParams(router);
    expect(params.get('q')).toBe('kenya');
    expect(params.get('author')).toBe('ali');
  });

  it('a filter selected while a slow load runs is kept when the pause ends', async () => {
    const router = renderList('/list');
    await settledFake(router);
    holdLoaders();

    fireEvent.change(screen.getByLabelText('search'), { target: { value: 'latte' } });
    fireEvent.change(screen.getByLabelText('category'), { target: { value: 'arabica' } });
    await loading(router);
    await act(() => vi.advanceTimersByTimeAsync(350));
    release();
    await settledFake(router);

    const params = currentParams(router);
    expect(params.get('q')).toBe('latte');
    expect(params.get('category')).toBe('arabica');
  });

  it('two quick discrete changes during a slow load keep both', async () => {
    const router = renderList('/list');
    await settledFake(router);
    holdLoaders();

    fireEvent.change(screen.getByLabelText('category'), { target: { value: 'arabica' } });
    await loading(router);
    fireEvent.change(screen.getByLabelText('sort'), { target: { value: 'rating' } });
    await loading(router);
    release();
    await settledFake(router);

    const params = currentParams(router);
    expect(params.get('category')).toBe('arabica');
    expect(params.get('sort')).toBe('rating');
  });

  it('leaving the page drops a pending commit', async () => {
    const router = renderList('/list');
    await settledFake(router);
    holdLoaders();

    fireEvent.change(screen.getByLabelText('search'), { target: { value: 'latte' } });
    fireEvent.click(screen.getByText('go elsewhere'));
    await loading(router);
    await act(() => vi.advanceTimersByTimeAsync(350));
    release();
    await settledFake(router);

    expect(router.state.location.pathname).toBe('/elsewhere');
    expect(currentParams(router).get('q')).toBeNull();
  });

  it('clear-all during the typing pause drops the text when the URL had none', async () => {
    const router = renderList('/list');
    await settledFake(router);

    fireEvent.change(screen.getByLabelText('search'), { target: { value: 'kenya' } });
    fireEvent.click(screen.getByText('clear'));
    await act(() => vi.advanceTimersByTimeAsync(350));
    await settledFake(router);

    expect(router.state.location.search).toBe('');
    expect((screen.getByLabelText('search') as HTMLInputElement).value).toBe('');
  });

  it('typing after clear-all still commits', async () => {
    const router = renderList('/list');
    await settledFake(router);

    fireEvent.change(screen.getByLabelText('search'), { target: { value: 'kenya' } });
    fireEvent.click(screen.getByText('clear'));
    await act(() => vi.advanceTimersByTimeAsync(350));
    await settledFake(router);

    fireEvent.change(screen.getByLabelText('search'), { target: { value: 'ali' } });
    await act(() => vi.advanceTimersByTimeAsync(350));
    await settledFake(router);

    expect(router.state.location.search).toBe('?q=ali');
  });

  it('clear-all drops the pending text of two inputs', async () => {
    const router = renderList('/list');
    await settledFake(router);

    fireEvent.change(screen.getByLabelText('search'), { target: { value: 'kenya' } });
    fireEvent.change(screen.getByLabelText('author'), { target: { value: 'ali' } });
    await act(() => vi.advanceTimersByTimeAsync(100));
    fireEvent.click(screen.getByText('clear'));
    await act(() => vi.advanceTimersByTimeAsync(350));
    await settledFake(router);

    expect(router.state.location.search).toBe('');
    expect((screen.getByLabelText('search') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('author') as HTMLInputElement).value).toBe('');
  });
});
