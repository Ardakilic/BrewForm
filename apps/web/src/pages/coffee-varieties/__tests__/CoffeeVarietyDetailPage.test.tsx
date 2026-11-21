import { t } from '@brewform/shared/i18n';
import type { CoffeeVarietyOutput, RecipeWithVersionsOutput } from '@brewform/shared/schemas';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

vi.mock('../../../api/index.ts', () => ({
  coffeeVarietyApi: { get: vi.fn(), recipes: vi.fn() },
}));

vi.mock('../../../components/seo/SEOHead.tsx', () => ({
  SEOHead: vi.fn(() => null),
}));

import { ApiError } from '../../../api/errors.ts';
import { coffeeVarietyApi } from '../../../api/index.ts';
import { RouteErrorState } from '../../../components/RouteErrorState.tsx';
import { SEOHead } from '../../../components/seo/SEOHead.tsx';
import { renderWithAppProviders } from '../../../test-utils/render.tsx';
import { loader } from '../CoffeeVarietyDetailPage.data.ts';
import { CoffeeVarietyDetailPage } from '../CoffeeVarietyDetailPage.tsx';

const mockGet = vi.mocked(coffeeVarietyApi.get);
const mockRecipes = vi.mocked(coffeeVarietyApi.recipes);
const mockSEOHead = vi.mocked(SEOHead);

const VARIETY = {
  id: 'var-1',
  name: 'Bourbon',
  species: 'Arabica',
  category: 'variety',
  origin: 'Ethiopia',
  altitudeRangeM: '1500-2000m',
  cupProfile: 'Sweet, fruity with chocolate notes',
  body: 'Full',
  acidity: 'Bright',
  caffeinePct: 'Moderate',
  spread: null,
  diseaseResistance: null,
  yield: null,
  plantSize: null,
  notes: null,
  fermentation: null,
  dryingTimeDays: null,
  processingCompatibility: ['washed', 'natural'],
  subVarieties: null,
  isSystem: false,
  createdBy: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  deletedAt: null,
} as unknown as CoffeeVarietyOutput;

const RECIPES = [
  {
    id: 'r1',
    slug: 'my-espresso',
    title: 'My Espresso',
    authorId: 'u1',
    visibility: 'public',
    currentVersionId: 'v1',
    author: { username: 'coffeelover', displayName: 'Coffee Lover', avatarUrl: null },
    versions: [{ brewMethod: 'espresso', drinkType: 'espresso', rating: 4 }],
    likeCount: 5,
    commentCount: 2,
    forkCount: 0,
    forkedFromId: null,
    featured: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
  },
  {
    id: 'r2',
    slug: 'pour-over',
    title: 'Morning Pour Over',
    authorId: 'u2',
    visibility: 'public',
    currentVersionId: 'v2',
    author: { username: 'barista', displayName: null, avatarUrl: null },
    versions: [{ brewMethod: 'v60', drinkType: 'filter', rating: null }],
    likeCount: 3,
    commentCount: 1,
    forkCount: 0,
    forkedFromId: null,
    featured: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
  },
] as unknown as RecipeWithVersionsOutput[];

/** Renders `/coffee-varieties/:id` through its real loader. */
function renderPage(id = 'var-1', locale: 'en' | 'tr' = 'en') {
  return renderWithAppProviders(
    [
      {
        path: '/coffee-varieties/:id',
        loader,
        Component: CoffeeVarietyDetailPage,
        errorElement: <RouteErrorState />,
      },
    ],
    { initialEntries: [`/coffee-varieties/${id}`], locale },
  );
}

/** The props of the last SEOHead render. */
function lastSeoProps() {
  const calls = mockSEOHead.mock.calls;
  return calls[calls.length - 1][0] as { title?: string; description?: string; canonical?: string };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockGet.mockResolvedValue(VARIETY);
  mockRecipes.mockResolvedValue(RECIPES);
});

describe('/coffee-varieties/:id loader', () => {
  it('loads the variety and six recipes in parallel, forwarding request.signal', async () => {
    const request = new Request('http://localhost/coffee-varieties/var-1');
    const result = await loader({ request, params: { id: 'var-1' }, context: undefined } as never);

    expect(result).toEqual({ variety: VARIETY, recipes: RECIPES });
    expect(mockGet).toHaveBeenCalledWith('var-1', { signal: request.signal });
    expect(mockRecipes).toHaveBeenCalledWith('var-1', { perPage: '6' }, { signal: request.signal });
  });

  it('turns an API 404 into a 404 Response without an error log', async () => {
    mockGet.mockRejectedValue(new ApiError('NOT_FOUND', 'missing', undefined, 404));
    const request = new Request('http://localhost/coffee-varieties/nope');
    const thrown = await Promise.resolve(
      loader({ request, params: { id: 'nope' }, context: undefined } as never),
    ).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});

describe('CoffeeVarietyDetailPage', () => {
  it('logs mount and unmount', async () => {
    const { unmount } = renderPage();
    await screen.findByRole('heading', { name: 'Bourbon' });
    // The mount effect runs after the commit that renders the loader data.
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'CoffeeVarietyDetailPage mounted'),
    );
    unmount();
    expect(mockLogger.debug).toHaveBeenCalledWith({}, 'CoffeeVarietyDetailPage unmounted');
  });

  it('renders the variety, its badge and its detail fields', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Bourbon' })).toBeInTheDocument();
    expect(screen.getByText(t('coffeeVarieties.category.varietyDetail'))).toBeInTheDocument();
    expect(screen.getByText('Arabica')).toBeInTheDocument();
    expect(screen.getByText(t('coffeeVarieties.fields.origin'))).toBeInTheDocument();
    expect(screen.getByText('Ethiopia')).toBeInTheDocument();
    expect(screen.getByText('washed, natural')).toBeInTheDocument();
  });

  it('renders the processing badge in Turkish', async () => {
    mockGet.mockResolvedValue({ ...VARIETY, category: 'processing' } as CoffeeVarietyOutput);
    renderPage('var-1', 'tr');
    expect(
      await screen.findByText(t('coffeeVarieties.category.processingDetail', 'tr')),
    ).toBeInTheDocument();
  });

  it('renders the not-found page for an unknown id', async () => {
    mockGet.mockRejectedValue(new ApiError('NOT_FOUND', 'missing', undefined, 404));
    renderPage('nope');
    expect(await screen.findByText(t('error.404'))).toBeInTheDocument();
  });

  it('renders the route error state when the load fails', async () => {
    mockRecipes.mockRejectedValue(new Error('down'));
    renderPage();
    expect(await screen.findByText(t('error.route.loadFailed'))).toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error), varietyId: 'var-1' },
      'CoffeeVarietyDetailPage loadData failed',
    );
  });

  it('renders the recipes through the shared RecipeCard', async () => {
    renderPage();
    expect(
      await screen.findByText(t('coffeeVarieties.recipesUsing').replace('{name}', 'Bourbon')),
    ).toBeInTheDocument();
    expect(screen.getByText('My Espresso')).toBeInTheDocument();
    expect(screen.getByText('Morning Pour Over')).toBeInTheDocument();
    // r1 author renders its displayName; r2 has a null displayName → username fallback
    expect(screen.getByRole('button', { name: 'Coffee Lover' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'barista' })).toBeInTheDocument();
    // r1 version: rating 4 on the 1–10 scale → ★ 2 on the five-star scale
    expect(screen.getByText('• ★ 2')).toBeInTheDocument();
    expect(screen.getByText('v60')).toBeInTheDocument();
  });

  it('shows the empty recipes message when no recipes use the variety', async () => {
    mockRecipes.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(t('coffeeVarieties.noRecipes'))).toBeInTheDocument();
  });

  it('passes title, description and canonical URL to SEOHead', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Bourbon' });
    expect(lastSeoProps()).toMatchObject({
      title: 'Bourbon',
      description: 'Sweet, fruity with chocolate notes',
    });
    expect(lastSeoProps().canonical).toContain('/coffee-varieties/var-1');
  });

  it('falls back to a species + origin description when there is no cup profile', async () => {
    mockGet.mockResolvedValue({ ...VARIETY, cupProfile: null } as CoffeeVarietyOutput);
    renderPage();
    await screen.findByRole('heading', { name: 'Bourbon' });
    expect(lastSeoProps().description).toBe('Arabica from Ethiopia');
  });

  it('renders a breadcrumb back to the catalogue', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Bourbon' });
    expect(screen.getByRole('link', { name: t('coffeeVarieties.title') })).toHaveAttribute(
      'href',
      '/coffee-varieties',
    );
  });
});
