/**
 * Mock for swr package.
 * Redirected via import_map.json during deno test runs.
 */

import { mockFn } from '../mock-fn.ts';

const useSWR = mockFn(() => ({
  data: undefined,
  isLoading: false,
  error: undefined,
  mutate: () => Promise.resolve(undefined),
  isValidating: false,
}));

export default useSWR;

export const mutate = mockFn(() => Promise.resolve(undefined));
