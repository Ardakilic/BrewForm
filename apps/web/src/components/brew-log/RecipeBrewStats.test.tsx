import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../api/index.ts', () => ({
  brewLogApi: { getRecipeStats: vi.fn() },
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { useTranslation } from '../../contexts/I18nContext.tsx';
import { brewLogApi } from '../../api/index.ts';
import { RecipeBrewStats } from './RecipeBrewStats.tsx';

const mockUseTranslation = vi.mocked(useTranslation);
const mockGetRecipeStats = vi.mocked(brewLogApi.getRecipeStats);

// ── Translation helper ─────────────────────────────────────────────────────

const enT = (key: string) => {
  const map: Record<string, string> = {
    'brewLog.stats.totalBrews': 'Total Brews',
    'brewLog.stats.avgRating': 'Average Rating',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('RecipeBrewStats', () => {
  it('renders brew count and average rating to one decimal', async () => {
    mockGetRecipeStats.mockResolvedValue({ recipeId: 'r1', brewCount: 7, avgBrewRating: 8.25 });

    render(<RecipeBrewStats recipeId='r1' />);

    await waitFor(() => {
      expect(screen.getByTestId('recipe-brew-stats')).toBeInTheDocument();
    });

    expect(screen.getByText('Total Brews')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('8.3/10')).toBeInTheDocument();
  });

  it('renders only the count when avgBrewRating is null', async () => {
    mockGetRecipeStats.mockResolvedValue({ recipeId: 'r1', brewCount: 3, avgBrewRating: null });

    render(<RecipeBrewStats recipeId='r1' />);

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    expect(screen.queryByText('Average Rating')).not.toBeInTheDocument();
  });

  it('renders nothing when brewCount is zero', async () => {
    mockGetRecipeStats.mockResolvedValue({ recipeId: 'r1', brewCount: 0, avgBrewRating: null });

    render(<RecipeBrewStats recipeId='r1' />);

    await waitFor(() => {
      expect(mockGetRecipeStats).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('recipe-brew-stats')).not.toBeInTheDocument();
  });

  it('renders nothing when the stats request fails', async () => {
    mockGetRecipeStats.mockRejectedValue(new Error('boom'));

    render(<RecipeBrewStats recipeId='r1' />);

    await waitFor(() => {
      expect(mockGetRecipeStats).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('recipe-brew-stats')).not.toBeInTheDocument();
  });
});
