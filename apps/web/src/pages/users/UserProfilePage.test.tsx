import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    useSearchParams: vi.fn(),
  };
});

vi.mock('../../contexts/I18nContext.tsx', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTranslation: vi.fn(),
}));

vi.mock('../../contexts/AuthContext.tsx', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: vi.fn(),
}));

vi.mock('../../api/client.ts', () => ({
  api: { get: vi.fn(), getWithMeta: vi.fn() },
  ApiError: class extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.status = 500;
    }
  },
}));

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: vi.fn(() => null),
}));

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { useSearchParams } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { api } from '../../api/client.ts';
import { loader, UserProfilePage } from './UserProfilePage.tsx';

const mockUseSearchParams = vi.mocked(useSearchParams);
const mockUseTranslation = vi.mocked(useTranslation);
const mockUseAuth = vi.mocked(useAuth);
const mockApiGet = vi.mocked(api.get);
const mockApiGetWithMeta = vi.mocked(api.getWithMeta);

// ── Translation helpers ────────────────────────────────────────────────────

const enT = (key: string) => {
  const map: Record<string, string> = {
    'common.loading': 'Loading...',
    'user.notFound': 'User not found.',
    'user.editProfile': 'Edit Profile',
    'user.recipes': 'Recipes',
    'user.badges': 'Badges',
    'user.followers': 'Followers',
    'user.following': 'Following',
    'user.noRecipes': 'No recipes yet.',
    'user.noBadges': 'No badges yet.',
    'user.noFollowers': 'No followers yet.',
    'user.noFollowing': 'Not following anyone yet.',
    'user.collections': 'Collections',
    'user.noCollections': 'No collections yet.',
    'collection.detail.recipes': 'recipes',
    'a11y.userAvatar': "{name}'s avatar",
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSearchParams(init: Record<string, string> = {}) {
  const params = new URLSearchParams(init);
  return [params, vi.fn()] as ReturnType<typeof useSearchParams>;
}

const mockProfile = {
  id: 'profile-user-id',
  username: 'diana',
  displayName: 'Diana',
  avatarUrl: null,
  bio: 'Coffee lover',
  followerCount: 10,
  followingCount: 5,
  recipeCount: 3,
  isFollowing: false,
  badges: [],
  recipes: [],
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

const mockCollection = {
  id: 'c1',
  userId: 'profile-user-id',
  name: 'Favorites',
  description: 'My favorite recipes',
  visibility: 'private',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  deletedAt: null,
  recipeCount: 3,
};

const HydrateFallback = () => null;

function renderProfilePage(username = 'diana', tab = 'recipes') {
  const router = createMemoryRouter(
    [{ path: '/u/:username', element: <UserProfilePage />, loader, HydrateFallback }],
    { initialEntries: [`/u/${username}?tab=${tab}`] },
  );
  return render(<RouterProvider router={router} />);
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSearchParams.mockReturnValue(makeSearchParams());
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockUseAuth.mockReturnValue(defaultAuth as ReturnType<typeof useAuth>);
  mockApiGet.mockResolvedValue(mockProfile);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('UserProfilePage — FollowButton visibility', () => {
  it('hides FollowButton when user is not logged in', async () => {
    renderProfilePage();

    await waitFor(() => {
      expect(screen.getByText('Diana')).toBeInTheDocument();
    });

    expect(screen.queryByText('Follow')).not.toBeInTheDocument();
  });

  it('shows FollowButton when logged in and viewing another user', async () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth,
      user: {
        id: 'current-user',
        email: 'alice@example.com',
        emailVerifiedAt: null,
        username: 'alice',
        displayName: null,
        avatarUrl: null,
        isAdmin: false,
        onboardingCompleted: true,
      },
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);

    renderProfilePage();

    const followButton = await screen.findByText('Follow');
    expect(followButton).toBeInTheDocument();
  });

  it('shows Edit Profile link instead of FollowButton when viewing own profile', async () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth,
      user: {
        id: 'current-user',
        email: 'diana@example.com',
        emailVerifiedAt: null,
        username: 'diana',
        displayName: null,
        avatarUrl: null,
        isAdmin: false,
        onboardingCompleted: true,
      },
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);

    renderProfilePage();

    const editProfileLink = await screen.findByText('Edit Profile');
    expect(editProfileLink).toBeInTheDocument();
    expect(editProfileLink).toHaveAttribute('href', '/settings');

    expect(screen.queryByText('Follow')).not.toBeInTheDocument();
  });
});

describe('UserProfilePage — shared cards', () => {
  it('renders profile recipes via RecipeCard with the author hidden', async () => {
    mockApiGet.mockResolvedValue({
      ...mockProfile,
      recipes: [
        {
          id: 'r1',
          slug: 'my-recipe',
          title: 'My Recipe',
          likeCount: 3,
          commentCount: 1,
          createdAt: '2024-01-01T00:00:00Z',
          currentVersion: null,
        },
      ],
    });

    renderProfilePage();

    await waitFor(() => {
      expect(screen.getByText('My Recipe')).toBeInTheDocument();
    });

    // RecipeCard wraps the title in a link to /recipes/:slug
    const link = screen.getByText('My Recipe').closest('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('/recipes/my-recipe');

    // hideAuthor → no "by unknown" fallback even though the projection has no author
    expect(screen.queryByText('unknown')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /by/i })).not.toBeInTheDocument();
  });

  it('renders collections via CollectionCard on the collections tab (badge + description)', async () => {
    mockUseSearchParams.mockReturnValue(makeSearchParams({ tab: 'collections' }));
    mockApiGetWithMeta.mockResolvedValue({
      success: true,
      data: [mockCollection],
      meta: { requestId: 'test', pagination: { page: 1, perPage: 20, total: 1, totalPages: 1 } },
    });

    renderProfilePage('diana', 'collections');

    await waitFor(() => {
      expect(screen.getByText('Favorites')).toBeInTheDocument();
    });

    // CollectionCard restores the visibility badge and description the inline copy dropped
    expect(screen.getByText('🔒')).toBeInTheDocument();
    expect(screen.getByText('My favorite recipes')).toBeInTheDocument();
    expect(screen.getByText(/3 recipes/)).toBeInTheDocument();
  });
});
