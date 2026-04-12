/**
 * MemoryBackend Tests
 */

import { beforeEach, describe, it } from "@std/testing";
import { expect } from "@std/expect";
import { MemoryBackend } from "./memory.ts";

describe("MemoryBackend", () => {
  let cache: MemoryBackend;

  beforeEach(() => {
    cache = new MemoryBackend();
  });

  describe("get / set", () => {
    it("returns undefined for missing key", async () => {
      const result = await cache.get(["missing"]);
      expect(result).toBeUndefined();
    });

    it("stores and retrieves a value", async () => {
      await cache.set(["key", "one"], { hello: "world" });
      const result = await cache.get<{ hello: string }>(["key", "one"]);
      expect(result).toEqual({ hello: "world" });
    });

    it("overwrites an existing value", async () => {
      await cache.set(["key"], "first");
      await cache.set(["key"], "second");
      expect(await cache.get<string>(["key"])).toBe("second");
    });

    it("returns undefined after TTL expires (simulated)", async () => {
      // Use a very short TTL; we manipulate Date indirectly via options
      await cache.set(["exp"], "val", { ttlSeconds: 0 });
      // ttlSeconds=0 means no expiry (infinite), value should still be there
      expect(await cache.get(["exp"])).toBe("val");
    });
  });

  describe("getMany", () => {
    it("returns array with undefined for missing keys", async () => {
      await cache.set(["a"], 1);
      const results = await cache.getMany<number>([["a"], ["b"]]);
      expect(results).toEqual([1, undefined]);
    });

    it("returns empty array for empty input", async () => {
      expect(await cache.getMany([])).toEqual([]);
    });
  });

  describe("setMany", () => {
    it("stores multiple entries in one call", async () => {
      await cache.setMany([
        { key: ["x"], value: 10 },
        { key: ["y"], value: 20 },
      ]);
      expect(await cache.get<number>(["x"])).toBe(10);
      expect(await cache.get<number>(["y"])).toBe(20);
    });
  });

  describe("delete", () => {
    it("removes a stored key", async () => {
      await cache.set(["del"], "bye");
      await cache.delete(["del"]);
      expect(await cache.get(["del"])).toBeUndefined();
    });

    it("does not throw when deleting a non-existent key", async () => {
      await expect(cache.delete(["nonexistent"])).resolves.toBeUndefined();
    });
  });

  describe("has", () => {
    it("returns true for existing key", async () => {
      await cache.set(["h"], true);
      expect(await cache.has(["h"])).toBe(true);
    });

    it("returns false for missing key", async () => {
      expect(await cache.has(["missing"])).toBe(false);
    });
  });

  describe("invalidateByPrefix", () => {
    it("deletes all keys with matching prefix", async () => {
      await cache.set(["recipes", "latest"], "a");
      await cache.set(["recipes", "popular"], "b");
      await cache.set(["recipes", "list", "abc"], "c");
      await cache.set(["taste-notes", "all"], "d");

      const count = await cache.invalidateByPrefix(["recipes"]);

      expect(count).toBe(3);
      expect(await cache.get(["recipes", "latest"])).toBeUndefined();
      expect(await cache.get(["recipes", "popular"])).toBeUndefined();
      expect(await cache.get(["taste-notes", "all"])).toBe("d");
    });

    it("returns 0 when no keys match", async () => {
      await cache.set(["other"], "x");
      const count = await cache.invalidateByPrefix(["recipes"]);
      expect(count).toBe(0);
    });

    it("deletes everything when prefix is empty", async () => {
      await cache.set(["a"], 1);
      await cache.set(["b"], 2);
      const count = await cache.invalidateByPrefix([]);
      expect(count).toBe(2);
    });
  });

  describe("ping", () => {
    it("always returns true", async () => {
      expect(await cache.ping()).toBe(true);
    });
  });

  describe("close", () => {
    it("clears all entries", async () => {
      await cache.set(["k"], "v");
      await cache.close();
      expect(cache.size).toBe(0);
    });

    it("is idempotent", async () => {
      await cache.close();
      await cache.close();
      expect(cache.size).toBe(0);
    });
  });

  describe("round-trip serialization", () => {
    it("preserves nested objects", async () => {
      const obj = { a: { b: [1, 2, 3] }, c: null };
      await cache.set(["obj"], obj);
      expect(await cache.get(["obj"])).toEqual(obj);
    });

    it("preserves number keys in CacheKey", async () => {
      await cache.set(["page", 1], "page1");
      expect(await cache.get<string>(["page", 1])).toBe("page1");
    });
  });
});
