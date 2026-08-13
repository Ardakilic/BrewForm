import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../api/index.ts', () => ({
  brewLogApi: { list: vi.fn() },
  ApiError: class extends Error {
    status: number;
    constructor(status: number) {
      super('api error');
      this.status = status;
    }
  },
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

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

// ── Imports after mocks ────────────────────────────────────────────────────

import { useTranslation } from '../../contexts/I18nContext.tsx';
import { brewLogApi } from '../../api/index.ts';
import type { BrewLogListItemOutput, PaginatedResponse } from '@brewform/shared/schemas';
import { BrewLogListPage, loader } from './BrewLogListPage.tsx';

const mockUseTranslation = vi.mocked(useTranslation);
const mockList = vi.mocked(brewLogApi.list);

// ── Translation helper ─────────────────────────────────────────────────────

const enT = (key: string) => {
  const map: Record<string, string> = {
    'brewLog.list.title': 'Brew Journal',
    'brewLog.list.empty': 'No brews logged yet.',
    'brewLog.list.new': 'Log a Brew',
    'brewLog.list.newHint': 'Brews are logged from a recipe page.',
    'brewLog.card.rating': 'Rating',
    'brewLog.card.notes': 'Notes',
    'brewLog.card.yieldActual': 'Yield',
    'brewLog.card.doseActual': 'Dose',
    'common.previous': 'Previous',
    'common.next': 'Next',
    'common.pagination': 'Page {page} of {total}',
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

function makeListResponse(
  data: BrewLogListItemOutput[],
  pagination?: Partial<PaginatedResponse<BrewLogListItemOutput>['meta']['pagination']>,
): PaginatedResponse<BrewLogListItemOutput> {
  return {
    success: true,
    data,
    meta: {
      requestId: 'test',
      pagination: { page: 1, perPage: 20, total: data.length, totalPages: 1, ...pagination },
    },
  };
}

const HydrateFallback = () => null;

function renderListPage(initialEntry = '/brew-logs') {
  const router = createMemoryRouter(
    [{ path: '/brew-logs', element: <BrewLogListPage />, loader, HydrateFallback }],
    { initialEntries: [initialEntry] },
  );
  return render(<RouterProvider router={router} />);
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockList.mockResolvedValue(makeListResponse([]));
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('BrewLogListPage', () => {
  it('renders the page title and the new-brew hint linking to /recipes', async () => {
    renderListPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Brew Journal' })).toBeInTheDocument();
    });

    const link = screen.getByRole('link', { name: 'Log a Brew' });
    expect(link.getAttribute('href')).toBe('/recipes');
  });

  it('renders the empty-state message when the journal is empty', async () => {
    renderListPage();

    await waitFor(() => {
      expect(screen.getByText('No brews logged yet.')).toBeInTheDocument();
    });
  });

  it('passes the ?page param to brewLogApi.list', async () => {
    renderListPage('/brew-logs?page=3');

    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith({ page: 3 });
    });
  });

  it('renders a card per log and pagination when there are multiple pages', async () => {
    mockList.mockResolvedValue(
      makeListResponse(
        [makeLog({ id: 'bl1' }), makeLog({ id: 'bl2', recipeTitle: 'V60', recipeSlug: 'v60' })],
        { total: 40, totalPages: 2 },
      ),
    );

    renderListPage();

    await waitFor(() => {
      expect(screen.getByText('My Espresso')).toBeInTheDocument();
      expect(screen.getByText('V60')).toBeInTheDocument();
    });

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });
});
