import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../../api/client.ts', () => ({
  api: { get: vi.fn() },
}));

import { api } from '../../api/client.ts';
import { RecipeVersionsPage } from './RecipeVersionsPage.tsx';

const mockApiGet = vi.mocked(api.get);

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
];

function renderPage() {
  const router = createMemoryRouter(
    [{ path: '/recipes/:slug/versions', element: <RecipeVersionsPage /> }],
    { initialEntries: ['/recipes/test-recipe/versions'] },
  );
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiGet.mockResolvedValue({
    title: 'Test Recipe',
    slug: 'test-recipe',
    versions: mockVersions,
  });
});

describe('RecipeVersionsPage', () => {
  it('renders version rows after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('v3')).toBeInTheDocument();
    });
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
  });

  it('selects a version when checkbox is clicked', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('v3')).toBeInTheDocument();
    });
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).toBeChecked();
  });

  it('disables third checkbox when 2 are selected', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('v3')).toBeInTheDocument();
    });
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    expect(checkboxes[2]).toBeDisabled();
  });

  it('shows compare link only when exactly 2 selected', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('v3')).toBeInTheDocument();
    });
    expect(screen.queryByText('versionDiff.compareSelected')).not.toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(screen.queryByText('versionDiff.compareSelected')).not.toBeInTheDocument();
    fireEvent.click(checkboxes[1]);
    expect(screen.getByText('versionDiff.compareSelected')).toBeInTheDocument();
  });

  it('compare link points to correct diff URL', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('v3')).toBeInTheDocument();
    });
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    const link = screen.getByText('versionDiff.compareSelected').closest('a');
    expect(link).toHaveAttribute(
      'href',
      '/recipes/test-recipe/versions/diff?v1=v1-id&v2=v2-id',
    );
  });
});
