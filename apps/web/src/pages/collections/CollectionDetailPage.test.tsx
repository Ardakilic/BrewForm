import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../api/index.ts', () => ({
  collectionApi: { get: vi.fn() },
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
  I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTranslation: vi.fn(),
}));

vi.mock('../../contexts/AuthContext.tsx', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: vi.fn(),
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

vi.mock('../../components/collections/CollectionRecipeList.tsx', () => ({
  CollectionRecipeList: () => <div data-testid='recipe-list' />,
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { collectionApi } from '../../api/index.ts';
import type { CollectionDetailOutput } from '@brewform/shared/schemas';
import { CollectionDetailPage, loader } from './CollectionDetailPage.tsx';

const mockUseTranslation = vi.mocked(useTranslation);
const mockUseAuth = vi.mocked(useAuth);
const mockCollectionGet = vi.mocked(collectionApi.get);

// ── Translation helper ─────────────────────────────────────────────────────

const enT = (key: string) => {
  const map: Record<string, string> = {
    'collection.detail.recipes': 'recipes',
    'collection.detail.noRecipes': 'This collection has no recipes yet.',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

const defaultAuth = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  sessionError: null as 'network' | 'server' | null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
  clearSessionError: vi.fn(),
};

const HydrateFallback = () => null;

function renderDetailPage(id = 'c1') {
  const router = createMemoryRouter(
    [{ path: '/collections/:id', element: <CollectionDetailPage />, loader, HydrateFallback }],
    { initialEntries: [`/collections/${id}`] },
  );
  return render(<RouterProvider router={router} />);
}

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

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockUseAuth.mockReturnValue(defaultAuth as ReturnType<typeof useAuth>);
  mockCollectionGet.mockResolvedValue(mockCollection);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CollectionDetailPage', () => {
  it('renders the author link pointing to /u/:username (not /users/:username)', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    const authorLink = screen.getByText('Alice').closest('a');
    expect(authorLink).not.toBeNull();
    expect(authorLink!.getAttribute('href')).toBe('/u/alice');
    // Sanity check: must NOT be /users/alice
    expect(authorLink!.getAttribute('href')).not.toBe('/users/alice');
  });

  it('renders the collection name and recipe count', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('My Collection')).toBeInTheDocument();
      expect(screen.getByText(/recipes: 0/)).toBeInTheDocument();
    });
  });

  it('does not show edit button for non-owners', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('My Collection')).toBeInTheDocument();
    });

    // "Edit" is the i18n key 'collection.detail.edit' — non-owner should not see it
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });
});
