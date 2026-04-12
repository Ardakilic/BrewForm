/**
 * DenoKvBackend Tests
 *
 * Uses an in-memory Deno KV instance (no path = in-memory).
 * Requires `"unstable": ["kv"]` in deno.json.
 */

import { afterAll, beforeAll, beforeEach, describe, it } from "@std/testing";
import { expect } from "@std/expect";
import { DenoKvBackend } from "./deno-kv.ts";

describe("DenoKvBackend", () => {
  let backend: DenoKvBackend;

  beforeAll(async () => {
    // Pass undefined path → in-memory Deno KV
    backend = new DenoKvBackend({ cacheDenoKvPath: undefined });
    await backend.init();
  });

  afterAll(async () => {
    await backend.close();
  });

  beforeEach(async () => {
    // Clear between tests by listing and deleting everything
    await backend.invalidateByPrefix([]);
  });

  describe("get / set", () => {
    it("returns undefined for missing key", async () => {
      expect(await backend.get(["missing"])).toBeUndefined();
    });

    it("stores and retrieves a value", async () => {
      await backend.set(["kv", "hello"], { v: 42 });
      expect(await backend.get(["kv", "hello"])).toEqual({ v: 42 });
    });

    it("overwrites an existing value", async () => {
      await backend.set(["kv", "ow"], "first");
      await backend.set(["kv", "ow"], "second");
      expect(await backend.get<string>(["kv", "ow"])).toBe("second");
    });
  });

  describe("getMany", () => {
    it("returns array with undefined for missing keys", async () => {
      await backend.set(["kv", "a"], 1);
      const results = await backend.getMany<number>([["kv", "a"], ["kv", "b"]]);
      expect(results).toEqual([1, undefined]);
    });

    it("returns empty array for empty input", async () => {
      expect(await backend.getMany([])).toEqual([]);
    });
  });

  describe("setMany", () => {
    it("stores multiple entries atomically", async () => {
      await backend.setMany([
        { key: ["kv", "x"], value: 10 },
        { key: ["kv", "y"], value: 20 },
      ]);
      expect(await backend.get<number>(["kv", "x"])).toBe(10);
      expect(await backend.get<number>(["kv", "y"])).toBe(20);
    });
  });

  describe("delete", () => {
    it("removes a stored key", async () => {
      await backend.set(["kv", "del"], "bye");
      await backend.delete(["kv", "del"]);
      expect(await backend.get(["kv", "del"])).toBeUndefined();
    });

    it("does not throw when deleting a non-existent key", async () => {
      await expect(backend.delete(["kv", "ghost"])).resolves.toBeUndefined();
    });
  });

  describe("has", () => {
    it("returns true for existing key", async () => {
      await backend.set(["kv", "h"], true);
      expect(await backend.has(["kv", "h"])).toBe(true);
    });

    it("returns false for missing key", async () => {
      expect(await backend.has(["kv", "missing"])).toBe(false);
    });
  });

  describe("invalidateByPrefix", () => {
    it("deletes all keys with matching prefix", async () => {
      await backend.set(["recipes", "latest"], "a");
      await backend.set(["recipes", "popular"], "b");
      await backend.set(["taste-notes", "all"], "c");

      const count = await backend.invalidateByPrefix(["recipes"]);

      expect(count).toBe(2);
      expect(await backend.get(["recipes", "latest"])).toBeUndefined();
      expect(await backend.get(["taste-notes", "all"])).toBe("c");
    });

    it("returns 0 when no keys match", async () => {
      await backend.set(["other", "key"], "x");
      const count = await backend.invalidateByPrefix(["nope"]);
      expect(count).toBe(0);
    });
  });

  describe("ping", () => {
    it("returns true for healthy backend", async () => {
      expect(await backend.ping()).toBe(true);
    });
  });

  describe("close", () => {
    it("is idempotent — calling close twice does not throw", async () => {
      const b = new DenoKvBackend({ cacheDenoKvPath: undefined });
      await b.init();
      await b.close();
      // second close should not throw
      await expect(b.close()).resolves.toBeUndefined();
    });
  });
});
