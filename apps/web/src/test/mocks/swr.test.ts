/**
 * Mock SWR Tests
 */

import { describe, it } from "@std/testing";
import { expect } from "@std/expect";
import useSWR, { mutate } from "./swr.ts";

describe("Mock SWR", () => {
  it("returns default structure", () => {
    const result = useSWR("test-key");
    expect("data" in result).toBe(true);
    expect("isLoading" in result).toBe(true);
    expect("error" in result).toBe(true);
    expect("mutate" in result).toBe(true);
    expect("isValidating" in result).toBe(true);
  });

  it("default data is undefined", () => {
    const result = useSWR("test-key");
    expect(result.data).toBe(undefined);
  });

  it("default isLoading is false", () => {
    const result = useSWR("test-key");
    expect(result.isLoading).toBe(false);
  });

  it("default error is undefined", () => {
    const result = useSWR("test-key");
    expect(result.error).toBeUndefined();
  });

  it("mutate returns a promise", async () => {
    const result = useSWR("test-key");
    const promise = result.mutate();
    expect(promise).toBeInstanceOf(Promise);
    await promise;
  });

  it("mutate export is callable", async () => {
    const promise = mutate();
    expect(promise).toBeInstanceOf(Promise);
    await promise;
  });

  it("mockImplementation can be overridden", () => {
    const customResult = { data: { test: true }, isLoading: true, error: null, mutate: () => Promise.resolve(), isValidating: false };
    try {
      useSWR.mockImplementationOnce(() => customResult);
      const result = useSWR("key");
      expect(result.data).toEqual({ test: true });
      expect(result.isLoading).toBe(true);
    } finally {
      useSWR.mockReset();
    }
  });

  it("mockReset restores defaults", () => {
    useSWR.mockReset();
    const result = useSWR("key");
    expect(result.data).toBeUndefined();
    expect(result.isLoading).toBe(false);
  });
});