import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CollectionListItemOutput, PaginatedResponse } from '@brewform/shared/schemas';
import { AddToCollectionModal } from './AddToCollectionModal.tsx';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../api/index.ts', () => ({
  collectionApi: {
    list: vi.fn(),
    addRecipe: vi.fn(),
    removeRecipe: vi.fn(),
    create: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    code: string;
    status: number;
    constructor(message: string, code: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    locale: 'en',
    setLocale: vi.fn(),
    availableLocales: ['en', 'tr'],
  }),
}));

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

// ── Imports after mocks ────────────────────────────────────────────────────

import { collectionApi } from '../../api/index.ts';

const mockList = vi.mocked(collectionApi.list);
const mockAddRecipe = vi.mocked(collectionApi.addRecipe);
const mockRemoveRecipe = vi.mocked(collectionApi.removeRecipe);

// ── Factory helpers ────────────────────────────────────────────────────────

function makeCollection(
  overrides: Partial<CollectionListItemOutput> = {},
): CollectionListItemOutput {
  return {
    id: 'c1',
    userId: 'u1',
    name: 'Alpha',
    description: null,
    visibility: 'private',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    recipeCount: 2,
    ...overrides,
  };
}

function makeListResponse(
  data: CollectionListItemOutput[],
): PaginatedResponse<CollectionListItemOutput> {
  return {
    success: true,
    data,
    meta: {
      requestId: 'test',
      pagination: { page: 1, perPage: 20, total: data.length, totalPages: 1 },
    },
  };
}

const defaultProps = { recipeId: 'recipe-1', open: true, onClose: vi.fn() };

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue(
    makeListResponse([
      makeCollection({ id: 'c1', name: 'Alpha', containsRecipe: true, recipeCount: 2 }),
      makeCollection({ id: 'c2', name: 'Beta', containsRecipe: false, recipeCount: 0 }),
    ]),
  );
  mockAddRecipe.mockResolvedValue({ message: 'ok' });
  mockRemoveRecipe.mockResolvedValue({ message: 'ok' });
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AddToCollectionModal', () => {
  it('renders a checkmark only for collections that already contain the recipe', async () => {
    render(<AddToCollectionModal {...defaultProps} />);

    await screen.findByText('Alpha');

    // The list request carries the recipe context
    expect(mockList).toHaveBeenCalledWith({ recipeId: 'recipe-1' });

    // Exactly one checkmark (Alpha contains the recipe, Beta does not)
    const alphaRow = screen.getByText('Alpha').closest('button');
    const betaRow = screen.getByText('Beta').closest('button');
    expect(alphaRow).not.toBeNull();
    expect(betaRow).not.toBeNull();
    expect(alphaRow!.querySelector('[aria-label="collection.modal.alreadyIn"]')).not.toBeNull();
    expect(betaRow!.querySelector('[aria-label="collection.modal.alreadyIn"]')).toBeNull();
  });

  it('clicking a collection that contains the recipe calls removeRecipe (not addRecipe)', async () => {
    render(<AddToCollectionModal {...defaultProps} />);

    await screen.findByText('Alpha');
    const user = userEvent.setup();
    await user.click(screen.getByText('Alpha').closest('button')!);

    await waitFor(() => {
      expect(mockRemoveRecipe).toHaveBeenCalledWith('c1', 'recipe-1');
    });
    expect(mockAddRecipe).not.toHaveBeenCalled();
  });

  it('clicking a collection without the recipe calls addRecipe (not removeRecipe)', async () => {
    render(<AddToCollectionModal {...defaultProps} />);

    await screen.findByText('Beta');
    const user = userEvent.setup();
    await user.click(screen.getByText('Beta').closest('button')!);

    await waitFor(() => {
      expect(mockAddRecipe).toHaveBeenCalledWith('c2', 'recipe-1');
    });
    expect(mockRemoveRecipe).not.toHaveBeenCalled();
  });
});
