import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery.ts';

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

/**
 * useMediaQuery — tracks whether a CSS media query matches via
 * `useSyncExternalStore` over `globalThis.matchMedia`. jsdom has no real
 * matchMedia, so these tests install a controllable stub that records
 * `change` listeners and lets each test flip the match state and fire the
 * listeners manually (wrapped in `act()` so React applies the re-render).
 */

type ChangeListener = (event: MediaQueryListEvent) => void;

/** Controllable matchMedia stub: one shared MediaQueryList whose `matches` flips on demand. */
function createMatchMediaStub(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<ChangeListener>();

  const mql = {
    get matches() {
      return matches;
    },
    media: '',
    onchange: null,
    addEventListener: (_type: string, listener: ChangeListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: ChangeListener) => {
      listeners.delete(listener);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;

  const matchMedia = vi.fn((query: string): MediaQueryList => {
    Object.defineProperty(mql, 'media', { value: query, configurable: true });
    return mql;
  });

  /** Flip the match state and notify all subscribed listeners. */
  const setMatches = (next: boolean) => {
    matches = next;
    const event = { matches: next, media: mql.media } as MediaQueryListEvent;
    for (const listener of [...listeners]) listener(event);
  };

  return { matchMedia, setMatches, listenerCount: () => listeners.size };
}

let originalMatchMedia: typeof globalThis.matchMedia;
let stub: ReturnType<typeof createMatchMediaStub>;

beforeEach(() => {
  vi.clearAllMocks();
  originalMatchMedia = globalThis.matchMedia;
  stub = createMatchMediaStub(false);
  Object.defineProperty(globalThis, 'matchMedia', {
    value: stub.matchMedia,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, 'matchMedia', {
    value: originalMatchMedia,
    configurable: true,
    writable: true,
  });
});

describe('useMediaQuery', () => {
  it('returns true on first render when the query matches', () => {
    stub.setMatches(true);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('returns false on first render when the query does not match', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);
  });

  it('updates when the media query match state changes', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);

    act(() => {
      stub.setMatches(true);
    });
    expect(result.current).toBe(true);

    act(() => {
      stub.setMatches(false);
    });
    expect(result.current).toBe(false);
  });

  it('unsubscribes from change events on unmount', () => {
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(stub.listenerCount()).toBe(1);

    unmount();
    expect(stub.listenerCount()).toBe(0);
  });

  it('re-reads the snapshot against the new query when the query string changes', () => {
    const { rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: '(min-width: 768px)' },
    });

    rerender({ query: '(min-width: 1024px)' });

    expect(stub.matchMedia).toHaveBeenCalledWith('(min-width: 1024px)');
  });
});
