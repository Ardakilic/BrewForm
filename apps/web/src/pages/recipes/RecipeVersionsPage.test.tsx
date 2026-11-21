import { t } from '@brewform/shared/i18n';
import type { RecipeVersionRow } from '@brewform/shared/schemas';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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

vi.mock('../../hooks/useUnitSystem.ts', () => ({
  useUnitSystem: () => 'metric',
}));

vi.mock('../../api/index.ts', () => ({
  recipeApi: { versions: vi.fn() },
}));

import { ApiError } from '../../api/errors.ts';
import { recipeApi } from '../../api/index.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { loader } from './RecipeVersionsPage.data.ts';
import { RecipeVersionsPage } from './RecipeVersionsPage.tsx';

const mockVersionsApi = vi.mocked(recipeApi.versions);

const mockVersions = [
  {
    id: 'v1-id',
    versionNumber: 3,
    brewDate: '2024-03-01',
    brewMethod: 'v60',
    groundWeightGrams: 18,
    extractionVolumeMl: 300,
    extractionTimeSeconds: 150,
    temperatureCelsius: 93,
  },
  {
    id: 'v2-id',
    versionNumber: 2,
    brewDate: '2024-02-01',
    brewMethod: 'v60',
    groundWeightGrams: 17,
    extractionVolumeMl: 280,
    extractionTimeSeconds: 140,
    temperatureCelsius: 92,
  },
  {
    id: 'v3-id',
    versionNumber: 1,
    brewDate: '2024-01-01',
    brewMethod: 'french_press',
    groundWeightGrams: 30,
    extractionVolumeMl: 500,
    extractionTimeSeconds: 240,
    temperatureCelsius: 96,
  },
] as unknown as RecipeVersionRow[];

/** Renders `/recipes/test-recipe/versions` through the real loader. */
function renderPage() {
  return renderWithAppProviders(
    [
      {
        path: '/recipes/:slug/versions',
        loader,
        Component: RecipeVersionsPage,
        errorElement: <RouteErrorState />,
      },
    ],
    { initialEntries: ['/recipes/test-recipe/versions'] },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockVersionsApi.mockResolvedValue({
    title: 'Test Recipe',
    slug: 'test-recipe',
    versions: mockVersions,
  });
});

describe('/recipes/:slug/versions loader', () => {
  it('loads the version history with request.signal', async () => {
    renderPage();

    expect(await screen.findByText('v3')).toBeInTheDocument();
    expect(mockVersionsApi).toHaveBeenCalledWith('test-recipe', {
      signal: expect.any(AbortSignal),
    });
  });

  it('renders the route error state with a retry control on HTTP 500, not common.noResults', async () => {
    mockVersionsApi.mockRejectedValue(new ApiError('INTERNAL_ERROR', 'boom', undefined, 500));
    renderPage();

    expect(await screen.findByText(t('error.route.loadFailed'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('common.retry') })).toBeInTheDocument();
    expect(screen.queryByText(t('common.noResults'))).not.toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'test-recipe' }),
      'RecipeVersionsPage loadData failed',
    );
  });

  it('renders the not-found page for an unknown recipe', async () => {
    mockVersionsApi.mockRejectedValue(new ApiError('NOT_FOUND', 'missing', undefined, 404));
    renderPage();

    expect(await screen.findByText(t('error.404'))).toBeInTheDocument();
  });
});

describe('RecipeVersionsPage', () => {
  it('is never indexed (derived view): sets robots noindex, nofollow', async () => {
    renderPage();
    await screen.findByText('v3');

    await waitFor(() =>
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex, nofollow',
      ),
    );
  });

  it('renders version rows after loading', async () => {
    renderPage();
    expect(await screen.findByText('v3')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
  });

  it('selects a version when checkbox is clicked', async () => {
    renderPage();
    await screen.findByText('v3');
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).toBeChecked();
  });

  it('disables third checkbox when 2 are selected', async () => {
    renderPage();
    await screen.findByText('v3');
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    expect(checkboxes[2]).toBeDisabled();
  });

  it('shows compare link only when exactly 2 selected', async () => {
    renderPage();
    await screen.findByText('v3');
    const compare = t('versionDiff.compareSelected');
    expect(screen.queryByText(compare)).not.toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(screen.queryByText(compare)).not.toBeInTheDocument();
    fireEvent.click(checkboxes[1]);
    expect(screen.getByText(compare)).toBeInTheDocument();
  });

  it('compare link points to correct diff URL', async () => {
    renderPage();
    await screen.findByText('v3');
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    const link = screen.getByText(t('versionDiff.compareSelected')).closest('a');
    expect(link).toHaveAttribute('href', '/recipes/test-recipe/versions/diff?v1=v1-id&v2=v2-id');
  });

  it('formats extraction times compactly (150s → 2m 30s, 43200s → 12h)', async () => {
    mockVersionsApi.mockResolvedValue({
      title: 'Test Recipe',
      slug: 'test-recipe',
      versions: [{ ...mockVersions[0], extractionTimeSeconds: 43200 }, ...mockVersions.slice(1)],
    });
    renderPage();
    expect(await screen.findByText('12h')).toBeInTheDocument();
    expect(screen.getByText('2m 20s')).toBeInTheDocument();
    expect(screen.getByText('4m')).toBeInTheDocument();
    expect(screen.queryByText('43200s')).not.toBeInTheDocument();
  });

  it('logs mount and unmount', async () => {
    const { unmount } = renderPage();
    await screen.findByText('v3');
    // The mount effect runs after the commit that renders the loader data.
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'RecipeVersionsPage mounted'),
    );

    unmount();
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'RecipeVersionsPage unmounted'),
    );
  });
});
