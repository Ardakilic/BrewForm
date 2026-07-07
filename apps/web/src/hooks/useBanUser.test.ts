import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useBanUser } from './useBanUser.ts';

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

vi.mock('../api/index.ts', () => ({
  adminApi: {
    banUser: vi.fn(),
    unbanUser: vi.fn(),
  },
}));

import { adminApi } from '../api/index.ts';

const mockBanUser = vi.mocked(adminApi.banUser);
const mockUnbanUser = vi.mocked(adminApi.unbanUser);

beforeEach(() => {
  vi.clearAllMocks();
});

const testUser = { id: 'u1', username: 'alice', displayName: 'Alice' };

describe('useBanUser', () => {
  it('openBanDialog sets banDialogUser and clears state', () => {
    const { result } = renderHook(() => useBanUser(vi.fn()));
    act(() => {
      result.current.openBanDialog(testUser);
    });
    expect(result.current.banDialogUser).toEqual(testUser);
    expect(result.current.processing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('confirmBan success: calls onSuccess with (userId, true), closes dialog, clears error', async () => {
    mockBanUser.mockResolvedValue({} as never);
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useBanUser(onSuccess));
    act(() => {
      result.current.openBanDialog(testUser);
    });
    await act(async () => {
      await result.current.confirmBan('Spam');
    });
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('u1', true);
    });
    await waitFor(() => {
      expect(result.current.banDialogUser).toBeNull();
    });
    expect(result.current.processing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('confirmBan failure: sets error (key, not server text), resets processing, keeps dialog open', async () => {
    mockBanUser.mockRejectedValue(new Error('Network error'));
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useBanUser(onSuccess));
    act(() => {
      result.current.openBanDialog(testUser);
    });
    await act(async () => {
      await result.current.confirmBan('Spam');
    });
    await waitFor(() => {
      expect(result.current.error).toBe('admin.users.banError');
    });
    expect(result.current.processing).toBe(false);
    expect(result.current.banDialogUser).toEqual(testUser);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('confirmBan with empty reason returns early', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useBanUser(onSuccess));
    act(() => {
      result.current.openBanDialog(testUser);
    });
    await act(async () => {
      await result.current.confirmBan('');
    });
    expect(mockBanUser).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('unban success: calls onSuccess with (userId, false), clears error', async () => {
    mockUnbanUser.mockResolvedValue({} as never);
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useBanUser(onSuccess));
    await act(async () => {
      await result.current.unban('u1');
    });
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('u1', false);
    });
    expect(result.current.error).toBeNull();
  });

  it('unban failure: sets error (key, not server text)', async () => {
    mockUnbanUser.mockRejectedValue(new Error('Server error'));
    const { result } = renderHook(() => useBanUser(vi.fn()));
    await act(async () => {
      await result.current.unban('u1');
    });
    await waitFor(() => {
      expect(result.current.error).toBe('admin.users.unbanError');
    });
  });

  it('unban success: sets processing during request', async () => {
    let resolvePromise!: (value: unknown) => void;
    mockUnbanUser.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }) as never,
    );
    const { result } = renderHook(() => useBanUser(vi.fn()));
    const unbanPromise = result.current.unban('u1');
    await waitFor(() => {
      expect(result.current.processing).toBe(true);
    });
    resolvePromise(undefined);
    await unbanPromise;
    await waitFor(() => {
      expect(result.current.processing).toBe(false);
    });
  });

  it('unban: rejects duplicate calls while processing', async () => {
    let resolvePromise!: (value: unknown) => void;
    mockUnbanUser.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }) as never,
    );
    const { result } = renderHook(() => useBanUser(vi.fn()));
    const firstUnban = result.current.unban('u1');
    await waitFor(() => {
      expect(mockUnbanUser).toHaveBeenCalledTimes(1);
      expect(result.current.processing).toBe(true);
    });
    // Second call must early-return because the first is still in flight;
    // it should not call unbanUser again and should resolve immediately.
    await result.current.unban('u1');
    expect(mockUnbanUser).toHaveBeenCalledTimes(1);
    // Release the in-flight promise and let the first call settle so no
    // dangling state update leaks into the next test.
    resolvePromise(undefined);
    await firstUnban;
  });

  it('clearError clears error', async () => {
    mockUnbanUser.mockRejectedValue(new Error('Server error'));
    const { result } = renderHook(() => useBanUser(vi.fn()));
    await act(async () => {
      await result.current.unban('u1');
    });
    await waitFor(() => {
      expect(result.current.error).toBe('admin.users.unbanError');
    });
    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();
  });

  it('closeDialog clears banDialogUser, error, and processing', () => {
    const { result } = renderHook(() => useBanUser(vi.fn()));
    act(() => {
      result.current.openBanDialog(testUser);
    });
    expect(result.current.banDialogUser).toEqual(testUser);
    act(() => {
      result.current.closeDialog();
    });
    expect(result.current.banDialogUser).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.processing).toBe(false);
  });
});
