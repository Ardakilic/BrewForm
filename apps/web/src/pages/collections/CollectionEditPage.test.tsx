import { t } from '@brewform/shared/i18n';
import type { CollectionDetailOutput } from '@brewform/shared/schemas';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../api/index.ts', () => ({
  collectionApi: { get: vi.fn(), update: vi.fn() },
}));

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

// ── Imports after mocks ────────────────────────────────────────────────────

import { ApiError } from '../../api/errors.ts';
import { collectionApi } from '../../api/index.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action, loader } from './CollectionEditPage.data.ts';
import { CollectionEditPage } from './CollectionEditPage.tsx';

const mockGet = vi.mocked(collectionApi.get);
const mockUpdate = vi.mocked(collectionApi.update);

// ── Fixtures ───────────────────────────────────────────────────────────────

const mockCollection = {
  id: 'c1',
  userId: 'u-owner',
  name: 'My Collection',
  description: 'A test collection',
  visibility: 'public',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  deletedAt: null,
  author: { username: 'alice', displayName: 'Alice', avatarUrl: null },
  items: [],
  recipeCount: 0,
} as CollectionDetailOutput;

/** Renders `/collections/:id/edit` through its real loader and action. */
function renderEditPage(id = 'c1') {
  return renderWithAppProviders(
    [
      {
        path: '/collections/:id/edit',
        loader,
        action,
        Component: CollectionEditPage,
        errorElement: <RouteErrorState />,
      },
      { path: '/collections/:id', element: <p>collection page</p> },
    ],
    { initialEntries: [`/collections/${id}/edit`], auth: 'user' },
  );
}

/** Calls the loader for collection `id` (or with no id) and returns what it resolved or threw. */
function runLoader(id?: string) {
  return loader({
    params: id ? { id } : {},
    request: new Request(`http://localhost/collections/${id ?? ''}/edit`),
    context: undefined,
  } as never).catch((err: unknown) => err);
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockGet.mockResolvedValue(mockCollection);
  mockUpdate.mockResolvedValue(mockCollection);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CollectionEditPage', () => {
  it('pre-fills name, description, and visibility from the loader data', async () => {
    const { container } = renderEditPage();

    expect(await screen.findByDisplayValue('My Collection')).toBeInTheDocument();
    expect(screen.getByDisplayValue('A test collection')).toBeInTheDocument();
    expect(container.querySelector('select')!).toHaveValue('public');
  });

  it('renders 4 visibility options in order with the current visibility selected', async () => {
    const { container } = renderEditPage();

    await screen.findByDisplayValue('My Collection');

    const select = container.querySelector('select')!;
    const options = Array.from(select.querySelectorAll('option'));
    expect(options).toHaveLength(4);
    expect(options.map((o) => o.getAttribute('value'))).toEqual([
      'draft',
      'private',
      'unlisted',
      'public',
    ]);
    expect(select).toHaveValue('public');
  });

  it('submits name + visibility, omits an unchanged description, and opens the collection', async () => {
    const user = userEvent.setup();
    const { router } = renderEditPage();

    const nameInput = await screen.findByDisplayValue('My Collection');
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed');
    await user.click(screen.getByRole('button', { name: t('collection.create.submit') }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });
    expect(mockUpdate).toHaveBeenCalledWith(
      'c1',
      { name: 'Renamed', visibility: 'public' },
      { signal: expect.any(AbortSignal) },
    );
    expect(mockUpdate.mock.calls[0][1]).not.toHaveProperty('description');
    await waitFor(() => expect(router.state.location.pathname).toBe('/collections/c1'));
  });

  it('includes a trimmed description in the payload when it was changed', async () => {
    const user = userEvent.setup();
    renderEditPage();

    const descInput = await screen.findByDisplayValue('A test collection');
    await user.clear(descInput);
    await user.type(descInput, '  New description  ');
    await user.click(screen.getByRole('button', { name: t('collection.create.submit') }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        'c1',
        { name: 'My Collection', visibility: 'public', description: 'New description' },
        { signal: expect.any(AbortSignal) },
      );
    });
  });

  it('shows the error inline and stays on the form when the update fails', async () => {
    mockUpdate.mockRejectedValue(new ApiError('INTERNAL_ERROR', '', undefined, 500));
    const user = userEvent.setup();
    const { router } = renderEditPage();

    await screen.findByDisplayValue('My Collection');
    await user.click(screen.getByRole('button', { name: t('collection.create.submit') }));

    expect(await screen.findByText(t('collection.error.save'))).toBeInTheDocument();
    expect(screen.getByDisplayValue('My Collection')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/collections/c1/edit');
  });

  it('renders the not-found page when the collection does not exist', async () => {
    mockGet.mockRejectedValue(new ApiError('COLLECTION_NOT_FOUND', 'Not found', undefined, 404));
    renderEditPage('missing');

    expect(await screen.findByText(t('error.404'))).toBeInTheDocument();
  });
});

describe('CollectionEditPage loader', () => {
  it('forwards the request signal to collectionApi.get', async () => {
    await runLoader('c1');
    expect(mockGet).toHaveBeenCalledWith('c1', { signal: expect.any(AbortSignal) });
  });

  it('throws a 404 Response when the API rejects with ApiError(404)', async () => {
    mockGet.mockRejectedValue(new ApiError('COLLECTION_NOT_FOUND', 'Not found', undefined, 404));

    const caught = await runLoader('missing');

    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).status).toBe(404);
  });

  it('throws a 404 Response when the id param is missing', async () => {
    const caught = await runLoader();

    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).status).toBe(404);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('redirects a final 401 to /login with the encoded return path', async () => {
    mockGet.mockRejectedValue(new ApiError('UNAUTHORIZED', 'no session', undefined, 401));

    const thrown = await runLoader('c1');

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get('Location')).toBe(
      '/login?next=%2Fcollections%2Fc1%2Fedit',
    );
  });
});
