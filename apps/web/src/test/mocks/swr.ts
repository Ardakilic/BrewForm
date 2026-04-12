/**
 * Mock for swr package.
 * Redirected via import_map.json during deno test runs.
 */

type SWRResponse<T = unknown> = {
  data: T;
  isLoading: boolean;
  error: unknown;
  mutate: () => Promise<T>;
  isValidating: boolean;
};

// Create a mutable mock object that tests can modify
const swrMock = {
  implementation: (..._args: unknown[]): SWRResponse<unknown> => ({
    data: undefined,
    isLoading: false,
    error: undefined,
    mutate: () => Promise.resolve(undefined),
    isValidating: false,
  }),
  implementationOnce: null as ((
    ...args: unknown[]
  ) => SWRResponse<unknown>) | null,
};

// Export a function that calls the current implementation
function useSWR<T = unknown>(...args: unknown[]): SWRResponse<T> {
  if (swrMock.implementationOnce) {
    const once = swrMock.implementationOnce;
    swrMock.implementationOnce = null;
    return once(...args) as SWRResponse<T>;
  }
  return swrMock.implementation(...args) as SWRResponse<T>;
}

// Allow tests to override the implementation
useSWR.mockImplementation = (
  fn: (...args: unknown[]) => SWRResponse<unknown>,
) => {
  swrMock.implementation = fn;
};

useSWR.mockImplementationOnce = (
  fn: (...args: unknown[]) => SWRResponse<unknown>,
) => {
  swrMock.implementationOnce = fn;
};

// Reset to default
useSWR.mockReset = () => {
  swrMock.implementation = (..._args: unknown[]): SWRResponse<unknown> => ({
    data: undefined,
    isLoading: false,
    error: undefined,
    mutate: () => Promise.resolve(undefined),
    isValidating: false,
  });
  swrMock.implementationOnce = null;
};

export default useSWR;

export const mutate = () => Promise.resolve(undefined);
