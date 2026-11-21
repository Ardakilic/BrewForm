/**
 * Tests for useElementWidth (ResizeObserver-based width tracking).
 *
 * Feature: wave-6-audit-remediation (t6, task 19.9)
 */
import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useElementWidth } from './useElementWidth.ts';

/** Renders the measured width of its own root element. */
function Probe({ fallback }: { fallback: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref, fallback);
  return <div ref={ref} data-testid="probe" data-width={width} />;
}

/** Minimal controllable ResizeObserver stand-in. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  callback: ResizeObserverCallback;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  /** Delivers one resize entry with the given content width. */
  emit(width: number): void {
    this.callback(
      [{ contentRect: { width } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

const widthOf = () => Number(screen.getByTestId('probe').getAttribute('data-width'));

describe('useElementWidth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    FakeResizeObserver.instances = [];
  });

  it('returns the fallback when ResizeObserver is unavailable (jsdom)', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    render(<Probe fallback={200} />);
    expect(widthOf()).toBe(200);
  });

  it('keeps the fallback when the element measures 0px wide', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    render(<Probe fallback={200} />);
    expect(widthOf()).toBe(200);
    act(() => FakeResizeObserver.instances[0].emit(0));
    expect(widthOf()).toBe(200);
  });

  it('measures the element before paint and observes it', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 320,
    } as DOMRect);
    render(<Probe fallback={200} />);
    expect(widthOf()).toBe(320);
    expect(FakeResizeObserver.instances).toHaveLength(1);
    expect(FakeResizeObserver.instances[0].observe).toHaveBeenCalledWith(
      screen.getByTestId('probe'),
    );
  });

  it('updates on resize with the latest entry width', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    render(<Probe fallback={200} />);
    act(() => FakeResizeObserver.instances[0].emit(507));
    expect(widthOf()).toBe(507);
    act(() => FakeResizeObserver.instances[0].emit(670));
    expect(widthOf()).toBe(670);
  });

  it('disconnects the observer on unmount', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const { unmount } = render(<Probe fallback={200} />);
    const [observer] = FakeResizeObserver.instances;
    unmount();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });
});
