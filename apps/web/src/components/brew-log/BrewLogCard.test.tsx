import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { BrewLogListItemOutput } from '@brewform/shared/schemas';
import { BrewLogCard } from './BrewLogCard.tsx';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { useTranslation } from '../../contexts/I18nContext.tsx';

const mockUseTranslation = vi.mocked(useTranslation);

// ── Translation helper ─────────────────────────────────────────────────────

const enT = (key: string) => {
  const map: Record<string, string> = {
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
    notes: 'Sweet and balanced',
    personalRating: 8,
    createdAt: '2026-03-15T09:30:00Z',
    updatedAt: '2026-03-15T09:30:00Z',
    recipeTitle: 'My Espresso',
    recipeSlug: 'my-espresso',
    ...overrides,
  };
}

function renderCard(props: Parameters<typeof BrewLogCard>[0]) {
  const router = createMemoryRouter(
    [{ path: '/', element: <BrewLogCard {...props} /> }],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('BrewLogCard', () => {
  it('renders the recipe title as a link to /recipes/:slug', () => {
    renderCard({ log: makeLog() });

    const link = screen.getByRole('link', { name: 'My Espresso' });
    expect(link.getAttribute('href')).toBe('/recipes/my-espresso');
  });

  it('renders yield, dose, and rating with units', () => {
    renderCard({ log: makeLog() });

    expect(screen.getByText('Yield: 36 g')).toBeInTheDocument();
    expect(screen.getByText('Dose: 18 g')).toBeInTheDocument();
    expect(screen.getByText('Rating: 8/10')).toBeInTheDocument();
  });

  it('omits yield/dose/rating when they are null', () => {
    renderCard({
      log: makeLog({ yieldActual: null, doseActual: null, personalRating: null }),
    });

    expect(screen.queryByText(/^Yield/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Dose/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Rating/)).not.toBeInTheDocument();
  });

  it('truncates notes longer than 120 characters', () => {
    const longNotes = 'a'.repeat(200);
    renderCard({ log: makeLog({ notes: longNotes }) });

    expect(screen.getByText(`${'a'.repeat(120)}…`)).toBeInTheDocument();
  });

  it('hides the recipe link when showRecipe is false', () => {
    renderCard({ log: makeLog(), showRecipe: false });

    expect(screen.queryByRole('link', { name: 'My Espresso' })).not.toBeInTheDocument();
  });
});
