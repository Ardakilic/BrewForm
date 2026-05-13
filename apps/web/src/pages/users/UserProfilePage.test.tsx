import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserProfilePage } from './UserProfilePage';

vi.mock('react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useParams: vi.fn(),
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../../contexts/AuthContext.tsx', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../api/client.ts', () => ({
  api: { get: vi.fn() },
}));

vi.mock('../../components/user/FollowButton.tsx', () => ({
  FollowButton: ({ userId }: { userId: string }) => <button data-testid='follow-button' data-userid={userId}>Follow</button>,
}));

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: vi.fn(() => null),
}));

import { useParams } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { api } from '../../api/client.ts';

const mockUseParams = vi.mocked(useParams);
const mockUseTranslation = vi.mocked(useTranslation);
const mockUseAuth = vi.mocked(useAuth);
const mockApi = vi.mocked(api);

const enT = (key: string) => {
  const map: Record<string, string> = {
    'common.loading': 'Loading...',
    'user.notFound': 'User not found',
    'user.editProfile': 'Edit Profile',
    'user.recipes': 'Recipes',
    'user.badges': 'Badges',
    'user.followers': 'Followers',
    'user.following': 'Following',
    'user.noRecipes': 'No recipes yet',
    'user.noBadges': 'No badges yet',
    'user.noFollowers': 'No followers yet',
    'user.noFollowing': 'Not following anyone yet',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

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
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseParams.mockReturnValue({ username: 'diana' });
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockUseAuth.mockReturnValue(defaultAuth);
  (mockApi.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockProfile);
});

describe('UserProfilePage — FollowButton visibility', () => {
  it('hides FollowButton when user is not logged in', async () => {
    render(<UserProfilePage />);

    const followButton = screen.queryByTestId('follow-button');
    expect(followButton).not.toBeInTheDocument();
  });

  it('shows FollowButton when logged in and viewing another user', async () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth,
      user: {
        id: 'current-user',
        email: 'alice@example.com',
        username: 'alice',
        displayName: null,
        avatarUrl: null,
        isAdmin: false,
        onboardingCompleted: true,
      },
      isAuthenticated: true,
    });

    render(<UserProfilePage />);

    const followButton = await screen.findByTestId('follow-button');
    expect(followButton).toBeInTheDocument();
    expect(followButton).toHaveAttribute('data-userid', 'profile-user-id');
  });

  it('shows Edit Profile link instead of FollowButton when viewing own profile', async () => {
    mockUseAuth.mockReturnValue({
      ...defaultAuth,
      user: {
        id: 'current-user',
        email: 'diana@example.com',
        username: 'diana',
        displayName: null,
        avatarUrl: null,
        isAdmin: false,
        onboardingCompleted: true,
      },
      isAuthenticated: true,
    });

    render(<UserProfilePage />);

    const editProfileLink = await screen.findByText('Edit Profile');
    expect(editProfileLink).toBeInTheDocument();
    expect(editProfileLink).toHaveAttribute('href', '/settings');

    const followButton = screen.queryByTestId('follow-button');
    expect(followButton).not.toBeInTheDocument();
  });
});
