import { t } from '@brewform/shared/i18n';
import type { EquipmentOutput, RecipeWithAuthorOutput } from '@brewform/shared/schemas';
import { act, screen, waitFor } from '@testing-library/react';
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

vi.mock('../../api/index.ts', () => ({
  equipmentApi: { get: vi.fn(), recipes: vi.fn() },
}));

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: vi.fn(() => null),
}));

import { ApiError } from '../../api/errors.ts';
import type { RequestOptions } from '../../api/index.ts';
import { equipmentApi } from '../../api/index.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { loader } from './EquipmentDetailPage.data.ts';
import { EquipmentDetailPage } from './EquipmentDetailPage.tsx';

const mockGet = vi.mocked(equipmentApi.get);
const mockRecipes = vi.mocked(equipmentApi.recipes);
const mockSEOHead = vi.mocked(SEOHead);

const STAGG = {
  id: 'eq-1',
  name: 'Stagg EKG',
  brand: 'Fellow',
  model: 'Stagg EKG',
  type: 'kettle',
  description: 'Electric pour-over kettle with temperature control',
} as EquipmentOutput;

const RECIPES = [
  {
    id: 'r1',
    slug: 'my-espresso',
    title: 'My Espresso',
    authorId: 'u1',
    visibility: 'public',
    currentVersionId: 'v1',
    author: { username: 'coffeelover', displayName: 'Coffee Lover', avatarUrl: null },
    likeCount: 5,
    commentCount: 2,
    forkCount: 0,
    forkedFromId: null,
    featured: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
  },
] as unknown as RecipeWithAuthorOutput[];

/** Renders `/equipment/:id` through its real loader. */
function renderPage(id = 'eq-1', locale: 'en' | 'tr' = 'en') {
  return renderWithAppProviders(
    [
      {
        path: '/equipment/:id',
        loader,
        Component: EquipmentDetailPage,
        errorElement: <RouteErrorState />,
      },
    ],
    { initialEntries: [`/equipment/${id}`], locale },
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
  mockGet.mockResolvedValue(STAGG);
  mockRecipes.mockResolvedValue(RECIPES);
});

describe('/equipment/:id loader', () => {
  it('loads the item and six recipes in parallel, forwarding request.signal', async () => {
    const request = new Request('http://localhost/equipment/eq-1');
    const result = await loader({ request, params: { id: 'eq-1' }, context: undefined } as never);

    expect(result).toEqual({ equipment: STAGG, recipes: RECIPES });
    expect(mockGet).toHaveBeenCalledWith('eq-1', { signal: request.signal });
    expect(mockRecipes).toHaveBeenCalledWith('eq-1', { perPage: '6' }, { signal: request.signal });
  });

  it('turns an API 404 into a 404 Response without an error log', async () => {
    mockGet.mockRejectedValue(new ApiError('NOT_FOUND', 'missing', undefined, 404));
    const request = new Request('http://localhost/equipment/nope');
    const thrown = await Promise.resolve(
      loader({ request, params: { id: 'nope' }, context: undefined } as never),
    ).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});

describe('EquipmentDetailPage', () => {
  it('logs mount and unmount', async () => {
    const { unmount } = renderPage();
    await screen.findByRole('heading', { name: 'Stagg EKG' });
    // The mount effect runs after the commit that renders the loader data.
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'EquipmentDetailPage mounted'),
    );
    unmount();
    expect(mockLogger.debug).toHaveBeenCalledWith({}, 'EquipmentDetailPage unmounted');
  });

  it('renders the brand, model, type badge and description', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Stagg EKG' })).toBeInTheDocument();
    expect(screen.getAllByText('Fellow')).toHaveLength(1);
    expect(screen.getByText('kettle')).toBeInTheDocument();
    expect(
      screen.getByText('Electric pour-over kettle with temperature control'),
    ).toBeInTheDocument();
  });

  it('uses the name when there is no model and spaces out the type', async () => {
    mockGet.mockResolvedValue({
      ...STAGG,
      brand: null,
      model: null,
      type: 'pour_over_brewer',
      description: null,
    } as EquipmentOutput);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Stagg EKG' })).toBeInTheDocument();
    expect(screen.getByText('pour over brewer')).toBeInTheDocument();
    expect(
      screen.queryByText('Electric pour-over kettle with temperature control'),
    ).not.toBeInTheDocument();
  });

  it('renders the not-found page for an unknown id', async () => {
    mockGet.mockRejectedValue(new ApiError('NOT_FOUND', 'missing', undefined, 404));
    renderPage('nope');
    expect(await screen.findByText(t('error.404'))).toBeInTheDocument();
  });

  it('renders the route error state in Turkish when the load fails', async () => {
    mockGet.mockRejectedValue(new Error('down'));
    renderPage('eq-1', 'tr');
    expect(await screen.findByText(t('error.route.loadFailed', 'tr'))).toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error), equipmentId: 'eq-1' },
      'EquipmentDetailPage loadData failed',
    );
  });

  it('aborts a superseded load and only ever renders the new item', async () => {
    const signals: Record<string, AbortSignal | undefined> = {};
    mockGet.mockImplementation((id: string, opts?: RequestOptions) => {
      signals[id] = opts?.signal;
      if (id === 'eq-a') return new Promise<EquipmentOutput>(() => undefined);
      return Promise.resolve({ ...STAGG, id, model: 'Model B', name: 'B' } as EquipmentOutput);
    });
    const { router } = renderPage('eq-b');
    await screen.findByRole('heading', { name: 'Model B' });

    act(() => {
      void router.navigate('/equipment/eq-a');
    });
    await waitFor(() => expect(signals['eq-a']).toBeDefined());
    act(() => {
      void router.navigate('/equipment/eq-c');
    });

    await waitFor(() => expect(router.state.location.pathname).toBe('/equipment/eq-c'));
    expect(signals['eq-a']?.aborted).toBe(true);
    expect(await screen.findByRole('heading', { name: 'Model B' })).toBeInTheDocument();
  });

  it('renders the recipes through the shared RecipeCard', async () => {
    renderPage();
    expect(await screen.findByText(t('equipment.recipesUsing'))).toBeInTheDocument();
    const link = screen.getByText('My Espresso').closest('a');
    expect(link?.getAttribute('href')).toBe('/recipes/my-espresso');
    expect(screen.getByRole('button', { name: 'Coffee Lover' })).toBeInTheDocument();
  });

  it('shows the empty recipes message when no recipes use the item', async () => {
    mockRecipes.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(t('equipment.noRecipes'))).toBeInTheDocument();
  });

  it('passes title, description and canonical URL to SEOHead', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Stagg EKG' });
    expect(lastSeoProps()).toMatchObject({
      title: 'Fellow Stagg EKG',
      description: 'Electric pour-over kettle with temperature control',
    });
    expect(lastSeoProps().canonical).toContain('/equipment/eq-1');
  });

  it('falls back to a brand + type description', async () => {
    mockGet.mockResolvedValue({ ...STAGG, description: null } as EquipmentOutput);
    renderPage();
    await screen.findByRole('heading', { name: 'Stagg EKG' });
    expect(lastSeoProps().description).toBe('Fellow kettle');
  });

  it('renders a breadcrumb back to the catalogue', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Stagg EKG' });
    expect(screen.getByRole('link', { name: t('equipment.catalog.title') })).toHaveAttribute(
      'href',
      '/equipments',
    );
  });
});
