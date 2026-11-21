import '../../test-setup.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reloadConfig } from '../../config/env.ts';
import type { RateLimitBackend } from './backend.ts';
import { POLICIES } from './policies.ts';
import {
  deleteRateLimitCounter,
  getRateLimitBackend,
  getRateLimitStoreStatus,
  log,
  resetRateLimitBackend,
  setRateLimitBackend,
} from './registry.ts';

describe('rate-limit registry', () => {
  afterEach(() => {
    resetRateLimitBackend();
    vi.restoreAllMocks();
  });

  it('starts with a memory backend', () => {
    expect(getRateLimitBackend().kind).toBe('memory');
    expect(getRateLimitStoreStatus()).toBe('memory');
  });

  it('installs and reports a replacement backend', () => {
    const fake: RateLimitBackend = {
      kind: 'redis',
      limiter: () => getRateLimitBackend().limiter(POLICIES.global),
      status: () => 'degraded',
      close: () => Promise.resolve(),
    };
    setRateLimitBackend(fake);
    expect(getRateLimitBackend()).toBe(fake);
    expect(getRateLimitStoreStatus()).toBe('degraded');
  });

  it('resets to a fresh memory backend with empty counters', async () => {
    const first = getRateLimitBackend();
    await first.limiter(POLICIES.contactIp).consume('k');
    resetRateLimitBackend();
    const second = getRateLimitBackend();
    expect(second).not.toBe(first);
    expect(await second.limiter(POLICIES.contactIp).get('k')).toBeNull();
  });

  it('reports disabled when RATE_LIMIT_ENABLED=false', () => {
    const original = process.env.RATE_LIMIT_ENABLED;
    try {
      process.env.RATE_LIMIT_ENABLED = 'false';
      reloadConfig();
      expect(getRateLimitStoreStatus()).toBe('disabled');
    } finally {
      if (original === undefined) delete process.env.RATE_LIMIT_ENABLED;
      else process.env.RATE_LIMIT_ENABLED = original;
      reloadConfig();
    }
  });

  it('deletes one counter and never throws on a store failure', async () => {
    const limiter = getRateLimitBackend().limiter(POLICIES.authLoginFailAccount);
    await limiter.penalty('hash');
    await deleteRateLimitCounter(POLICIES.authLoginFailAccount, 'hash');
    expect(await limiter.get('hash')).toBeNull();

    const error = vi.spyOn(log, 'error').mockImplementation(() => undefined);
    setRateLimitBackend({
      kind: 'redis',
      limiter: () => {
        throw new Error('store down');
      },
      status: () => 'degraded',
      close: () => Promise.resolve(),
    });
    await expect(
      deleteRateLimitCounter(POLICIES.authLoginFailAccount, 'hash'),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      { err: expect.any(Error), policy: 'auth-login-fail-account' },
      'deleteRateLimitCounter failed',
    );
  });
});
