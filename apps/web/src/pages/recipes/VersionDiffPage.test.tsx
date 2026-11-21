import { t } from '@brewform/shared/i18n';
import type { VersionDiffOutput } from '@brewform/shared/schemas';
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

vi.mock('../../hooks/useUnitSystem.ts', () => ({
  useUnitSystem: () => 'metric',
}));

vi.mock('../../api/index.ts', () => ({
  recipeApi: {
    diffVersions: vi.fn(),
  },
}));

import { ApiError } from '../../api/errors.ts';
import { recipeApi } from '../../api/index.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { loader } from './VersionDiffPage.data.ts';
import { VersionDiffPage } from './VersionDiffPage.tsx';

const mockRecipeApi = vi.mocked(recipeApi);

const mockDiff: VersionDiffOutput = {
  version1: { id: 'v1', versionNumber: 1, brewDate: '2025-01-01' },
  version2: { id: 'v2', versionNumber: 2, brewDate: '2025-02-01' },
  fields: [
    { field: 'brewMethod', value1: 'espresso_machine', value2: 'v60', status: 'modified' },
    { field: 'groundWeightGrams', value1: 18, value2: 18, status: 'unchanged' },
    { field: 'temperatureCelsius', value1: null, value2: 93, status: 'added' },
  ],
  tasteNotes: { added: ['chocolate'], removed: ['citrus'], unchanged: ['caramel'] },
  equipment: { added: [], removed: [], unchanged: ['Hario V60'] },
};

/** Renders the diff page for `url` through the real loader. */
function renderPage(url = '/recipes/test-recipe/versions/diff?v1=1&v2=2') {
  return renderWithAppProviders(
    [
      {
        path: '/recipes/:slug/versions/diff',
        loader,
        Component: VersionDiffPage,
        errorElement: <RouteErrorState />,
      },
    ],
    { initialEntries: [url] },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockRecipeApi.diffVersions.mockResolvedValue(mockDiff);
});

describe('/recipes/:slug/versions/diff loader', () => {
  it('reads ?v1&v2 and forwards request.signal', async () => {
    renderPage();

    expect(await screen.findByText(t('recipe.brewMethod'))).toBeInTheDocument();
    expect(mockRecipeApi.diffVersions).toHaveBeenCalledWith('test-recipe', '1', '2', {
      signal: expect.any(AbortSignal),
    });
  });

  it('renders the route error state (not common.noResults) when the diff fails', async () => {
    mockRecipeApi.diffVersions.mockRejectedValue(new Error('fail'));
    renderPage();

    expect(await screen.findByText(t('error.route.loadFailed'))).toBeInTheDocument();
    expect(screen.queryByText(t('common.noResults'))).not.toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'test-recipe' }),
      'VersionDiffPage loadDiff failed',
    );
  });

  it('renders the not-found page for an unknown version', async () => {
    mockRecipeApi.diffVersions.mockRejectedValue(
      new ApiError('NOT_FOUND', 'missing', undefined, 404),
    );
    renderPage();

    expect(await screen.findByText(t('error.404'))).toBeInTheDocument();
  });

  it('renders the not-found page without a request when v1 or v2 is missing', async () => {
    renderPage('/recipes/test-recipe/versions/diff?v1=1');

    expect(await screen.findByText(t('error.404'))).toBeInTheDocument();
    expect(mockRecipeApi.diffVersions).not.toHaveBeenCalled();
  });
});

describe('VersionDiffPage', () => {
  it('is never indexed (derived view): sets robots noindex, nofollow', async () => {
    renderPage();
    await screen.findByText(t('recipe.brewMethod'));

    await waitFor(() =>
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex, nofollow',
      ),
    );
  });

  it('renders diff fields with correct statuses after load', async () => {
    renderPage();
    expect(await screen.findByText(t('recipe.brewMethod'))).toBeInTheDocument();
    expect(screen.getByText('espresso_machine')).toBeInTheDocument();
    expect(screen.getByText('v60')).toBeInTheDocument();
    expect(screen.getByText(t('recipe.temperature'))).toBeInTheDocument();
  });

  it("labels the personalNotes field as the brewer's notes", async () => {
    mockRecipeApi.diffVersions.mockResolvedValue({
      ...mockDiff,
      fields: [{ field: 'personalNotes', value1: 'Floral', value2: 'Juicy', status: 'modified' }],
    });
    renderPage();
    expect(await screen.findByText(t('recipe.brewerNotes'))).toBeInTheDocument();
    expect(screen.getByText('Juicy')).toBeInTheDocument();
  });

  it('renders taste notes and equipment sections', async () => {
    renderPage();
    expect(await screen.findByText(t('recipe.tasteNotes'))).toBeInTheDocument();
    expect(screen.getByText('+ chocolate')).toBeInTheDocument();
    expect(screen.getByText('- citrus')).toBeInTheDocument();
    expect(screen.getByText('caramel')).toBeInTheDocument();
    expect(screen.getByText(t('equipment.title'))).toBeInTheDocument();
    expect(screen.getByText('Hario V60')).toBeInTheDocument();
  });

  it('formats durations, the ratio and the flow rate with the shared formatters', async () => {
    mockRecipeApi.diffVersions.mockResolvedValue({
      ...mockDiff,
      fields: [
        { field: 'extractionTimeSeconds', value1: 28, value2: 43200, status: 'modified' },
        { field: 'brewRatio', value1: 2, value2: 2.2222223, status: 'modified' },
        { field: 'flowRate', value1: null, value2: 1.2857143, status: 'added' },
      ],
    });
    renderPage();
    expect(await screen.findByText('12h')).toBeInTheDocument();
    expect(screen.getByText('28s')).toBeInTheDocument();
    expect(screen.getByText('1:2')).toBeInTheDocument();
    expect(screen.getByText('1:2.2')).toBeInTheDocument();
    expect(
      screen.getByText(t('recipe.brewTimeline.flowRate').replace('{value}', '1.3')),
    ).toBeInTheDocument();
    expect(screen.queryByText('43200s')).not.toBeInTheDocument();
    expect(screen.queryByText(/2\.2222/)).not.toBeInTheDocument();
  });

  it('shows a slow positive flow rate with two significant digits, never 0 ml/s (V4)', async () => {
    mockRecipeApi.diffVersions.mockResolvedValue({
      ...mockDiff,
      fields: [{ field: 'flowRate', value1: 1.2857143, value2: 500 / 43_200, status: 'modified' }],
    });
    renderPage();
    expect(
      await screen.findByText(t('recipe.brewTimeline.flowRate').replace('{value}', '0.012')),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(t('recipe.brewTimeline.flowRate').replace('{value}', '0')),
    ).not.toBeInTheDocument();
  });
});
