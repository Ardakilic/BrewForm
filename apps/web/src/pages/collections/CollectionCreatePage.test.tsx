import { t } from '@brewform/shared/i18n';
import type { CollectionDetailOutput } from '@brewform/shared/schemas';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../api/index.ts', () => ({
  collectionApi: { create: vi.fn() },
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
import { action } from './CollectionCreatePage.data.ts';
import { CollectionCreatePage } from './CollectionCreatePage.tsx';

const mockCreate = vi.mocked(collectionApi.create);

// ── Factory helpers ────────────────────────────────────────────────────────

/** A created collection as `POST /collections` returns it. */
function makeCreatedCollection(
  overrides: Partial<CollectionDetailOutput> = {},
): CollectionDetailOutput {
  return {
    id: 'c-new',
    userId: 'u1',
    name: 'New Collection',
    description: null,
    visibility: 'private',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    author: { username: 'alice', displayName: 'Alice', avatarUrl: null },
    items: [],
    recipeCount: 0,
    ...overrides,
  } as CollectionDetailOutput;
}

/** Renders `/collections/new` through its real action inside the app providers. */
function renderCreatePage() {
  return renderWithAppProviders(
    [
      {
        path: '/collections/new',
        action,
        Component: CollectionCreatePage,
        errorElement: <RouteErrorState />,
      },
      { path: '/collections/:id', element: <p>collection page</p> },
    ],
    { initialEntries: ['/collections/new'], auth: 'user' },
  );
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockCreate.mockResolvedValue(makeCreatedCollection());
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CollectionCreatePage', () => {
  it('exposes exactly 4 visibility options in draft/private/unlisted/public order', async () => {
    renderCreatePage();

    const select = await screen.findByRole('combobox');
    const options = Array.from(select.querySelectorAll('option'));
    expect(options).toHaveLength(4);
    expect(options.map((o) => o.getAttribute('value'))).toEqual([
      'draft',
      'private',
      'unlisted',
      'public',
    ]);
  });

  it('disables the submit button while the name is empty', async () => {
    const user = userEvent.setup();
    renderCreatePage();

    const submit = await screen.findByRole('button', { name: t('collection.create.submit') });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(new RegExp(t('collection.create.name'))), 'Espresso');
    expect(submit).toBeEnabled();
  });

  it('submits name + visibility with no description key when the textarea is blank', async () => {
    mockCreate.mockResolvedValue(makeCreatedCollection({ id: 'c-42' }));
    const user = userEvent.setup();
    const { container } = renderCreatePage();

    await user.type(await screen.findByLabelText(new RegExp(t('collection.create.name'))), 'Picks');
    await user.selectOptions(container.querySelector('select')!, 'public');
    await user.click(screen.getByRole('button', { name: t('collection.create.submit') }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
    const payload = mockCreate.mock.calls[0][0];
    expect(payload).toEqual({ name: 'Picks', visibility: 'public' });
    expect(payload).not.toHaveProperty('description');
    expect(mockCreate.mock.calls[0][1]).toEqual({ signal: expect.any(AbortSignal) });
  });

  it('sends a trimmed description and navigates to /collections/:id after create', async () => {
    mockCreate.mockResolvedValue(makeCreatedCollection({ id: 'c-77' }));
    const user = userEvent.setup();
    const { router, container } = renderCreatePage();

    await user.type(
      await screen.findByLabelText(new RegExp(t('collection.create.name'))),
      'Weekend Brews',
    );
    await user.type(container.querySelector('textarea')!, '  curated picks  ');
    await user.selectOptions(container.querySelector('select')!, 'public');
    await user.click(screen.getByRole('button', { name: t('collection.create.submit') }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        { name: 'Weekend Brews', visibility: 'public', description: 'curated picks' },
        { signal: expect.any(AbortSignal) },
      );
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/collections/c-77');
    });
  });

  it('shows the error inline and keeps the typed name when create fails', async () => {
    mockCreate.mockRejectedValue(new ApiError('INTERNAL_ERROR', '', undefined, 500));
    const user = userEvent.setup();
    const { router } = renderCreatePage();

    const name = await screen.findByLabelText(new RegExp(t('collection.create.name')));
    await user.type(name, 'Broken');
    await user.click(screen.getByRole('button', { name: t('collection.create.submit') }));

    expect(await screen.findByText(t('collection.error.save'))).toBeInTheDocument();
    expect(name).toHaveValue('Broken');
    expect(router.state.location.pathname).toBe('/collections/new');
  });
});

describe('/collections/new action', () => {
  /** Calls the action with a JSON body. */
  function runAction(body: unknown) {
    return action({
      params: {},
      request: new Request('http://localhost/collections/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      context: undefined,
    } as never);
  }

  it('redirects to the created collection', async () => {
    mockCreate.mockResolvedValue(makeCreatedCollection({ id: 'c-9' }));

    const result = await runAction({ name: 'A', visibility: 'private' });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get('Location')).toBe('/collections/c-9');
  });

  it('returns { ok: false } with the API error code on a 4xx', async () => {
    mockCreate.mockRejectedValue(new ApiError('VALIDATION_ERROR', 'Name too long', undefined, 400));

    await expect(runAction({ name: 'A', visibility: 'private' })).resolves.toEqual({
      ok: false,
      error: 'Name too long',
      code: 'VALIDATION_ERROR',
    });
  });

  it('redirects a final 401 to /login with the return path', async () => {
    mockCreate.mockRejectedValue(new ApiError('UNAUTHORIZED', 'no session', undefined, 401));

    const thrown = await runAction({ name: 'A', visibility: 'private' }).catch(
      (err: unknown) => err,
    );

    expect((thrown as Response).headers.get('Location')).toBe('/login?next=%2Fcollections%2Fnew');
  });
});
