import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../api/index.ts', () => ({
  collectionApi: { create: vi.fn() },
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
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { useTranslation } from '../../contexts/I18nContext.tsx';
import { collectionApi } from '../../api/index.ts';
import type { CollectionDetailOutput } from '@brewform/shared/schemas';
import { CollectionCreatePage } from './CollectionCreatePage.tsx';

const mockUseTranslation = vi.mocked(useTranslation);
const mockCreate = vi.mocked(collectionApi.create);

// ── Translation helper ─────────────────────────────────────────────────────

const enT = (key: string) => {
  const map: Record<string, string> = {
    'collection.list.create': 'Create Collection',
    'collection.create.name': 'Name',
    'collection.create.description': 'Description',
    'collection.create.visibility': 'Visibility',
    'collection.create.submit': 'Create',
    'collection.create.creating': 'Creating…',
    'collection.visibility.draft': 'Draft',
    'collection.visibility.private': 'Private',
    'collection.visibility.unlisted': 'Unlisted',
    'collection.visibility.public': 'Public',
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

function makeCreatedCollection(
  overrides: Partial<CollectionDetailOutput> = {},
): CollectionDetailOutput {
  return {
    id: 'c-new',
    userId: 'u1',
    name: 'New Collection',
    description: null,
    visibility: 'private',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    author: { username: 'alice', displayName: 'Alice', avatarUrl: null },
    items: [],
    recipeCount: 0,
    ...overrides,
  } as CollectionDetailOutput;
}

function renderCreatePage() {
  const router = createMemoryRouter(
    [
      { path: '/collections/new', element: <CollectionCreatePage /> },
      { path: '/collections/:id', element: null },
    ],
    { initialEntries: ['/collections/new'] },
  );
  return { router, ...render(<RouterProvider router={router} />) };
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockCreate.mockResolvedValue(makeCreatedCollection());
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CollectionCreatePage', () => {
  it('exposes exactly 4 visibility options in draft/private/unlisted/public order', () => {
    renderCreatePage();

    const select = screen.getByRole('combobox');
    const options = Array.from(select.querySelectorAll('option'));
    expect(options).toHaveLength(4);
    expect(options.map((o) => o.getAttribute('value'))).toEqual([
      'draft',
      'private',
      'unlisted',
      'public',
    ]);
  });

  it('disables the submit button while the name is empty', async () => {
    const user = userEvent.setup();
    const { container } = renderCreatePage();

    const submit = screen.getByRole('button', { name: 'Create' });
    expect(submit).toBeDisabled();

    await user.type(container.querySelector('input')!, 'Espresso Picks');
    expect(submit).toBeEnabled();
  });

  it('submits name + visibility with no description key when the textarea is blank', async () => {
    mockCreate.mockResolvedValue(makeCreatedCollection({ id: 'c-42' }));
    const user = userEvent.setup();
    const { container } = renderCreatePage();

    await user.type(container.querySelector('input')!, 'Espresso Picks');
    await user.selectOptions(container.querySelector('select')!, 'public');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
    const payload = mockCreate.mock.calls[0][0];
    expect(payload).toEqual({ name: 'Espresso Picks', visibility: 'public' });
    expect(payload).not.toHaveProperty('description');
  });

  it('sends a trimmed description and navigates to /collections/:id after create', async () => {
    mockCreate.mockResolvedValue(makeCreatedCollection({ id: 'c-77' }));
    const user = userEvent.setup();
    const { router, container } = renderCreatePage();

    await user.type(container.querySelector('input')!, 'Weekend Brews');
    await user.type(container.querySelector('textarea')!, '  curated picks  ');
    await user.selectOptions(container.querySelector('select')!, 'public');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        name: 'Weekend Brews',
        visibility: 'public',
        description: 'curated picks',
      });
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/collections/c-77');
    });
  });
});
