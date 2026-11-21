/**
 * Fail-soft decorator for a shared cache backend (cache-driver spec, "Cache
 * backend failures degrade to cache misses" and "Invalidations dropped during
 * an outage are reconciled on recovery").
 *
 * A failed `get` becomes a miss (`null`) and a failed `set` / `delete` /
 * `deleteByPrefix` a no-op, so a Valkey outage never turns into an HTTP error.
 * It logs one warn when the backend starts failing and one info when an
 * operation next succeeds (with the number of dropped operations). If any
 * invalidation was dropped, the first success after the outage triggers one
 * asynchronous `deleteByPrefix([])` (the `brewform:` namespace only; the
 * rate-limit root `brewform-rl:` is never touched), so stale entries are not
 * served after recovery.
 */
import { createLogger } from '../logger/index.ts';
import type { CacheProvider, CacheStatus } from './index.ts';

/** Module logger (exported for test spies). Never logs keys or values. */
export const log = createLogger('cache');

/** Wraps a shared {@link CacheProvider} so its failures degrade to misses. */
export class FailSoftCacheProvider implements CacheProvider {
  /** The wrapped provider (exposed for tests and diagnostics). */
  readonly inner: CacheProvider;
  private readonly driver: string;
  private degraded = false;
  private droppedOps = 0;
  private droppedInvalidations = false;

  /**
   * @param inner - The provider to protect (normally `RedisCacheProvider`).
   * @param driver - Driver name used in log context (default `redis`).
   */
  constructor(inner: CacheProvider, driver = 'redis') {
    this.inner = inner;
    this.driver = driver;
  }

  /** Read a key; a backend failure is a miss. */
  async get<T>(key: string[]): Promise<T | null> {
    try {
      const value = await this.inner.get<T>(key);
      this.succeeded();
      return value;
    } catch (err) {
      this.failed(err, false);
      return null;
    }
  }

  /** Write a key; a backend failure drops the write. */
  async set<T>(key: string[], value: T, options?: { ttlMs?: number }): Promise<void> {
    try {
      await this.inner.set(key, value, options);
      this.succeeded();
    } catch (err) {
      this.failed(err, false);
    }
  }

  /** Delete a key; a dropped delete schedules a reconciliation flush. */
  async delete(key: string[]): Promise<void> {
    try {
      await this.inner.delete(key);
      this.succeeded();
    } catch (err) {
      this.failed(err, true);
    }
  }

  /** Delete a prefix; a dropped delete schedules a reconciliation flush. */
  async deleteByPrefix(prefix: string[]): Promise<void> {
    try {
      await this.inner.deleteByPrefix(prefix);
      this.succeeded();
    } catch (err) {
      this.failed(err, true);
    }
  }

  /** Close the wrapped provider. */
  async close(): Promise<void> {
    await this.inner.close?.();
  }

  /** `degraded` while the backend is failing, otherwise `ok`. */
  status(): CacheStatus {
    return this.degraded ? 'degraded' : 'ok';
  }

  /**
   * Record a failed operation: count it, remember dropped invalidations, and
   * log the warn on the first failure of an outage.
   *
   * @param err - The backend error.
   * @param invalidation - Whether a `delete` / `deleteByPrefix` was dropped.
   */
  private failed(err: unknown, invalidation: boolean): void {
    this.droppedOps += 1;
    if (invalidation) this.droppedInvalidations = true;
    if (this.degraded) return;
    this.degraded = true;
    log.warn({ driver: this.driver, err }, 'Cache backend unavailable; serving cache misses');
  }

  /**
   * Record a successful operation: on the first success after an outage log the
   * recovery, and flush the namespace (asynchronously) when invalidations were
   * dropped.
   */
  private succeeded(): void {
    if (!this.degraded) return;
    this.degraded = false;
    log.info({ driver: this.driver, droppedOps: this.droppedOps }, 'Cache backend recovered');
    this.droppedOps = 0;
    if (!this.droppedInvalidations) return;
    this.droppedInvalidations = false;
    log.info(
      { driver: this.driver, reason: 'dropped-invalidations' },
      'Flushing the cache namespace after an outage',
    );
    this.inner.deleteByPrefix([]).catch((err: unknown) => this.failed(err, true));
  }
}
