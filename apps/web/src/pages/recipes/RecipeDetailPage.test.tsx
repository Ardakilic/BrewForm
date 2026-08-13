import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { loader, RecipeDetailPage } from './RecipeDetailPage.tsx';

// ── Partial mock of react-router: override only useNavigation ─────────────

const { useNavigationM } = vi.hoisted(() => ({
  useNavigationM: vi.fn((): {
    state: 'idle' | 'loading' | 'submitting';
    location: { pathname: string } | undefined;
  } => ({
    state: 'idle',
    location: undefined,
  })),
}));

vi.mock('react-router', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-router')>();
  return { ...mod, useNavigation: useNavigationM };
});

// ── Context mocks ─────────────────────────────────────────────────────────

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
  I18nProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('../../contexts/AuthContext.tsx', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

// ── API mocks ─────────────────────────────────────────────────────────────

vi.mock('../../api/index.ts', () => ({
  recipeApi: { get: vi.fn() },
  commentApi: { list: vi.fn() },
  collectionApi: { listByRecipe: vi.fn() },
}));

vi.mock('../../api/static-cache.ts', () => ({
  getTasteNotesCached: vi.fn(),
}));

vi.mock('../../hooks/useUnitSystem.ts', () => ({
  useUnitSystem: vi.fn(() => 'metric'),
}));

// ── UI component mocks ────────────────────────────────────────────────────

vi.mock('../../components/seo/SEOHead.tsx', () => ({ SEOHead: vi.fn(() => null) }));
vi.mock('../../components/seo/JsonLd.tsx', () => ({ RecipeJsonLd: () => null }));
vi.mock('../../components/recipe/LikeButton.tsx', () => ({ LikeButton: () => null }));
vi.mock('../../components/recipe/FavouriteButton.tsx', () => ({ FavouriteButton: () => null }));
vi.mock('../../components/recipe/CommentSection.tsx', () => ({ CommentSection: () => null }));
vi.mock('../../components/recipe/StarRating.tsx', () => ({ StarRating: () => null }));
vi.mock(
  '../../components/recipe/ForkCard.tsx',
  () => ({ ForkCard: () => <div data-testid='fork-card'>ForkCard</div> }),
);
vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@brewform/shared/constants', () => ({ EMOJI_TAGS_LIST: [] }));

vi.mock(
  '../../components/recipe/BreadcrumbNav.tsx',
  () => ({ BreadcrumbNav: () => <div data-testid='breadcrumb-nav' /> }),
);
vi.mock(
  '../../components/recipe/MetadataBadges.tsx',
  () => ({ MetadataBadges: () => <div data-testid='metadata-badges' /> }),
);
vi.mock(
  '../../components/recipe/StatCards.tsx',
  () => ({ StatCards: () => <div data-testid='stat-cards' /> }),
);
vi.mock(
  '../../components/recipe/BeanSection.tsx',
  () => ({ BeanSection: () => <div data-testid='bean-section' /> }),
);
vi.mock(
  '../../components/recipe/BrewTimeline.tsx',
  () => ({ BrewTimeline: () => <div data-testid='brew-timeline' /> }),
);
vi.mock(
  '../../components/recipe/EquipmentSection.tsx',
  () => ({ EquipmentSection: () => <div data-testid='equipment-section' /> }),
);
vi.mock(
  '../../components/recipe/TastingNotesSection.tsx',
  () => ({ TastingNotesSection: () => <div data-testid='tasting-notes-section' /> }),
);
vi.mock(
  '../../components/recipe/ShareSection.tsx',
  () => ({ ShareSection: () => <div data-testid='share-section' /> }),
);
vi.mock(
  '../../components/recipe/RecipeNotesSection.tsx',
  () => ({ RecipeNotesSection: () => <div data-testid='recipe-notes-section' /> }),
);
vi.mock(
  '../../components/brew-log/RecipeBrewStats.tsx',
  () => ({ RecipeBrewStats: () => <div data-testid='recipe-brew-stats' /> }),
);
vi.mock(
  '../../components/brew-log/BrewHistorySection.tsx',
  () => ({ BrewHistorySection: () => <div data-testid='brew-history-section' /> }),
);

// ── Imports after mocks ────────────────────────────────────────────────────

import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { collectionApi, commentApi, recipeApi } from '../../api/index.ts';
import { getTasteNotesCached } from '../../api/static-cache.ts';
import type {
  CommentWithRepliesOutput,
  PaginatedResponse,
  RecipeCollectionsOutput,
  RecipeDetailOutput,
} from '@brewform/shared/schemas';
import { SEOHead } from '../../components/seo/SEOHead.tsx';

const mockUseTranslation = vi.mocked(useTranslation);
const mockUseAuth = vi.mocked(useAuth);
const mockRecipeApiGet = vi.mocked(recipeApi.get);
const mockCommentApiList = vi.mocked(commentApi.list);
const mockCollectionApiListByRecipe = vi.mocked(collectionApi.listByRecipe);
const mockGetTasteNotesCached = vi.mocked(getTasteNotesCached);
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
    'recipe.print': 'Print recipe',
    'recipe.printAriaLabel': 'Print recipe',
    'recipe.focusMode': 'Focus mode',
    'recipe.focusModeAriaLabel': 'Focus mode',
    'recipe.forkAriaLabel': 'Fork recipe',
    'recipe.preparationNotes': 'Preparation notes',
    'collection.inCollections': 'In Collections',
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
    'recipe.print': 'Tarifi Yazdır',
    'recipe.printAriaLabel': 'Tarifi Yazdır',
    'recipe.focusMode': 'Odak Modu',
    'recipe.focusModeAriaLabel': 'Odak Modu',
    'recipe.forkAriaLabel': 'Tarifi Çatalla',
    'recipe.preparationNotes': 'Hazırlık Notları',
    'collection.inCollections': 'Koleksiyonlarda',
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
  sessionError: null as 'network' | 'server' | null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
  clearSessionError: vi.fn(),
};

/** Minimal `RecipeDetailOutput` fixture cast through `unknown` — the page reads
 * only a subset of fields, and constructing the full schema object (with
 * `versions[]`, `forkedFrom`, etc.) would balloon the test for no gain. */
const sampleRecipe = {
  id: 'recipe-1',
  slug: 'my-espresso',
  title: 'My Espresso',
  visibility: 'public',
  authorId: 'author-1',
  author: { id: 'author-1', username: 'alice', displayName: 'Alice', avatarUrl: null },
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
} as unknown as RecipeDetailOutput;

const emptyComments: PaginatedResponse<CommentWithRepliesOutput> = {
  success: true,
  data: [],
  meta: { requestId: 'test', pagination: { total: 0, page: 1, perPage: 20, totalPages: 0 } },
};

// ── Render helper ──────────────────────────────────────────────────────────

interface RenderOpts {
  errorElement?: ReactNode;
}

function renderDetailPage(slug = 'my-espresso', opts: RenderOpts = {}) {
  const route: Record<string, unknown> = {
    path: '/recipes/:slug',
    element: <RecipeDetailPage />,
    loader,
  };
  if (opts.errorElement) route.errorElement = opts.errorElement;

  const router = createMemoryRouter([route], {
    initialEntries: [`/recipes/${slug}`],
  });
  return render(<RouterProvider router={router} />);
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockUseAuth.mockReturnValue(guestAuth as ReturnType<typeof useAuth>);
  mockRecipeApiGet.mockResolvedValue(sampleRecipe);
  mockCommentApiList.mockResolvedValue(emptyComments);
  mockCollectionApiListByRecipe.mockResolvedValue([]);
  mockGetTasteNotesCached.mockResolvedValue([]);
  useNavigationM.mockReturnValue({ state: 'idle', location: undefined });
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('RecipeDetailPage — loading and not-found states', () => {
  it('shows skeleton while downloading — English', async () => {
    useNavigationM.mockReturnValue({
      state: 'loading',
      location: { pathname: '/recipes/test-recipe' },
    });

    renderDetailPage();

    await waitFor(() => {
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  it('shows skeleton while downloading — Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    useNavigationM.mockReturnValue({
      state: 'loading',
      location: { pathname: '/recipes/test-recipe' },
    });

    renderDetailPage();

    await waitFor(() => {
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  it('shows "Recipe not found" when API rejects — English', async () => {
    mockRecipeApiGet.mockRejectedValue(new Error('Not found'));

    renderDetailPage('my-espresso', {
      errorElement: <div>{enT('recipe.notFound')}</div>,
    });

    await waitFor(() => {
      expect(screen.getByText('Recipe not found')).toBeInTheDocument();
    });
  });

  it('shows "Tarif bulunamadı" when API rejects — Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    mockRecipeApiGet.mockRejectedValue(new Error('Not found'));

    renderDetailPage('my-espresso', {
      errorElement: <div>{trT('recipe.notFound')}</div>,
    });

    await waitFor(() => {
      expect(screen.getByText('Tarif bulunamadı')).toBeInTheDocument();
    });
  });
});

describe('RecipeDetailPage — new header components', () => {
  it('renders BreadcrumbNav', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('breadcrumb-nav')).toBeInTheDocument();
    });
  });

  it('renders StatCards', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('stat-cards')).toBeInTheDocument();
    });
  });

  it('renders ShareSection', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('share-section')).toBeInTheDocument();
    });
  });

  it('Print button is present', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Print recipe' })).toBeInTheDocument();
    });
  });

  it('Focus button is present', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Focus mode' })).toBeInTheDocument();
    });
  });
});

describe('RecipeDetailPage — Fork Recipe button visibility', () => {
  const nonOwnerAuth = {
    user: {
      id: 'other-user',
      email: 'bob@example.com',
      emailVerifiedAt: null,
      username: 'bob',
      displayName: 'Bob',
      avatarUrl: null,
      isAdmin: false,
      onboardingCompleted: true,
    },
    isAuthenticated: true,
    isLoading: false,
    sessionError: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    clearSessionError: vi.fn(),
  };

  const ownerAuth = {
    user: {
      id: 'author-1',
      email: 'alice@example.com',
      emailVerifiedAt: null,
      username: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
      isAdmin: false,
      onboardingCompleted: true,
    },
    isAuthenticated: true,
    isLoading: false,
    sessionError: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    clearSessionError: vi.fn(),
  };

  it('Fork Recipe button shown for authenticated non-owner', async () => {
    mockUseAuth.mockReturnValue(nonOwnerAuth as ReturnType<typeof useAuth>);

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Fork recipe' })).toBeInTheDocument();
    });
  });

  it('Fork Recipe button hidden for guest', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('stat-cards')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Fork recipe' })).not.toBeInTheDocument();
  });

  it('Fork Recipe button hidden for owner', async () => {
    mockUseAuth.mockReturnValue(ownerAuth as ReturnType<typeof useAuth>);

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('stat-cards')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Fork recipe' })).not.toBeInTheDocument();
  });
});

describe('RecipeDetailPage — owner actions', () => {
  const ownerAuth = {
    user: {
      id: 'author-1',
      email: 'alice@example.com',
      emailVerifiedAt: null,
      username: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
      isAdmin: false,
      onboardingCompleted: true,
    },
    isAuthenticated: true,
    isLoading: false,
    sessionError: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    clearSessionError: vi.fn(),
  };

  it('shows Edit button for the recipe owner — English', async () => {
    mockUseAuth.mockReturnValue(ownerAuth as ReturnType<typeof useAuth>);

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument();
    });
  });

  it('shows Edit button in Turkish for the recipe owner', async () => {
    mockUseAuth.mockReturnValue(ownerAuth as ReturnType<typeof useAuth>);
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Düzenle' })).toBeInTheDocument();
    });
  });

  it('does not show Edit button for non-owners', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('My Espresso')).toBeInTheDocument();
    });

    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });
});

describe('RecipeDetailPage — canonical SEO', () => {
  it('passes canonical pointing to /recipes/:slug', async () => {
    renderDetailPage();

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    const calls = mockSEOHead.mock.calls;
    const lastProps = calls[calls.length - 1][0] as { canonical?: string; noIndex?: boolean };
    expect(lastProps.canonical).toMatch(/\/recipes\/my-espresso$/);
  });

  it('does NOT pass noIndex — recipe detail page should be indexed', async () => {
    renderDetailPage();

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    const calls = mockSEOHead.mock.calls;
    const lastProps = calls[calls.length - 1][0] as { canonical?: string; noIndex?: boolean };
    expect(lastProps.noIndex).toBeFalsy();
  });
});

// ── Social_Actions_Card layout ─────────────────────────────────────────────

const nonOwnerAuth = {
  user: {
    id: 'other-user',
    email: 'bob@example.com',
    emailVerifiedAt: null,
    username: 'bob',
    displayName: 'Bob',
    avatarUrl: null,
    isAdmin: false,
    onboardingCompleted: true,
  },
  isAuthenticated: true,
  isLoading: false,
  sessionError: null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
  clearSessionError: vi.fn(),
};

describe('RecipeDetailPage — Social_Actions_Card layout', () => {
  it('guest: social-actions-card inner div has flex and flex-row classes', async () => {
    renderDetailPage();

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

    renderDetailPage();

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

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('fork-card')).toBeInTheDocument();
    });
  });

  it('guest (isAuthenticated=false): fork-card is NOT rendered', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('social-actions-card')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('fork-card')).toBeNull();
  });

  it('recipe owner (user.id === recipe.authorId): fork-card is NOT rendered', async () => {
    const ownerAuth = {
      user: {
        id: 'author-1',
        email: 'alice@example.com',
        emailVerifiedAt: null,
        username: 'alice',
        displayName: 'Alice',
        avatarUrl: null,
        isAdmin: false,
        onboardingCompleted: true,
      },
      isAuthenticated: true,
      isLoading: false,
      sessionError: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      clearSessionError: vi.fn(),
    };
    mockUseAuth.mockReturnValue(ownerAuth as ReturnType<typeof useAuth>);

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('social-actions-card')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('fork-card')).toBeNull();
  });
});

describe('RecipeDetailPage — Fork_Card is sibling, not child of Social_Actions_Card', () => {
  it('authenticated non-owner: fork-card is NOT inside social-actions-card', async () => {
    mockUseAuth.mockReturnValue(nonOwnerAuth as ReturnType<typeof useAuth>);

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('fork-card')).toBeInTheDocument();
    });

    const socialActionsCard = screen.getByTestId('social-actions-card');
    const forkCardInsideSocialActions = within(socialActionsCard).queryByTestId('fork-card');
    expect(forkCardInsideSocialActions).toBeNull();
  });
});

describe('RecipeDetailPage — Responsive layout', () => {
  it('main content grid has grid-cols-1 md:grid-cols-3 class', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('stat-cards')).toBeInTheDocument();
    });

    const grid = document.querySelector('.grid.grid-cols-1.md\\:grid-cols-3');
    expect(grid).not.toBeNull();
  });

  it('StatCards container is present', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('stat-cards')).toBeInTheDocument();
    });
  });

  it('sidebar has space-y-4 class', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('social-actions-card')).toBeInTheDocument();
    });

    const socialActionsCard = screen.getByTestId('social-actions-card');
    const sidebar = socialActionsCard.parentElement;
    expect(sidebar).not.toBeNull();
    expect(sidebar!.classList.contains('space-y-4')).toBe(true);
  });

  it('sidebar has no-print class for print hiding', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('social-actions-card')).toBeInTheDocument();
    });

    const socialActionsCard = screen.getByTestId('social-actions-card');
    const sidebar = socialActionsCard.parentElement;
    expect(sidebar).not.toBeNull();
    expect(sidebar!.classList.contains('no-print')).toBe(true);
  });

  it('ShareSection is the first child of the sidebar', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('share-section')).toBeInTheDocument();
    });

    const sidebar = screen.getByTestId('share-section').parentElement;
    expect(sidebar).not.toBeNull();
    expect(sidebar!.firstElementChild).toBe(screen.getByTestId('share-section'));
  });
});

describe('RecipeDetailPage — Recipe_Notes_Section visibility', () => {
  const authenticatedAuth = {
    user: {
      id: 'other-user',
      email: 'bob@example.com',
      emailVerifiedAt: null,
      username: 'bob',
      displayName: 'Bob',
      avatarUrl: null,
      isAdmin: false,
      onboardingCompleted: true,
    },
    isAuthenticated: true,
    isLoading: false,
    sessionError: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    clearSessionError: vi.fn(),
  };

  it('guest (isAuthenticated=false): recipe notes section is NOT rendered', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('stat-cards')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('recipe-notes-section')).toBeNull();
  });

  it('authenticated user: recipe notes section IS rendered', async () => {
    mockUseAuth.mockReturnValue(authenticatedAuth as ReturnType<typeof useAuth>);

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('recipe-notes-section')).toBeInTheDocument();
    });
  });

  it('recipe owner: recipe notes section IS rendered', async () => {
    const ownerAuth = {
      user: {
        id: 'author-1',
        email: 'alice@example.com',
        emailVerifiedAt: null,
        username: 'alice',
        displayName: 'Alice',
        avatarUrl: null,
        isAdmin: false,
        onboardingCompleted: true,
      },
      isAuthenticated: true,
      isLoading: false,
      sessionError: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      clearSessionError: vi.fn(),
    };
    mockUseAuth.mockReturnValue(ownerAuth as ReturnType<typeof useAuth>);

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('recipe-notes-section')).toBeInTheDocument();
    });
  });
});

describe('RecipeDetailPage — Print layout hiding', () => {
  it('comment section wrapper has no-print class', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('social-actions-card')).toBeInTheDocument();
    });

    const commentWrapper = screen.getByTestId('comment-section-wrapper');
    expect(commentWrapper.classList.contains('no-print')).toBe(true);
  });
});

describe('RecipeDetailPage — brew journal (F02)', () => {
  it('renders RecipeBrewStats for all visitors, including guests', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('recipe-brew-stats')).toBeInTheDocument();
    });
  });

  it('renders BrewHistorySection for authenticated users', async () => {
    mockUseAuth.mockReturnValue(nonOwnerAuth as ReturnType<typeof useAuth>);

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('brew-history-section')).toBeInTheDocument();
    });
  });

  it('hides BrewHistorySection for guests', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('recipe-brew-stats')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('brew-history-section')).toBeNull();
  });
});

describe('RecipeDetailPage — In collections section (D99.5)', () => {
  const sampleCollections: RecipeCollectionsOutput = [
    { id: 'col-1', name: 'Espresso Favourites', visibility: 'public', userId: 'other-user' },
    { id: 'col-2', name: 'Morning Brews', visibility: 'private', userId: 'other-user' },
  ];

  it('renders a link per collection when the loader returns collections', async () => {
    mockCollectionApiListByRecipe.mockResolvedValue(sampleCollections);

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('in-collections-card')).toBeInTheDocument();
    });

    const card = screen.getByTestId('in-collections-card');
    expect(within(card).getByText('In Collections')).toBeInTheDocument();

    const links = within(card).getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('Espresso Favourites');
    expect(links[0]).toHaveAttribute('href', '/collections/col-1');
    expect(links[1]).toHaveTextContent('Morning Brews');
    expect(links[1]).toHaveAttribute('href', '/collections/col-2');
  });

  it('section is absent when the recipe is in no collections', async () => {
    mockCollectionApiListByRecipe.mockResolvedValue([]);

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('stat-cards')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('in-collections-card')).toBeNull();
  });

  it('section is absent when the collections request fails (swallowed to [])', async () => {
    mockCollectionApiListByRecipe.mockRejectedValue(new Error('boom'));

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('stat-cards')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('in-collections-card')).toBeNull();
    expect(screen.getByText('My Espresso')).toBeInTheDocument();
  });
});
