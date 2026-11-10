/**
 * Valkey-backed CacheProvider (shared service, e.g. multi-replica production).
 *
 * Uses iovalkey (Valkey-native fork of ioredis). Values are JSON-serialized so
 * complex objects survive the round-trip; TTL maps 1:1 to Valkey PX (ms).
 * Prefix deletes use SCAN (never KEYS — it blocks the server).
 */
import { Valkey } from 'iovalkey';
import type { CacheProvider } from './index.ts';

/** Minimal Valkey command surface used by the provider (real client or test fake). */
export interface ValkeyClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: (string | number)[]): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  scanStream(options: { match: string; count: number }): AsyncIterable<string[]>;
  disconnect(): void;
}

export class ValkeyCacheProvider implements CacheProvider {
  private readonly client: ValkeyClient;

  constructor(client: ValkeyClient) {
    this.client = client;
  }

  async get<T>(key: string[]): Promise<T | null> {
    const raw = await this.client.get(key.join(':'));
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async set<T>(key: string[], value: T, options?: { ttlMs?: number }): Promise<void> {
    const k = key.join(':');
    const v = JSON.stringify(value);
    if (options?.ttlMs) await this.client.set(k, v, 'PX', options.ttlMs);
    else await this.client.set(k, v);
  }

  async delete(key: string[]): Promise<void> {
    await this.client.del(key.join(':'));
  }

  async deleteByPrefix(prefix: string[]): Promise<void> {
    // shortcut: unbounded SCAN loop; upgrade to batched UNLINK past ~100k keys.
    const stream = this.client.scanStream({ match: `${prefix.join(':')}*`, count: 100 });
    for await (const keys of stream) {
      if (keys.length > 0) await this.client.del(...keys);
    }
  }

  async close(): Promise<void> {
    this.client.disconnect();
  }
}

/** Build a Valkey-backed provider from a URL (e.g. valkey://valkey:6379). */
export function createValkeyProvider(url: string): ValkeyCacheProvider {
  return new ValkeyCacheProvider(new Valkey(url) as unknown as ValkeyClient);
}
