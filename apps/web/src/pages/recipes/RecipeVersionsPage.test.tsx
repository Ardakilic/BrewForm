import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RecipeVersionsPage } from './RecipeVersionsPage.tsx';
import { MemoryRouter } from 'react-router';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useParams: vi.fn() };
});

vi.mock('../../api/client.ts', () => ({ api: { get: vi.fn() } }));
vi.mock('../../contexts/I18nContext.tsx', () => ({ useTranslation: vi.fn() }));
vi.mock(
  '../../hooks/useUnitSystem.ts',
  () => ({ useUnitSystem: vi.fn().mockReturnValue('metric') }),
);

import { useParams } from 'react-router';
import { api } from '../../api/client.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';

const mockUseParams = vi.mocked(useParams);
const mockApi = vi.mocked(api);
const mockUseTranslation = vi.mocked(useTranslation);

const enT = (key: string) => {
  const map: Record<string, string> = {
    'common.loading': 'Loading...',
    'common.back': 'Back',
    'recipe.versionHistory': 'Version History',
    'common.noResults': 'No results found',
  };
  return map[key] ?? key;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLogger.debug.mockClear();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
  mockLogger.error.mockClear();
  mockUseParams.mockReturnValue({ slug: 'test-recipe' });
  mockUseTranslation.mockReturnValue({
    locale: 'en' as const,
    setLocale: vi.fn(),
    t: enT,
    availableLocales: ['en', 'tr'],
  });
});

describe('RecipeVersionsPage', () => {
  it('logs mount and unmount', async () => {
    mockApi.get.mockResolvedValue({
      title: 'My Recipe',
      slug: 'test-recipe',
      versions: [],
    });
    const { unmount } = render(
      <MemoryRouter>
        <RecipeVersionsPage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'RecipeVersionsPage mounted')
    );
    unmount();
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'RecipeVersionsPage unmounted')
    );
  });

  it('renders version list on successful load', async () => {
    mockApi.get.mockResolvedValue({
      title: 'My Recipe',
      slug: 'test-recipe',
      versions: [
        {
          id: 'v1',
          versionNumber: 1,
          brewDate: '2026-01-01T00:00:00Z',
          brewMethod: 'v60',
          groundWeightGrams: 18,
          extractionVolumeMl: 250,
          extractionTimeSeconds: 180,
          temperatureCelsius: 93,
        },
      ],
    });

    render(
      <MemoryRouter>
        <RecipeVersionsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('v1')).toBeInTheDocument();
    });
  });

  it('shows no results when api fails', async () => {
    mockApi.get.mockRejectedValue(new Error('Not found'));

    render(
      <MemoryRouter>
        <RecipeVersionsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('No results found')).toBeInTheDocument();
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'RecipeVersionsPage loadData failed',
    );
  });
});
