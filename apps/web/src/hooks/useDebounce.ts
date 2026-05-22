import { useEffect, useState } from 'react';

/**
 * Debounce a value by the specified delay.
 * Returns the debounced value, which updates only after
 * `delay` ms of inactivity.
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
