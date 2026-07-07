import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDebounce } from './useDebounce.ts';

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

/**
 * useDebounce — debounces a value by the specified delay. Returns the
 * debounced value, which updates only after `delay` ms of inactivity.
 *
 * Note: React effects fire asynchronously after render, so each test
 * splits the `rerender` (which schedules the effect) from the
 * `advanceTimersByTime` (which fires the timer the effect set) into
 * separate `act()` blocks. This ensures the `setTimeout` is registered
 * before we try to advance it.
 */
describe('useDebounce', () => {
  it('returns the initial value immediately on first render', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
    vi.useRealTimers();
  });

  it('does NOT update the debounced value before the delay elapses', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 'a', delay: 300 },
    });
    act(() => {
      rerender({ value: 'b', delay: 300 });
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('a');
    vi.useRealTimers();
  });

  it('updates the debounced value after the delay elapses', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 'a', delay: 300 },
    });
    act(() => {
      rerender({ value: 'b', delay: 300 });
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('b');
    vi.useRealTimers();
  });

  it('resets the timer when the value changes again before the delay', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 'a', delay: 300 },
    });
    act(() => {
      rerender({ value: 'b', delay: 300 });
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      rerender({ value: 'c', delay: 300 });
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // Only 200ms since last change — still showing 'a'
    expect(result.current).toBe('a');
    // After the full 300ms since the last change, it updates to 'c'
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('c');
    vi.useRealTimers();
  });

  it('uses a default delay of 300ms when none is provided', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebounce(value), {
      initialProps: { value: 'a' },
    });
    act(() => {
      rerender({ value: 'b' });
    });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('b');
    vi.useRealTimers();
  });

  it('debounces rapid successive changes and only emits the final value', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 0, delay: 100 },
    });
    for (let i = 1; i <= 5; i++) {
      act(() => {
        rerender({ value: i, delay: 100 });
      });
      act(() => {
        vi.advanceTimersByTime(50);
      });
    }
    // 50ms since the last change — nothing yet
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe(5);
    vi.useRealTimers();
  });

  it('handles value changes that occur after a previous debounce completes', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 'a', delay: 200 },
    });
    act(() => {
      rerender({ value: 'b', delay: 200 });
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('b');
    act(() => {
      rerender({ value: 'c', delay: 200 });
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('c');
    vi.useRealTimers();
  });
});
