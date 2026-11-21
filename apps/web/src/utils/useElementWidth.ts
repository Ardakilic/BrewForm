import { type RefObject, useLayoutEffect, useState } from 'react';

/**
 * Tracks an element's rendered width in px with a `ResizeObserver`.
 *
 * The first render (and every render before a usable measurement) returns
 * `fallbackWidth`, so layout that depends on the width is deterministic on
 * first paint, in print and in jsdom. The element is measured in
 * `useLayoutEffect` (before paint) and then observed for resizes. Where
 * `ResizeObserver` is unavailable (jsdom, very old browsers) the fallback is
 * kept; a zero width (detached or hidden element) is ignored.
 *
 * @param ref - Ref to the element to measure.
 * @param fallbackWidth - Width returned until a positive measurement exists.
 * @returns The latest positive measured width, or `fallbackWidth`.
 */
export function useElementWidth<T extends Element>(
  ref: RefObject<T | null>,
  fallbackWidth: number,
): number {
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const initial = element.getBoundingClientRect().width;
    if (initial > 0) setWidth(initial);

    const observer = new ResizeObserver((entries) => {
      const next = entries[entries.length - 1]?.contentRect.width ?? 0;
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return width ?? fallbackWidth;
}
