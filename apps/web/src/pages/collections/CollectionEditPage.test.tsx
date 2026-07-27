import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../api/index.ts', () => ({
  collectionApi: { get: vi.fn(), update: vi.fn() },
  ApiError: class extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status = 500) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
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

import { useTranslation } from '../../contexts/I18nContext.tsx';
import { ApiError, collectionApi } from '../../api/index.ts';
import type { CollectionDetailOutput } from '@brewform/shared/schemas';
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
  // The mocked ApiError (see vi.mock above) has the runtime signature
  // (code, message, status) — different from the real client's
  // (code, message, details?, status). Cast once so the mocked constructor
  // can be called with its runtime signature in a type-safe way.
  const MockApiError = ApiError as unknown as new (
    code: string,
    message: string,
    status?: number,
  ) => ApiError;

  it('throws a 404 Response when the API rejects with ApiError(404)', async () => {
    mockGet.mockRejectedValue(new MockApiError('COLLECTION_NOT_FOUND', 'Not found', 404));

    let caught: unknown;
    try {
      await loader({ params: { id: 'missing' } });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).status).toBe(404);
  });

  it('throws a 404 Response when the id param is missing', async () => {
    let caught: unknown;
    try {
      await loader({ params: {} });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).status).toBe(404);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
