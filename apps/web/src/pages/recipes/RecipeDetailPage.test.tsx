import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RecipeDetailPage } from './RecipeDetailPage';

// ── External deps ──────────────────────────────────────────────────────────

vi.mock('react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useParams: vi.fn(),
  useSearchParams: vi.fn(),
  useNavigate: vi.fn(),
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../../contexts/AuthContext.tsx', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../api/index.ts', () => ({
  recipeApi: { get: vi.fn(), rate: vi.fn() },
}));

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: vi.fn(() => null),
}));
vi.mock('../../components/seo/JsonLd.tsx', () => ({ RecipeJsonLd: () => null }));
vi.mock('../../components/recipe/LikeButton.tsx', () => ({ LikeButton: () => null }));
vi.mock('../../components/recipe/FavouriteButton.tsx', () => ({ FavouriteButton: () => null }));
vi.mock('../../components/recipe/CommentSection.tsx', () => ({ CommentSection: () => null }));
vi.mock('../../components/recipe/StarRating.tsx', () => ({ StarRating: () => null }));
vi.mock('../../components/recipe/ForkCard.tsx', () => ({ ForkCard: () => <div data-testid="fork-card">ForkCard</div> }));
vi.mock('@brewform/shared/constants', () => ({ EMOJI_TAGS: [] }));

// New component mocks for redesigned page
vi.mock('../../components/recipe/BreadcrumbNav.tsx', () => ({ BreadcrumbNav: () => <div data-testid="breadcrumb-nav" /> }));
vi.mock('../../components/recipe/MetadataBadges.tsx', () => ({ MetadataBadges: () => <div data-testid="metadata-badges" /> }));
vi.mock('../../components/recipe/StatCards.tsx', () => ({ StatCards: () => <div data-testid="stat-cards" /> }));
vi.mock('../../components/recipe/BeanSection.tsx', () => ({ BeanSection: () => <div data-testid="bean-section" /> }));
vi.mock('../../components/recipe/BrewTimeline.tsx', () => ({ BrewTimeline: () => <div data-testid="brew-timeline" /> }));
vi.mock('../../components/recipe/EquipmentSection.tsx', () => ({ EquipmentSection: () => <div data-testid="equipment-section" /> }));
vi.mock('../../components/recipe/TastingNotesSection.tsx', () => ({ TastingNotesSection: () => <div data-testid="tasting-notes-section" /> }));
vi.mock('../../components/recipe/ShareSection.tsx', () => ({ ShareSection: () => <div data-testid="share-section" /> }));

// ── Imports after mocks ────────────────────────────────────────────────────

import { useParams, useSearchParams, useNavigate } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { recipeApi } from '../../api/index.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';

const mockUseParams = vi.mocked(useParams);
const mockUseSearchParams = vi.mocked(useSearchParams);
const mockUseNavigate = vi.mocked(useNavigate);
const mockUseTranslation = vi.mocked(useTranslation);
const mockUseAuth = vi.mocked(useAuth);
const mockRecipeApi = vi.mocked(recipeApi);
const mockSEOHead = vi.mocked(SEOHead);

// ── Translation helpers ────────────────────────────────────────────────────

const enT = (key: string) => {
  const map: Record<string, string> = {
    'common.loading': 'Loading...',
    'common.edit': 'Edit',
    'recipe.notFound': 'Recipe not found',
    'recipe.rating': 'Rating',
    'recipe.authorRating': "Author's rating",
    'recipe.communityAvg': 'Community average',
    'recipe.rateThis': 'Rate this recipe',
    'recipe.yourRating': 'Your rating',
    'recipe.fork': 'Fork Recipe',
  };
  return map[key] ?? key;
};

const trT = (key: string) => {
  const map: Record<string, string> = {
    'common.loading': 'Yükleniyor...',
    'common.edit': 'Düzenle',
    'recipe.notFound': 'Tarif bulunamadı',
    'recipe.rating': 'Puan',
    'recipe.authorRating': 'Yazarın puanı',
    'recipe.communityAvg': 'Topluluk ortalaması',
    'recipe.rateThis': 'Bu tarifi puanla',
    'recipe.yourRating': 'Puanınız',
    'recipe.fork': 'Tarifi Çatalla',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

const guestAuth = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
};

const sampleRecipe = {
  id: 'recipe-1',
  slug: 'my-espresso',
  title: 'My Espresso',
  visibility: 'public',
  authorId: 'author-1',
  author: { id: 'author-1', username: 'alice', displayName: 'Alice' },
  likeCount: 5,
  commentCount: 2,
  forkCount: 1,
  userLiked: false,
  userFavourited: false,
  favouriteCount: 0,
  avgRating: null,
  ratingCount: 0,
  userRating: null,
  forkedFromSlug: null,
  tasteNotes: [],
  equipment: [],
  photos: [],
  createdAt: '2026-05-01T00:00:00Z',
  currentVersion: {
    brewMethod: 'ESPRESSO',
    drinkType: 'ESPRESSO',
    groundWeightGrams: 18,
    extractionTimeSeconds: 28,
    extractionVolumeMl: 36,
    temperatureCelsius: 93,
    brewRatio: 2,
    personalNotes: 'Great shot',
    rating: 4,
  },
};

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockUseAuth.mockReturnValue(guestAuth as ReturnType<typeof useAuth>);
  mockUseParams.mockReturnValue({ slug: 'my-espresso' });
  mockUseSearchParams.mockReturnValue([new URLSearchParams(), vi.fn()] as ReturnType<typeof useSearchParams>);
  mockUseNavigate.mockReturnValue(vi.fn());
  mockRecipeApi.get.mockResolvedValue(sampleRecipe as unknown as Record<string, unknown>);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('RecipeDetailPage — loading and not-found states', () => {
  it('shows "Loading..." while fetching — English', () => {
    mockRecipeApi.get.mockReturnValue(new Promise(() => {}));

    render(<RecipeDetailPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows "Yükleniyor..." while fetching — Turkish', () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockRecipeApi.get.mockReturnValue(new Promise(() => {}));

    render(<RecipeDetailPage />);

    expect(screen.getByText('Yükleniyor...')).toBeInTheDocument();
  });

  it('shows "Recipe not found" when API returns null — English', async () => {
    mockRecipeApi.get.mockResolvedValue(null as unknown as Record<string, unknown>);

    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Recipe not found')).toBeInTheDocument();
    });
  });

  it('shows "Tarif bulunamadı" when API returns null — Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockRecipeApi.get.mockResolvedValue(null as unknown as Record<string, unknown>);

    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Tarif bulunamadı')).toBeInTheDocument();
    });
  });
});

describe('RecipeDetailPage — new header components', () => {
  it('renders BreadcrumbNav', async () => {
    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('breadcrumb-nav')).toBeInTheDocument();
    });
  });

  it('renders StatCards', async () => {
    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('stat-cards')).toBeInTheDocument();
    });
  });

  it('renders ShareSection', async () => {
    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('share-section')).toBeInTheDocument();
    });
  });

  it('Print button is present', async () => {
    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Print recipe' })).toBeInTheDocument();
    });
  });

  it('Focus button is present', async () => {
    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Focus mode' })).toBeInTheDocument();
    });
  });
});

describe('RecipeDetailPage — Fork Recipe button visibility', () => {
  const nonOwnerAuth = {
    user: { id: 'other-user', email: 'bob@example.com', username: 'bob', displayName: 'Bob', avatarUrl: null, isAdmin: false, onboardingCompleted: true },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  };

  const ownerAuth = {
    user: { id: 'author-1', email: 'alice@example.com', username: 'alice', displayName: 'Alice', avatarUrl: null, isAdmin: false, onboardingCompleted: true },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  };

  it('Fork Recipe button shown for authenticated non-owner', async () => {
    mockUseAuth.mockReturnValue(nonOwnerAuth as ReturnType<typeof useAuth>);

    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Fork recipe' })).toBeInTheDocument();
    });
  });

  it('Fork Recipe button hidden for guest', async () => {
    // guestAuth is the default from beforeEach
    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('stat-cards')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Fork recipe' })).not.toBeInTheDocument();
  });

  it('Fork Recipe button hidden for owner', async () => {
    mockUseAuth.mockReturnValue(ownerAuth as ReturnType<typeof useAuth>);

    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('stat-cards')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Fork recipe' })).not.toBeInTheDocument();
  });
});

describe('RecipeDetailPage — owner actions', () => {
  const ownerAuth = {
    user: { id: 'author-1', email: 'alice@example.com', username: 'alice', displayName: 'Alice', avatarUrl: null, isAdmin: false, onboardingCompleted: true },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  };

  it('shows Edit button for the recipe owner — English', async () => {
    mockUseAuth.mockReturnValue(ownerAuth as ReturnType<typeof useAuth>);

    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument();
    });
  });

  it('shows Edit button in Turkish for the recipe owner', async () => {
    mockUseAuth.mockReturnValue(ownerAuth as ReturnType<typeof useAuth>);
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Düzenle' })).toBeInTheDocument();
    });
  });

  it('does not show Edit button for non-owners', async () => {
    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('My Espresso')).toBeInTheDocument();
    });

    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });
});

describe('RecipeDetailPage — canonical SEO', () => {
  it('passes canonical pointing to /recipes/:slug', async () => {
    render(<RecipeDetailPage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    const calls = mockSEOHead.mock.calls;
    const lastProps = calls[calls.length - 1][0] as { canonical?: string; noIndex?: boolean };
    expect(lastProps.canonical).toMatch(/\/recipes\/my-espresso$/);
  });

  it('does NOT pass noIndex — recipe detail page should be indexed', async () => {
    render(<RecipeDetailPage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    const calls = mockSEOHead.mock.calls;
    const lastProps = calls[calls.length - 1][0] as { canonical?: string; noIndex?: boolean };
    expect(lastProps.noIndex).toBeFalsy();
  });
});

// ── New test groups for recipe-action-buttons-ui ───────────────────────────

import { within } from '@testing-library/react';

const nonOwnerAuth = {
  user: { id: 'other-user', email: 'bob@example.com', username: 'bob', displayName: 'Bob', avatarUrl: null, isAdmin: false, onboardingCompleted: true },
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
};

describe('RecipeDetailPage — Social_Actions_Card layout', () => {
  it('guest: social-actions-card inner div has flex and flex-row classes', async () => {
    // guestAuth is the default from beforeEach
    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('social-actions-card')).toBeInTheDocument();
    });

    const card = screen.getByTestId('social-actions-card');
    const innerDiv = card.querySelector('div');
    expect(innerDiv).not.toBeNull();
    expect(innerDiv!.classList.contains('flex')).toBe(true);
    expect(innerDiv!.classList.contains('flex-row')).toBe(true);
  });

  it('authenticated non-owner: social-actions-card inner div has flex and flex-row classes', async () => {
    mockUseAuth.mockReturnValue(nonOwnerAuth as ReturnType<typeof useAuth>);

    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('social-actions-card')).toBeInTheDocument();
    });

    const card = screen.getByTestId('social-actions-card');
    const innerDiv = card.querySelector('div');
    expect(innerDiv).not.toBeNull();
    expect(innerDiv!.classList.contains('flex')).toBe(true);
    expect(innerDiv!.classList.contains('flex-row')).toBe(true);
  });
});

describe('RecipeDetailPage — Fork_Card visibility', () => {
  it('authenticated non-owner: fork-card is rendered', async () => {
    mockUseAuth.mockReturnValue(nonOwnerAuth as ReturnType<typeof useAuth>);

    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('fork-card')).toBeInTheDocument();
    });
  });

  it('guest (isAuthenticated=false): fork-card is NOT rendered', async () => {
    // guestAuth is the default from beforeEach
    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('social-actions-card')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('fork-card')).toBeNull();
  });

  it('recipe owner (user.id === recipe.authorId): fork-card is NOT rendered', async () => {
    const ownerAuth = {
      user: { id: 'author-1', email: 'alice@example.com', username: 'alice', displayName: 'Alice', avatarUrl: null, isAdmin: false, onboardingCompleted: true },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    };
    mockUseAuth.mockReturnValue(ownerAuth as ReturnType<typeof useAuth>);

    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('social-actions-card')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('fork-card')).toBeNull();
  });
});

describe('RecipeDetailPage — Fork_Card is sibling, not child of Social_Actions_Card', () => {
  it('authenticated non-owner: fork-card is NOT inside social-actions-card', async () => {
    mockUseAuth.mockReturnValue(nonOwnerAuth as ReturnType<typeof useAuth>);

    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('fork-card')).toBeInTheDocument();
    });

    const socialActionsCard = screen.getByTestId('social-actions-card');
    const forkCardInsideSocialActions = within(socialActionsCard).queryByTestId('fork-card');
    expect(forkCardInsideSocialActions).toBeNull();
  });
});

// ── Task 12.4: Responsive layout tests ────────────────────────────────────

describe('RecipeDetailPage — Responsive layout', () => {
  it('main content grid has grid-cols-1 md:grid-cols-3 class', async () => {
    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('stat-cards')).toBeInTheDocument();
    });

    // The main grid wrapping the main column and sidebar
    const grid = document.querySelector('.grid.grid-cols-1.md\\:grid-cols-3');
    expect(grid).not.toBeNull();
  });

  it('StatCards container is present', async () => {
    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('stat-cards')).toBeInTheDocument();
    });
  });

  it('sidebar has space-y-4 class', async () => {
    render(<RecipeDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('social-actions-card')).toBeInTheDocument();
    });

    // The sidebar is the div containing social-actions-card with space-y-4
    const socialActionsCard = screen.getByTestId('social-actions-card');
    const sidebar = socialActionsCard.parentElement;
    expect(sidebar).not.toBeNull();
    expect(sidebar!.classList.contains('space-y-4')).toBe(true);
  });
});
