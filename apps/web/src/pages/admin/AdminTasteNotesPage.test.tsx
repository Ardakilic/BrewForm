import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminTasteNotesPage } from './AdminTasteNotesPage.tsx';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../api/static-cache.ts', () => ({
  getEquipmentCached: vi.fn(),
  getTasteNotesCached: vi.fn(),
  invalidateStaticCache: vi.fn(),
}));

vi.mock('../../api/client.ts', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { api } from '../../api/index.ts';
import { invalidateStaticCache } from '../../api/static-cache.ts';

const mockApi = vi.mocked(api);
const mockInvalidateStaticCache = vi.mocked(invalidateStaticCache);

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AdminTasteNotesPage', () => {
  it('renders the taste notes list after initial fetch', async () => {
    mockApi.get.mockResolvedValue([
      { id: 'tn-1', name: 'Fruity', depth: 0, parentId: null },
    ]);

    render(<AdminTasteNotesPage />);

    await waitFor(() => {
      expect(screen.getByText('Fruity')).toBeInTheDocument();
    });
  });

  it('create flow: post + invalidateStaticCache called once', async () => {
    mockApi.get.mockResolvedValue([]);
    const created = { id: 'tn-2', name: 'Berry', depth: 0, parentId: null };
    mockApi.post.mockResolvedValue(created);

    render(<AdminTasteNotesPage />);
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /Add Taste Note/i }));

    const nameInput = screen.getByLabelText(/Name \*/i);
    await userEvent.type(nameInput, 'Berry');

    await userEvent.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() => {
      expect(screen.getByText('Berry')).toBeInTheDocument();
    });

    expect(mockApi.post).toHaveBeenCalledTimes(1);
    expect(mockInvalidateStaticCache).toHaveBeenCalledTimes(1);
  });

  it('delete flow: confirm, api.delete + invalidateStaticCache called once', async () => {
    mockApi.get.mockResolvedValue([
      { id: 'tn-1', name: 'Fruity', depth: 0, parentId: null },
    ]);
    mockApi.delete.mockResolvedValue({});
    vi.stubGlobal('confirm', () => true);

    render(<AdminTasteNotesPage />);
    await waitFor(() => expect(screen.getByText('Fruity')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /Delete/i }));

    await waitFor(() => {
      expect(mockApi.delete).toHaveBeenCalledTimes(1);
    });

    expect(mockInvalidateStaticCache).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('failed create does NOT call invalidateStaticCache', async () => {
    mockApi.get.mockResolvedValue([]);
    mockApi.post.mockRejectedValue(new Error('Network error'));

    render(<AdminTasteNotesPage />);
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /Add Taste Note/i }));

    const nameInput = screen.getByLabelText(/Name \*/i);
    await userEvent.type(nameInput, 'Berry');

    await userEvent.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledTimes(1);
    });

    expect(mockInvalidateStaticCache).not.toHaveBeenCalled();
  });

  it('failed delete does NOT call invalidateStaticCache', async () => {
    mockApi.get.mockResolvedValue([
      { id: 'tn-1', name: 'Fruity', depth: 0, parentId: null },
    ]);
    mockApi.delete.mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('confirm', () => true);

    render(<AdminTasteNotesPage />);
    await waitFor(() => expect(screen.getByText('Fruity')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /Delete/i }));

    await waitFor(() => {
      expect(mockApi.delete).toHaveBeenCalledTimes(1);
    });

    expect(mockInvalidateStaticCache).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
