import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    locale: 'en',
    setLocale: vi.fn(),
    availableLocales: ['en', 'tr'],
  }),
}));

vi.mock('../../hooks/useUnitSystem.ts', () => ({
  useUnitSystem: () => 'metric',
}));

vi.mock('../../api/index.ts', () => ({
  recipeApi: {
    diffVersions: vi.fn(),
  },
}));

import { recipeApi } from '../../api/index.ts';
import type { VersionDiffOutput } from '@brewform/shared/schemas';
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

function renderPage() {
  const router = createMemoryRouter(
    [{ path: '/recipes/:slug/versions/diff', element: <VersionDiffPage /> }],
    { initialEntries: ['/recipes/test-recipe/versions/diff?v1=1&v2=2'] },
  );
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRecipeApi.diffVersions.mockResolvedValue(mockDiff);
});

describe('VersionDiffPage', () => {
  it('shows loading state initially', () => {
    mockRecipeApi.diffVersions.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('renders diff fields with correct statuses after load', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('recipe.brewMethod')).toBeInTheDocument();
    });
    expect(screen.getByText('espresso_machine')).toBeInTheDocument();
    expect(screen.getByText('v60')).toBeInTheDocument();
    expect(screen.getByText('recipe.temperature')).toBeInTheDocument();
  });

  it('renders taste notes and equipment sections', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('recipe.tasteNotes')).toBeInTheDocument();
    });
    expect(screen.getByText('+ chocolate')).toBeInTheDocument();
    expect(screen.getByText('- citrus')).toBeInTheDocument();
    expect(screen.getByText('caramel')).toBeInTheDocument();
    expect(screen.getByText('equipment.title')).toBeInTheDocument();
    expect(screen.getByText('Hario V60')).toBeInTheDocument();
  });

  it('shows empty state on error', async () => {
    mockRecipeApi.diffVersions.mockRejectedValue(new Error('fail'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('common.noResults')).toBeInTheDocument();
    });
  });
});
