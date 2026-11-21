import type { CollectionListItemOutput } from '@brewform/shared/schemas';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionCard } from './CollectionCard.tsx';

vi.mock('../../utils/logger.ts', () => ({
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
  useTranslation: vi.fn(),
}));

import { useTranslation } from '../../contexts/I18nContext.tsx';

const mockUseTranslation = vi.mocked(useTranslation);

const enT = (key: string) => {
  const map: Record<string, string> = {
    'common.by': 'by',
    'common.deletedUser': 'Deleted user',
    'collection.detail.recipes': 'recipes',
  };
  return map[key] ?? key;
};

const collection: CollectionListItemOutput = {
  id: 'c1',
  userId: 'u1',
  name: 'Morning brews',
  description: null,
  visibility: 'public',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  deletedAt: null,
  recipeCount: 3,
};

/** Render the card inside a memory router (the card is a `<Link>`, the author a navigate button). */
function renderCard(ui: React.ReactElement) {
  const router = createMemoryRouter([{ path: '/', element: ui }], { initialEntries: ['/'] });
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue({
    locale: 'en',
    setLocale: vi.fn(),
    t: enT,
    availableLocales: ['en', 'tr'],
  });
});

describe('CollectionCard', () => {
  it('renders the author button for a live owner with showAuthor', () => {
    renderCard(
      <CollectionCard
        collection={{
          ...collection,
          author: { username: 'alice', displayName: 'Alice', avatarUrl: null },
        }}
        showAuthor
      />,
    );
    expect(screen.getByRole('button', { name: 'Alice' })).toBeInTheDocument();
  });

  it('renders "by Deleted user" without a button when the owner account was deleted', () => {
    renderCard(<CollectionCard collection={{ ...collection, author: null }} showAuthor />);
    expect(screen.getByText(/Deleted user/)).toBeInTheDocument();
    expect(screen.getByText(/Deleted user/).textContent).toBe('by Deleted user');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders no author line without showAuthor', () => {
    renderCard(<CollectionCard collection={{ ...collection, author: null }} />);
    expect(screen.queryByText(/Deleted user/)).not.toBeInTheDocument();
  });
});
