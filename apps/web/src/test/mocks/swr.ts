/**
 * Mock for swr package.
 * Redirected via import_map.json during deno test runs.
 */

import { spy } from "@std/testing/mock";

const useSWR = spy(() => ({
  data: undefined,
  isLoading: false,
  error: undefined,
  mutate: () => Promise.resolve(undefined),
  isValidating: false,
}));

export default useSWR;

export const mutate = spy(() => Promise.resolve(undefined));
