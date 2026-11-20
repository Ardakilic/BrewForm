import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../api/index.ts', () => ({
  collectionApi: { get: vi.fn(), update: vi.fn() },
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
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
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import type { CollectionDetailOutput } from '@brewform/shared/schemas';
import { ApiError } from '../../api/errors.ts';
import { collectionApi } from '../../api/index.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { CollectionEditPage, loader } from './CollectionEditPage.tsx';

const mockUseTranslation = vi.mocked(useTranslation);
const mockGet = vi.mocked(collectionApi.get);
const mockUpdate = vi.mocked(collectionApi.update);

// ── Translation helper ─────────────────────────────────────────────────────

const enT = (key: string) => {
  const map: Record<string, string> = {
    'collection.detail.edit': 'Edit Collection',
    'collection.create.name': 'Name',
    'collection.create.description': 'Description',
    'collection.create.visibility': 'Visibility',
    'collection.create.submit': 'Save',
    'collection.create.creating': 'Saving…',
    'collection.visibility.draft': 'Draft',
    'collection.visibility.private': 'Private',
    'collection.visibility.unlisted': 'Unlisted',
    'collection.visibility.public': 'Public',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

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

const HydrateFallback = () => null;

function renderEditPage(id = 'c1') {
  const router = createMemoryRouter(
    [
      {
        path: '/collections/:id/edit',
        element: <CollectionEditPage />,
        loader,
        HydrateFallback,
      },
      { path: '/collections/:id', element: null },
    ],
    { initialEntries: [`/collections/${id}/edit`] },
  );
  return { router, ...render(<RouterProvider router={router} />) };
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockGet.mockResolvedValue(mockCollection);
  mockUpdate.mockResolvedValue(mockCollection);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CollectionEditPage', () => {
  it('pre-fills name, description, and visibility from the loader data', async () => {
    const { container } = renderEditPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue('My Collection')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('A test collection')).toBeInTheDocument();
    expect(container.querySelector('select')!).toHaveValue('public');
  });

  it('renders 4 visibility options in order with the current visibility selected', async () => {
    const { container } = renderEditPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue('My Collection')).toBeInTheDocument();
    });

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

  it('submits name + visibility and omits description when unchanged', async () => {
    const user = userEvent.setup();
    renderEditPage();

    const nameInput = await screen.findByDisplayValue('My Collection');
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });
    expect(mockUpdate).toHaveBeenCalledWith('c1', { name: 'Renamed', visibility: 'public' });
    const payload = mockUpdate.mock.calls[0][1];
    expect(payload).not.toHaveProperty('description');
  });

  it('includes a trimmed description in the payload when it was changed', async () => {
    const user = userEvent.setup();
    renderEditPage();

    const descInput = await screen.findByDisplayValue('A test collection');
    await user.clear(descInput);
    await user.type(descInput, '  New description  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('c1', {
        name: 'My Collection',
        visibility: 'public',
        description: 'New description',
      });
    });
  });
});

describe('CollectionEditPage loader', () => {
  it('throws a 404 Response when the API rejects with ApiError(404)', async () => {
    mockGet.mockRejectedValue(new ApiError('COLLECTION_NOT_FOUND', 'Not found', undefined, 404));

    let caught: unknown;
    try {
      await loader({
        params: { id: 'missing' },
        request: new Request('http://localhost/collections/missing/edit'),
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).status).toBe(404);
  });

  it('throws a 404 Response when the id param is missing', async () => {
    let caught: unknown;
    try {
      await loader({ params: {}, request: new Request('http://localhost/collections//edit') });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).status).toBe(404);
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('CollectionEditPage loader — auth guard', () => {
  it('redirects a final 401 to /login with the encoded return path', async () => {
    mockGet.mockRejectedValue(new ApiError('UNAUTHORIZED', 'no session', undefined, 401));

    const thrown = await loader({
      params: { id: 'c1' },
      request: new Request('http://localhost/collections/c1/edit'),
    }).catch((err: unknown) => err);

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get('Location')).toBe(
      '/login?next=%2Fcollections%2Fc1%2Fedit',
    );
  });
});
