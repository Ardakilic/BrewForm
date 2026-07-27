import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../api/index.ts', () => ({
  collectionApi: { list: vi.fn() },
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
import { collectionApi } from '../../api/index.ts';
import type { CollectionListItemOutput, PaginatedResponse } from '@brewform/shared/schemas';
import { CollectionListPage, loader } from './CollectionListPage.tsx';

const mockUseTranslation = vi.mocked(useTranslation);
const mockList = vi.mocked(collectionApi.list);

// ── Translation helper ─────────────────────────────────────────────────────

const enT = (key: string) => {
  const map: Record<string, string> = {
    'collection.list.title': 'My Collections',
    'collection.list.create': 'Create Collection',
    'collection.list.noResults': 'You have no collections yet.',
    'collection.detail.recipes': 'recipes',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

// ── Factory helpers (mirrors AddToCollectionModal.test.tsx) ────────────────

function makeCollection(
  overrides: Partial<CollectionListItemOutput> = {},
): CollectionListItemOutput {
  return {
    id: 'c1',
    userId: 'u1',
    name: 'Alpha',
    description: null,
    visibility: 'private',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    recipeCount: 2,
    ...overrides,
  };
}

function makeListResponse(
  data: CollectionListItemOutput[],
): PaginatedResponse<CollectionListItemOutput> {
  return {
    success: true,
    data,
    meta: {
      requestId: 'test',
      pagination: { page: 1, perPage: 20, total: data.length, totalPages: 1 },
    },
  };
}

const HydrateFallback = () => null;

function renderListPage() {
  const router = createMemoryRouter(
    [{ path: '/collections', element: <CollectionListPage />, loader, HydrateFallback }],
    { initialEntries: ['/collections'] },
  );
  return render(<RouterProvider router={router} />);
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockList.mockResolvedValue(makeListResponse([]));
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CollectionListPage', () => {
  it('renders the page title and a Create link to /collections/new', async () => {
    renderListPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'My Collections' })).toBeInTheDocument();
    });

    const createLink = screen.getByRole('link', { name: 'Create Collection' });
    expect(createLink.getAttribute('href')).toBe('/collections/new');
  });

  it('renders the empty-state message when the user has no collections', async () => {
    renderListPage();

    await waitFor(() => {
      expect(screen.getByText('You have no collections yet.')).toBeInTheDocument();
    });
  });

  it('renders collection cards whose links point to /collections/:id', async () => {
    mockList.mockResolvedValue(
      makeListResponse([
        makeCollection({ id: 'c1', name: 'Alpha' }),
        makeCollection({ id: 'c2', name: 'Beta', recipeCount: 5 }),
      ]),
    );

    renderListPage();

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
    });

    const alphaLink = screen.getByText('Alpha').closest('a');
    const betaLink = screen.getByText('Beta').closest('a');
    expect(alphaLink).not.toBeNull();
    expect(betaLink).not.toBeNull();
    expect(alphaLink!.getAttribute('href')).toBe('/collections/c1');
    expect(betaLink!.getAttribute('href')).toBe('/collections/c2');
  });
});
