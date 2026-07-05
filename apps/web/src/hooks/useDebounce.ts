import { useEffect, useState } from 'react';
import { createLogger } from '@/utils/logger.ts';

const log = createLogger('useDebounce');

/**
 * Debounce a value by the specified delay.
 * Returns the debounced value, which updates only after
 * `delay` ms of inactivity.
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    log.trace?.(
      { valueType: typeof value, hasValue: !!value },
      'useDebounce timer set',
    );
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      log.trace?.({}, 'useDebounce timer cleared');
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
