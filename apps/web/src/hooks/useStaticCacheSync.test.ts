import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStaticCacheSync } from './useStaticCacheSync.ts';

vi.mock('../api/static-cache.ts', () => ({
  CACHE_BUST_KEY: 'brewform-static-cache-bust',
  clearStaticCache: vi.fn(),
  invalidateStaticCache: vi.fn(),
}));

// Re-import the mocked functions so we can assert on them after the mock.
import { clearStaticCache, invalidateStaticCache } from '../api/static-cache.ts';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useStaticCacheSync', () => {
  it('registers a storage listener on mount', () => {
    const addSpy = vi.spyOn(globalThis, 'addEventListener');
    renderHook(() => useStaticCacheSync());

    const calls = addSpy.mock.calls.filter((call) => call[0] === 'storage');
    expect(calls.length).toBe(1);
    expect(typeof calls[0][1]).toBe('function');
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
  });

  it('clears the local cache once on a bust event, without re-broadcasting it', () => {
    const setItemSpy = vi.spyOn(globalThis.localStorage, 'setItem');
    const { unmount } = renderHook(() => useStaticCacheSync());

    globalThis.dispatchEvent(
      new StorageEvent('storage', { key: 'brewform-static-cache-bust', newValue: '123' }),
    );

    expect(clearStaticCache).toHaveBeenCalledTimes(1);
    expect(invalidateStaticCache).not.toHaveBeenCalled();
    expect(setItemSpy.mock.calls.some(([key]) => key === 'brewform-static-cache-bust')).toBe(false);
    unmount();
  });

  it('ignores storage events with a different key', () => {
    const { unmount } = renderHook(() => useStaticCacheSync());

    globalThis.dispatchEvent(
      new StorageEvent('storage', { key: 'brewform-preferences', newValue: 'dark' }),
    );

    expect(clearStaticCache).not.toHaveBeenCalled();
    expect(invalidateStaticCache).not.toHaveBeenCalled();
    unmount();
  });
});
