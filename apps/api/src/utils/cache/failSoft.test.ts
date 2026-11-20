import '../../test-setup.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FailSoftCacheProvider, log } from './failSoft.ts';
import type { CacheProvider } from './index.ts';

/**
 * A cache backend double whose every method rejects while `failing` is true
 * (like a stopped Valkey) and succeeds otherwise.
 */
function createToggleBackend() {
  const state = { failing: false };
  const outage = () => Promise.reject(new Error('Connection is closed.'));
  const backend = {
    state,
    get: vi.fn(<T>(_key: string[]) =>
      state.failing ? outage() : Promise.resolve(null as T | null),
    ),
    set: vi.fn(() => (state.failing ? outage() : Promise.resolve())),
    delete: vi.fn(() => (state.failing ? outage() : Promise.resolve())),
    deleteByPrefix: vi.fn(() => (state.failing ? outage() : Promise.resolve())),
    close: vi.fn(() => Promise.resolve()),
  };
  return backend as typeof backend & CacheProvider;
}

/** Let queued microtasks (the asynchronous reconciliation flush) run. */
async function flushMicrotasks() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('FailSoftCacheProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('turns a failed get into a miss and failed writes into no-ops', async () => {
    vi.spyOn(log, 'warn').mockImplementation(() => {});
    const backend = createToggleBackend();
    const cache = new FailSoftCacheProvider(backend);
    backend.state.failing = true;
    await expect(cache.get(['a'])).resolves.toBeNull();
    await expect(cache.set(['a'], 1, { ttlMs: 1000 })).resolves.toBeUndefined();
    await expect(cache.delete(['a'])).resolves.toBeUndefined();
    await expect(cache.deleteByPrefix(['a'])).resolves.toBeUndefined();
    expect(cache.status()).toBe('degraded');
  });

  it('logs one warn per outage and one info with droppedOps on the next success', async () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(log, 'info').mockImplementation(() => {});
    const backend = createToggleBackend();
    const cache = new FailSoftCacheProvider(backend);
    backend.state.failing = true;
    for (let i = 0; i < 100; i++) await cache.get(['k', String(i)]);
    for (let i = 0; i < 100; i++) await cache.set(['k', String(i)], i);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toEqual({ driver: 'redis', err: expect.any(Error) });

    backend.state.failing = false;
    await cache.get(['k', '0']);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][0]).toEqual({ driver: 'redis', droppedOps: 200 });
    expect(cache.status()).toBe('ok');
  });

  it('flushes the cache namespace once, asynchronously, after an outage that dropped an invalidation', async () => {
    vi.spyOn(log, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(log, 'info').mockImplementation(() => {});
    const backend = createToggleBackend();
    const cache = new FailSoftCacheProvider(backend);
    backend.state.failing = true;
    await cache.delete(['recipes', 'detail', 'r1']);
    await cache.get(['recipes', 'detail', 'r1']);

    backend.state.failing = false;
    await cache.get(['recipes', 'detail', 'r1']);
    await cache.get(['recipes', 'detail', 'r1']);
    await flushMicrotasks();

    expect(backend.deleteByPrefix).toHaveBeenCalledTimes(1);
    expect(backend.deleteByPrefix).toHaveBeenCalledWith([]);
    expect(info).toHaveBeenCalledWith(
      { driver: 'redis', reason: 'dropped-invalidations' },
      expect.any(String),
    );
  });

  it('does not flush after an outage with only reads', async () => {
    vi.spyOn(log, 'warn').mockImplementation(() => {});
    vi.spyOn(log, 'info').mockImplementation(() => {});
    const backend = createToggleBackend();
    const cache = new FailSoftCacheProvider(backend);
    backend.state.failing = true;
    for (let i = 0; i < 5; i++) await cache.get(['k']);
    backend.state.failing = false;
    await cache.get(['k']);
    await flushMicrotasks();
    expect(backend.deleteByPrefix).not.toHaveBeenCalled();
  });

  it('passes successful calls through and closes the inner provider', async () => {
    const backend = createToggleBackend();
    const cache = new FailSoftCacheProvider(backend);
    await cache.set(['a'], 1, { ttlMs: 5 });
    expect(backend.set).toHaveBeenCalledWith(['a'], 1, { ttlMs: 5 });
    await cache.close();
    expect(backend.close).toHaveBeenCalledTimes(1);
    expect(cache.status()).toBe('ok');
  });
});
