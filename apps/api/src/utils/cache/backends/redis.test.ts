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
import { RedisBackend } from "./redis.ts";
import type { CacheOptions } from "../types.ts";

function createMockClient() {
  const store = new Map<string, string>();
  // deno-lint-ignore no-explicit-any
  const calls: any[] = [];

  const client = {
    set(...args: unknown[]) {
      calls.push({ cmd: "set", args });
      const [key, value] = args as [string, string, { EX?: number }?];
      store.set(key, value);
      return Promise.resolve("OK");
    },
    get(key: string) {
      calls.push({ cmd: "get", args: [key] });
      return Promise.resolve(store.get(key) ?? null);
    },
    mGet(keys: string[]) {
      calls.push({ cmd: "mGet", args: [keys] });
      return Promise.resolve(keys.map((k) => store.get(k) ?? null));
    },
    multi() {
      const ops: { cmd: string; args: unknown[] }[] = [];
      const multi = {
        set(...args: unknown[]) {
          ops.push({ cmd: "set", args });
          return multi;
        },
        exec() {
          calls.push({ cmd: "multi", ops: [...ops] });
          for (const op of ops) {
            if (op.cmd === "set") {
              const [key, value] = op.args as [
                string,
                string,
                { EX?: number }?,
              ];
              store.set(key, value);
            }
          }
          return Promise.resolve([]);
        },
      };
      return multi;
    },
    del(keys: string | string[]) {
      const arr = Array.isArray(keys) ? keys : [keys];
      calls.push({ cmd: "del", args: [arr] });
      let deleted = 0;
      for (const k of arr) {
        if (store.delete(k)) deleted++;
      }
      return Promise.resolve(deleted);
    },
    async *scanIterator(_opts: { MATCH: string; COUNT: number }) {
      const keys = [...store.keys()].filter((k) =>
        k.match(
          new RegExp(
            "^" + _opts.MATCH.replace(/\*/g, ".*").replace(/:/g, ":") + "$",
          ),
        )
      );
      yield keys;
    },
    exists(key: string) {
      return Promise.resolve(store.has(key) ? 1 : 0);
    },
    connect() {
      return Promise.resolve();
    },
    on() {},
    ping() {
      return Promise.resolve("PONG");
    },
    disconnect() {
      return Promise.resolve();
    },
  };

  return { client, store, calls };
}

describe("RedisBackend — key serialization", () => {
  it("converts array key to colon-joined string", () => {
    expect(keyToString(["recipes", "latest"])).toBe("recipes:latest");
    expect(keyToString(["user", "abc123"])).toBe("user:abc123");
    expect(keyToString(["recipe", "id", 1])).toBe("recipe:id:1");
  });

  it("generates correct SCAN patterns for invalidateByPrefix", () => {
    expect(prefixToPattern(["recipes"])).toBe("recipes*");
    expect(prefixToPattern(["taste-notes"])).toBe("taste-notes*");
    expect(prefixToPattern([])).toBe("*");
  });
});

describe("RedisBackend — JSON serialization", () => {
  it("serializes complex objects to JSON", () => {
    const obj = { id: "abc", tags: ["a", "b"], count: 0, nested: { ok: true } };
    const serialized = JSON.stringify(obj);
    const deserialized = JSON.parse(serialized);
    expect(deserialized).toEqual(obj);
  });

  it("handles null values as miss", () => {
    const raw: string | null = null;
    const result = raw === null ? undefined : JSON.parse(raw);
    expect(result).toBeUndefined();
  });

  it("handles invalid JSON as miss", () => {
    let result: unknown;
    try {
      result = JSON.parse("not-valid-json");
    } catch {
      result = undefined;
    }
    expect(result).toBeUndefined();
  });
});

describe("RedisBackend — TTL calculation", () => {
  it("sums ttlSeconds and staleWhileRevalidateSeconds", () => {
    const options = { ttlSeconds: 300, staleWhileRevalidateSeconds: 300 };
    const total = (options.ttlSeconds ?? 0) +
      (options.staleWhileRevalidateSeconds ?? options.ttlSeconds ?? 0);
    expect(total).toBe(600);
  });

  it("defaults staleWhileRevalidate to ttlSeconds", () => {
    const options: CacheOptions = { ttlSeconds: 120 };
    const total = (options.ttlSeconds ?? 0) +
      (options.staleWhileRevalidateSeconds ?? options.ttlSeconds ?? 0);
    expect(total).toBe(240);
  });

  it("returns 0 when no TTL", () => {
    const options: CacheOptions = {};
    const total = (options.ttlSeconds ?? 0) +
      (options.staleWhileRevalidateSeconds ?? options.ttlSeconds ?? 0);
    expect(total).toBe(0);
  });

  it("handles only staleWhileRevalidate (no ttl)", () => {
    const options: CacheOptions = { staleWhileRevalidateSeconds: 600 };
    const total = (options.ttlSeconds ?? 0) +
      (options.staleWhileRevalidateSeconds ?? options.ttlSeconds ?? 0);
    expect(total).toBe(600);
  });
});

describe("RedisBackend — method calls", () => {
  function createBackend() {
    const mock = createMockClient();
    const backend = new RedisBackend({
      cacheRedisUrl: "redis://localhost:6379",
    });
    // Inject mock client directly
    (backend as unknown as { client: unknown }).client = mock.client;
    return { backend, mock };
  }

  it("set with TTL uses correct EX", async () => {
    const { backend, mock } = await createBackend();
    const options: CacheOptions = {
      ttlSeconds: 300,
      staleWhileRevalidateSeconds: 300,
    };
    await backend.set(["recipe", "abc"], { title: "test" }, options);

    expect(mock.calls[0].cmd).toBe("set");
    expect(mock.calls[0].args[0]).toBe("recipe:abc");
    expect(mock.calls[0].args[2]).toEqual({ EX: 600 });
  });

  it("set without stale uses double ttlSeconds", async () => {
    const { backend, mock } = await createBackend();
    await backend.set(["recipe", "abc"], { title: "test" }, {
      ttlSeconds: 120,
    });

    expect(mock.calls[0].args[2]).toEqual({ EX: 240 });
  });

  it("set with no expiry omits EX option", async () => {
    const { backend, mock } = await createBackend();
    await backend.set(["recipe", "abc"], { title: "test" });

    expect(mock.calls[0].cmd).toBe("set");
    expect(mock.calls[0].args[2]).toBeUndefined();
  });

  it("get parses JSON response", async () => {
    const { backend, mock } = await createBackend();
    mock.store.set("recipe:abc", JSON.stringify({ title: "test" }));
    const result = await backend.get<{ title: string }>(["recipe", "abc"]);

    expect(result).toEqual({ title: "test" });
    expect(mock.calls[0].cmd).toBe("get");
    expect(mock.calls[0].args[0]).toBe("recipe:abc");
  });

  it("get returns undefined on null", async () => {
    const { backend } = await createBackend();
    const result = await backend.get(["recipe", "missing"]);
    expect(result).toBeUndefined();
  });

  it("get returns undefined on invalid JSON", async () => {
    const { backend, mock } = await createBackend();
    mock.store.set("recipe:bad", "not-json");
    const result = await backend.get(["recipe", "bad"]);
    expect(result).toBeUndefined();
  });

  it("getMany uses mGet for batch read", async () => {
    const { backend, mock } = await createBackend();
    mock.store.set("recipes:latest", JSON.stringify(1));
    mock.store.set("recipes:popular", JSON.stringify(2));
    const results = await backend.getMany<number>([
      ["recipes", "latest"],
      ["recipes", "popular"],
    ]);

    expect(mock.calls[0].cmd).toBe("mGet");
    expect(results).toEqual([1, 2]);
  });

  it("getMany handles missing keys", async () => {
    const { backend, mock } = await createBackend();
    mock.store.set("recipes:latest", JSON.stringify(1));
    const results = await backend.getMany<number>([
      ["recipes", "latest"],
      ["recipes", "missing"],
    ]);

    expect(results).toEqual([1, undefined]);
  });

  it("getMany returns empty array for empty input", async () => {
    const { backend, mock } = await createBackend();
    const results = await backend.getMany<number>([]);

    expect(mock.calls.length).toBe(0);
    expect(results).toEqual([]);
  });

  it("setMany uses multi/exec pipeline", async () => {
    const { backend, mock } = await createBackend();
    await backend.setMany([
      {
        key: ["a"],
        value: 1,
        options: { ttlSeconds: 100, staleWhileRevalidateSeconds: 100 },
      },
      { key: ["b"], value: 2, options: { ttlSeconds: 200 } },
    ]);

    expect(mock.calls[0].cmd).toBe("multi");
    expect(mock.calls[0].ops.length).toBe(2);
    expect(mock.calls[0].ops[0].args[0]).toBe("a");
    expect(mock.calls[0].ops[0].args[2]).toEqual({ EX: 200 });
    expect(mock.calls[0].ops[1].args[0]).toBe("b");
    expect(mock.calls[0].ops[1].args[2]).toEqual({ EX: 400 });
  });

  it("setMany with empty array does nothing", async () => {
    const { backend, mock } = await createBackend();
    await backend.setMany([]);

    expect(mock.calls.length).toBe(0);
  });

  it("delete removes key", async () => {
    const { backend, mock } = await createBackend();
    mock.store.set("recipes:latest", "value");
    await backend.delete(["recipes", "latest"]);

    expect(mock.calls[0].cmd).toBe("del");
    expect(mock.calls[0].args[0]).toEqual(["recipes:latest"]);
    expect(mock.store.has("recipes:latest")).toBe(false);
  });

  it("invalidateByPrefix scans and deletes", async () => {
    const { backend, mock } = await createBackend();
    mock.store.set("recipes:latest", "a");
    mock.store.set("recipes:popular", "b");
    mock.store.set("taste-notes:all", "c");

    const count = await backend.invalidateByPrefix(["recipes"]);

    expect(count).toBe(2);
    expect(mock.store.has("recipes:latest")).toBe(false);
    expect(mock.store.has("recipes:popular")).toBe(false);
    expect(mock.store.has("taste-notes:all")).toBe(true);
  });

  it("invalidateByPrefix returns 0 when no match", async () => {
    const { backend, mock } = await createBackend();
    mock.store.set("other:key", "x");
    const count = await backend.invalidateByPrefix(["recipes"]);

    expect(count).toBe(0);
  });

  it("has returns true/false correctly", async () => {
    const { backend, mock } = await createBackend();
    mock.store.set("recipes:latest", "value");

    expect(await backend.has(["recipes", "latest"])).toBe(true);
    expect(await backend.has(["recipes", "missing"])).toBe(false);
  });

  it("ping returns true on PONG", async () => {
    const { backend } = await createBackend();
    const result = await backend.ping();
    expect(result).toBe(true);
  });

  it("ping returns false on error", async () => {
    const { backend, mock } = await createBackend();
    mock.client.ping = () => Promise.reject(new Error("down"));
    const result = await backend.ping();
    expect(result).toBe(false);
  });

  describe("close", () => {
    it("calls disconnect", async () => {
      const { backend, mock } = await createBackend();
      let disconnected = false;
      mock.client.disconnect = () => {
        disconnected = true;
        return Promise.resolve();
      };

      await backend.close();

      expect(disconnected).toBe(true);
    });

    it("ignores disconnect errors", async () => {
      const { backend, mock } = await createBackend();
      mock.client.disconnect = () => {
        throw new Error("already closed");
      };

      await expect(backend.close()).resolves.toBeUndefined();
    });
  });
});
