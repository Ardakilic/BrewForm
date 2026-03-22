/**
 * Minimal vi.fn()-compatible mock function utility for Deno tests.
 * Provides call tracking + fluent mockReturnValue / mockResolvedValue / mockRejectedValue API.
 */

// deno-lint-ignore-file no-explicit-any

export interface MockFn<R = unknown> {
  (...args: unknown[]): R;
  calls: unknown[][];
  mock: { calls: unknown[][] };
  mockReturnValue(value: R): MockFn<R>;
  mockReturnValueOnce(value: R): MockFn<R>;
  mockResolvedValue<U>(value: U): MockFn<Promise<U>>;
  mockResolvedValueOnce<U>(value: U): MockFn<Promise<U>>;
  mockRejectedValue(err: unknown): MockFn<Promise<never>>;
  mockRejectedValueOnce(err: unknown): MockFn<Promise<never>>;
  mockImplementation(fn: (...args: unknown[]) => R): MockFn<R>;
  mockReset(): MockFn<R>;
}

export function mockFn<R = unknown>(
  defaultImpl?: (...args: unknown[]) => R,
): MockFn<R> {
  let _impl: ((...args: unknown[]) => any) | undefined = defaultImpl;
  const _onceQueue: Array<(...args: unknown[]) => any> = [];
  const calls: unknown[][] = [];

  function fn(...args: unknown[]): R {
    calls.push(args);
    if (_onceQueue.length > 0) {
      const once = _onceQueue.shift()!;
      return once(...args) as R;
    }
    if (_impl) return _impl(...args) as R;
    return undefined as R;
  }

  fn.calls = calls;
  fn.mock = { calls };

  fn.mockReturnValue = (value: R): MockFn<R> => {
    _impl = () => value;
    return fn as unknown as MockFn<R>;
  };

  fn.mockReturnValueOnce = (value: R): MockFn<R> => {
    _onceQueue.push(() => value);
    return fn as unknown as MockFn<R>;
  };

  fn.mockResolvedValue = <U>(value: U): MockFn<Promise<U>> => {
    _impl = () => Promise.resolve(value);
    return fn as unknown as MockFn<Promise<U>>;
  };

  fn.mockResolvedValueOnce = <U>(value: U): MockFn<Promise<U>> => {
    _onceQueue.push(() => Promise.resolve(value));
    return fn as unknown as MockFn<Promise<U>>;
  };

  fn.mockRejectedValue = (err: unknown): MockFn<Promise<never>> => {
    _impl = () => Promise.reject(err);
    return fn as unknown as MockFn<Promise<never>>;
  };

  fn.mockRejectedValueOnce = (err: unknown): MockFn<Promise<never>> => {
    _onceQueue.push(() => Promise.reject(err));
    return fn as unknown as MockFn<Promise<never>>;
  };

  fn.mockImplementation = (impl: (...args: unknown[]) => R): MockFn<R> => {
    _impl = impl;
    return fn as unknown as MockFn<R>;
  };

  fn.mockReset = (): MockFn<R> => {
    calls.length = 0;
    _onceQueue.length = 0;
    _impl = defaultImpl;
    return fn as unknown as MockFn<R>;
  };

  return fn as unknown as MockFn<R>;
}
