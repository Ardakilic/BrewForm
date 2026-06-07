import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EquipmentListPage } from './EquipmentListPage.tsx';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../api/static-cache.ts', () => ({
  getEquipmentCached: vi.fn(),
  getTasteNotesCached: vi.fn(),
  invalidateStaticCache: vi.fn(),
}));

vi.mock('../../api/client.ts', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../../utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: () => null,
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { useTranslation } from '../../contexts/I18nContext.tsx';
import { api } from '../../api/index.ts';
import { invalidateStaticCache } from '../../api/static-cache.ts';

const mockUseTranslation = vi.mocked(useTranslation);
const mockApi = vi.mocked(api);
const mockInvalidateStaticCache = vi.mocked(invalidateStaticCache);

// ── Translation helpers ──────────────────────────────────────────────────────

const enT = (key: string) => {
  const map: Record<string, string> = {
    'equipment.title': 'Equipment',
    'equipment.addEquipment': 'Add Equipment',
    'equipment.addEquipmentTitle': 'Add Equipment',
    'equipment.name': 'Name',
    'equipment.type': 'Type',
    'equipment.brand': 'Brand',
    'equipment.model': 'Model',
    'equipment.adding': 'Adding...',
    'equipment.noEquipment': 'No equipment yet.',
    'common.loading': 'Loading...',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
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

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('EquipmentListPage', () => {
  it('renders loading state on initial mount', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));
    render(<EquipmentListPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders the equipment list after initial fetch', async () => {
    mockApi.get.mockResolvedValue([
      {
        id: 'eq-1',
        name: 'Acaia Lunar',
        type: 'scale_accessory',
        brand: 'Acaia',
        model: null,
        createdAt: '2025-01-01',
      },
    ]);

    render(<EquipmentListPage />);

    await waitFor(() => {
      expect(screen.getByText('Acaia Lunar')).toBeInTheDocument();
    });
  });

  it('submits the create form, appends to local state, and invalidates the cache', async () => {
    mockApi.get.mockResolvedValue([]);
    const newEq = {
      id: 'eq-2',
      name: 'Fellow Stagg',
      type: 'kettle',
      brand: 'Fellow',
      model: null,
      createdAt: '2025-01-02',
    };
    mockApi.post.mockResolvedValue(newEq);

    render(<EquipmentListPage />);
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Add Equipment' }));

    const nameInput = screen.getByLabelText('Name *');
    const typeInput = screen.getByLabelText('Type *');
    await userEvent.type(nameInput, 'Fellow Stagg');
    await userEvent.type(typeInput, 'kettle');

    await userEvent.click(screen.getByRole('button', { name: 'Add Equipment' }));

    await waitFor(() => {
      expect(screen.getByText('Fellow Stagg')).toBeInTheDocument();
    });

    expect(mockApi.post).toHaveBeenCalledTimes(1);
    expect(mockInvalidateStaticCache).toHaveBeenCalledTimes(1);
  });

  it('does NOT invalidate the cache when create API rejects', async () => {
    mockApi.get.mockResolvedValue([]);
    mockApi.post.mockRejectedValue(new Error('Network error'));

    render(<EquipmentListPage />);
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Add Equipment' }));

    const nameInput = screen.getByLabelText('Name *');
    const typeInput = screen.getByLabelText('Type *');
    await userEvent.type(nameInput, 'Fellow Stagg');
    await userEvent.type(typeInput, 'kettle');

    await userEvent.click(screen.getByRole('button', { name: 'Add Equipment' }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledTimes(1);
    });

    expect(mockInvalidateStaticCache).not.toHaveBeenCalled();
  });

  it('clicks delete, calls api.delete, and invalidates the cache', async () => {
    mockApi.get.mockResolvedValue([
      {
        id: 'eq-1',
        name: 'Acaia Lunar',
        type: 'scale_accessory',
        brand: 'Acaia',
        model: null,
        createdAt: '2025-01-01',
      },
    ]);
    mockApi.delete.mockResolvedValue({});
    vi.stubGlobal('confirm', () => true);

    render(<EquipmentListPage />);
    await waitFor(() => expect(screen.getByText('Acaia Lunar')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockApi.delete).toHaveBeenCalledTimes(1);
    });

    expect(mockInvalidateStaticCache).toHaveBeenCalledTimes(1);
  });

  it('does NOT invalidate the cache when delete API rejects', async () => {
    mockApi.get.mockResolvedValue([
      {
        id: 'eq-1',
        name: 'Acaia Lunar',
        type: 'scale_accessory',
        brand: 'Acaia',
        model: null,
        createdAt: '2025-01-01',
      },
    ]);
    mockApi.delete.mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('confirm', () => true);

    render(<EquipmentListPage />);
    await waitFor(() => expect(screen.getByText('Acaia Lunar')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockApi.delete).toHaveBeenCalledTimes(1);
    });

    expect(mockInvalidateStaticCache).not.toHaveBeenCalled();
  });
});
