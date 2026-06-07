import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminEquipmentPage } from './AdminEquipmentPage.tsx';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../api/static-cache.ts', () => ({
  getEquipmentCached: vi.fn(),
  getTasteNotesCached: vi.fn(),
  invalidateStaticCache: vi.fn(),
}));

vi.mock('../../api/client.ts', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
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

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AdminEquipmentPage', () => {
  it('renders the equipment table after initial fetch', async () => {
    mockApi.get.mockResolvedValue([
      { id: 'eq-1', name: 'Acaia Lunar', type: 'scale_accessory', brand: 'Acaia', model: null },
    ]);

    render(<AdminEquipmentPage />);

    await waitFor(() => {
      expect(screen.getByText('Acaia Lunar')).toBeInTheDocument();
    });
  });

  it('create flow: post + invalidateStaticCache called once', async () => {
    mockApi.get.mockResolvedValue([]);
    const created = {
      id: 'eq-2',
      name: 'Fellow Stagg',
      type: 'kettle',
      brand: 'Fellow',
      model: null,
    };
    mockApi.post.mockResolvedValue(created);

    render(<AdminEquipmentPage />);
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /Add Equipment/i }));

    const nameInput = screen.getByLabelText(/Name \*/i);
    const typeInput = screen.getByLabelText(/Type \*/i);
    await userEvent.type(nameInput, 'Fellow Stagg');
    await userEvent.type(typeInput, 'kettle');

    await userEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(screen.getByText('Fellow Stagg')).toBeInTheDocument();
    });

    expect(mockApi.post).toHaveBeenCalledTimes(1);
    expect(mockInvalidateStaticCache).toHaveBeenCalledTimes(1);
  });

  it('edit flow: click Edit, modify form, submit, patch + invalidateStaticCache called once', async () => {
    mockApi.get.mockResolvedValue([
      { id: 'eq-1', name: 'Acaia Lunar', type: 'scale_accessory', brand: 'Acaia', model: null },
    ]);
    const updated = {
      id: 'eq-1',
      name: 'Acaia Lunar Pro',
      type: 'scale_accessory',
      brand: 'Acaia',
      model: null,
    };
    mockApi.patch.mockResolvedValue(updated);

    render(<AdminEquipmentPage />);
    await waitFor(() => expect(screen.getByText('Acaia Lunar')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /Edit/i }));

    const nameInput = screen.getByLabelText(/Name \*/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Acaia Lunar Pro');

    await userEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(screen.getByText('Acaia Lunar Pro')).toBeInTheDocument();
    });

    expect(mockApi.patch).toHaveBeenCalledTimes(1);
    expect(mockInvalidateStaticCache).toHaveBeenCalledTimes(1);
  });

  it('delete flow: confirm, api.delete + invalidateStaticCache called once', async () => {
    mockApi.get.mockResolvedValue([
      { id: 'eq-1', name: 'Acaia Lunar', type: 'scale_accessory', brand: 'Acaia', model: null },
    ]);
    mockApi.delete.mockResolvedValue({});
    vi.stubGlobal('confirm', () => true);

    render(<AdminEquipmentPage />);
    await waitFor(() => expect(screen.getByText('Acaia Lunar')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /Delete/i }));

    await waitFor(() => {
      expect(mockApi.delete).toHaveBeenCalledTimes(1);
    });

    expect(mockInvalidateStaticCache).toHaveBeenCalledTimes(1);
  });

  it('failed create does NOT call invalidateStaticCache', async () => {
    mockApi.get.mockResolvedValue([]);
    mockApi.post.mockRejectedValue(new Error('Network error'));

    render(<AdminEquipmentPage />);
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /Add Equipment/i }));

    const nameInput = screen.getByLabelText(/Name \*/i);
    const typeInput = screen.getByLabelText(/Type \*/i);
    await userEvent.type(nameInput, 'Fellow Stagg');
    await userEvent.type(typeInput, 'kettle');

    await userEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledTimes(1);
    });

    expect(mockInvalidateStaticCache).not.toHaveBeenCalled();
  });

  it('failed edit does NOT call invalidateStaticCache', async () => {
    mockApi.get.mockResolvedValue([
      { id: 'eq-1', name: 'Acaia Lunar', type: 'scale_accessory', brand: 'Acaia', model: null },
    ]);
    mockApi.patch.mockRejectedValue(new Error('Network error'));

    render(<AdminEquipmentPage />);
    await waitFor(() => expect(screen.getByText('Acaia Lunar')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /Edit/i }));

    const nameInput = screen.getByLabelText(/Name \*/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Acaia Lunar Pro');

    await userEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledTimes(1);
    });

    expect(mockInvalidateStaticCache).not.toHaveBeenCalled();
  });

  it('failed delete does NOT call invalidateStaticCache', async () => {
    mockApi.get.mockResolvedValue([
      { id: 'eq-1', name: 'Acaia Lunar', type: 'scale_accessory', brand: 'Acaia', model: null },
    ]);
    mockApi.delete.mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('confirm', () => true);

    render(<AdminEquipmentPage />);
    await waitFor(() => expect(screen.getByText('Acaia Lunar')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /Delete/i }));

    await waitFor(() => {
      expect(mockApi.delete).toHaveBeenCalledTimes(1);
    });

    expect(mockInvalidateStaticCache).not.toHaveBeenCalled();
  });
});
