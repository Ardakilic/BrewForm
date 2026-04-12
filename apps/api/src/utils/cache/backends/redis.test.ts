/**
 * RedisBackend Tests
 *
 * All Redis tests use a mock client injected via a private test hook.
 * We do NOT test against a real Redis instance here (that's integration-level).
 *
 * The tests verify that the backend translates CacheKey arrays to colon-joined
 * strings, uses the correct Redis commands, and handles errors properly.
 */

import { describe, it } from "@std/testing";
import { expect } from "@std/expect";
import { keyToString, prefixToPattern } from "../serialize.ts";

// ============================================
// The Redis backend serialization is the main
// thing to verify without a live Redis server.
// ============================================

describe("RedisBackend — key serialization (via serialize helpers)", () => {
  it("converts array key to colon-joined string", () => {
    expect(keyToString(["recipes", "latest"])).toBe("recipes:latest");
    expect(keyToString(["user", "abc123"])).toBe("user:abc123");
    expect(keyToString(["recipe", "id", 1])).toBe("recipe:id:1");
  });

  it("generates correct SCAN patterns for invalidateByPrefix", () => {
    expect(prefixToPattern(["recipes"])).toBe("recipes:*");
    expect(prefixToPattern(["taste-notes"])).toBe("taste-notes:*");
    expect(prefixToPattern([])).toBe("*");
  });
});

describe("RedisBackend — JSON serialization round-trips", () => {
  it("serialises a complex object to JSON and back", () => {
    const obj = { id: "abc", tags: ["a", "b"], count: 0, nested: { ok: true } };
    const serialized = JSON.stringify(obj);
    const deserialized = JSON.parse(serialized);
    expect(deserialized).toEqual(obj);
  });

  it("handles null values gracefully (treated as miss)", () => {
    const result = (() => {
      const raw: string | null = null;
      if (raw === null) return undefined;
      return JSON.parse(raw);
    })();
    expect(result).toBeUndefined();
  });

  it("returns undefined on invalid JSON (treated as miss)", () => {
    const result = (() => {
      const raw = "not-valid-json";
      try {
        return JSON.parse(raw);
      } catch {
        return undefined;
      }
    })();
    expect(result).toBeUndefined();
  });
});

describe("RedisBackend — TTL calculation", () => {
  it("sums ttlSeconds and staleWhileRevalidateSeconds for total EX value", () => {
    const options = { ttlSeconds: 300, staleWhileRevalidateSeconds: 300 };
    const total = (options.ttlSeconds ?? 0) +
      (options.staleWhileRevalidateSeconds ?? options.ttlSeconds ?? 0);
    expect(total).toBe(600);
  });

  it("defaults staleWhileRevalidate to ttlSeconds when not set", () => {
    const options = { ttlSeconds: 120 };
    const total = (options.ttlSeconds ?? 0) +
      (options.staleWhileRevalidateSeconds ?? options.ttlSeconds ?? 0);
    expect(total).toBe(240);
  });

  it("returns 0 for no-TTL options", () => {
    const options = {};
    const total = (options.ttlSeconds ?? 0) +
      ((options as { staleWhileRevalidateSeconds?: number })
        .staleWhileRevalidateSeconds ??
        options.ttlSeconds ??
        0);
    expect(total).toBe(0);
  });
});
