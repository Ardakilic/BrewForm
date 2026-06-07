import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStaticCacheSync } from './useStaticCacheSync.ts';

vi.mock('../api/static-cache.ts', () => ({
  CACHE_BUST_KEY: 'brewform-static-cache-bust',
  invalidateStaticCache: vi.fn(),
}));

// Re-import the mocked function so we can assert on it after the mock.
import { invalidateStaticCache } from '../api/static-cache.ts';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useStaticCacheSync', () => {
  it('registers a storage listener on mount', () => {
    const addSpy = vi.spyOn(globalThis, 'addEventListener');
    renderHook(() => useStaticCacheSync());

    const calls = addSpy.mock.calls.filter((call) => call[0] === 'storage');
    expect(calls.length).toBe(1);
    expect(typeof calls[0][1]).toBe('function');

    addSpy.mockRestore();
  });

  it('removes the storage listener on unmount', () => {
    const addSpy = vi.spyOn(globalThis, 'addEventListener');
    const removeSpy = vi.spyOn(globalThis, 'removeEventListener');

    const { unmount } = renderHook(() => useStaticCacheSync());

    const addCalls = addSpy.mock.calls.filter((call) => call[0] === 'storage');
    const addedHandler = addCalls[0][1] as EventListener;

    unmount();

    const removeCalls = removeSpy.mock.calls.filter((call) => call[0] === 'storage');
    expect(removeCalls.length).toBe(1);
    expect(removeCalls[0][1]).toBe(addedHandler);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('calls invalidateStaticCache when a matching storage event fires', () => {
    renderHook(() => useStaticCacheSync());

    const event = new StorageEvent('storage', {
      key: 'brewform-static-cache-bust',
      newValue: '123',
    });
    globalThis.dispatchEvent(event);

    expect(invalidateStaticCache).toHaveBeenCalledTimes(1);
  });

  it('ignores storage events with a different key', () => {
    renderHook(() => useStaticCacheSync());

    const event = new StorageEvent('storage', {
      key: 'brewform-preferences',
      newValue: 'dark',
    });
    globalThis.dispatchEvent(event);

    expect(invalidateStaticCache).not.toHaveBeenCalled();
  });
});
