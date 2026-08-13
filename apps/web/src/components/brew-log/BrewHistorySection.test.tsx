import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { BrewLogListItemOutput, PaginatedResponse } from '@brewform/shared/schemas';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../api/index.ts', () => ({
  brewLogApi: { listForRecipe: vi.fn() },
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { useTranslation } from '../../contexts/I18nContext.tsx';
import { brewLogApi } from '../../api/index.ts';
import { BrewHistorySection } from './BrewHistorySection.tsx';

const mockUseTranslation = vi.mocked(useTranslation);
const mockListForRecipe = vi.mocked(brewLogApi.listForRecipe);

// ── Translation helper ─────────────────────────────────────────────────────

const enT = (key: string) => {
  const map: Record<string, string> = {
    'brewLog.history.title': 'Brew History',
    'brewLog.history.brewAgain': 'Brew Again',
    'brewLog.history.empty': 'No brews logged for this recipe yet.',
    'brewLog.card.rating': 'Rating',
    'brewLog.card.notes': 'Notes',
    'brewLog.card.yieldActual': 'Yield',
    'brewLog.card.doseActual': 'Dose',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

// ── Factory helpers ────────────────────────────────────────────────────────

function makeLog(overrides: Partial<BrewLogListItemOutput> = {}): BrewLogListItemOutput {
  return {
    id: 'bl1',
    userId: 'u1',
    recipeId: 'r1',
    recipeVersionId: null,
    brewedAt: '2026-03-15T09:30:00Z',
    yieldActual: 36,
    doseActual: 18,
    notes: null,
    personalRating: null,
    createdAt: '2026-03-15T09:30:00Z',
    updatedAt: '2026-03-15T09:30:00Z',
    recipeTitle: 'My Espresso',
    recipeSlug: 'my-espresso',
    ...overrides,
  };
}

function makeResponse(data: BrewLogListItemOutput[]): PaginatedResponse<BrewLogListItemOutput> {
  return {
    success: true,
    data,
    meta: {
      requestId: 'test',
      pagination: { page: 1, perPage: 5, total: data.length, totalPages: 1 },
    },
  };
}

function renderSection(
  props: { recipeId: string; currentVersionId: string | null } = {
    recipeId: 'r1',
    currentVersionId: 'v1',
  },
) {
  const router = createMemoryRouter(
    [{ path: '/', element: <BrewHistorySection {...props} /> }],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockListForRecipe.mockResolvedValue(makeResponse([]));
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('BrewHistorySection', () => {
  it('fetches the first page of five logs for the recipe', async () => {
    renderSection();

    await waitFor(() => {
      expect(mockListForRecipe).toHaveBeenCalledWith('r1', { page: 1, perPage: 5 });
    });
  });

  it('renders the title and a Brew Again link carrying recipeId and recipeVersionId', async () => {
    renderSection();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Brew History' })).toBeInTheDocument();
    });

    const link = screen.getByRole('link', { name: 'Brew Again' });
    expect(link.getAttribute('href')).toBe('/brew-logs/new?recipeId=r1&recipeVersionId=v1');
  });

  it('omits recipeVersionId from the Brew Again link when it is null', async () => {
    renderSection({ recipeId: 'r1', currentVersionId: null });

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Brew Again' })).toBeInTheDocument();
    });

    const link = screen.getByRole('link', { name: 'Brew Again' });
    expect(link.getAttribute('href')).toBe('/brew-logs/new?recipeId=r1');
  });

  it('renders a card per log without recipe links', async () => {
    mockListForRecipe.mockResolvedValue(
      makeResponse([makeLog({ id: 'bl1', notes: 'Sweet' }), makeLog({ id: 'bl2' })]),
    );

    renderSection();

    await waitFor(() => {
      expect(screen.getAllByText('Sweet')).toHaveLength(1);
    });

    expect(screen.queryByRole('link', { name: 'My Espresso' })).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no logs', async () => {
    renderSection();

    await waitFor(() => {
      expect(
        screen.getByText('No brews logged for this recipe yet.'),
      ).toBeInTheDocument();
    });
  });

  it('shows no items and no empty state while the request fails silently', async () => {
    mockListForRecipe.mockRejectedValue(new Error('boom'));

    renderSection();

    await waitFor(() => {
      expect(mockListForRecipe).toHaveBeenCalled();
    });

    expect(
      screen.queryByText('No brews logged for this recipe yet.'),
    ).not.toBeInTheDocument();
  });
});
